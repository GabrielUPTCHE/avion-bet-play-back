// services/mongodb-service.ts
import { MongoClient, Db, Collection } from 'mongodb';

// Interfaces para las colecciones
export interface GameRound {
  round_id: string;
  start_time: Date;
  end_time: Date;
  crash_multiplier: number;
  status: 'completed' | 'cancelled';
  total_bets: number;
  total_bet_amount: number;
  total_winnings: number;
  winner_count: number;
  created_at: Date;
  server_instance: string;
}

export interface BetRecord {
  bet_id: string;
  round_id: string;
  player_id: string;
  username: string;
  bet_amount: number;
  bet_time: Date;
  cash_out_multiplier?: number;
  cash_out_time?: Date;
  winnings?: number;
  is_winner: boolean;
  is_cashed_out: boolean;
  created_at: Date;
  server_instance: string;
}

export interface PlayerStats {
  player_id: string;
  username: string;
  total_bets: number;
  total_bet_amount: number;
  total_winnings: number;
  total_losses: number;
  win_rate: number;
  biggest_win?: number;
  biggest_win_multiplier?: number;
  average_bet: number;
  rounds_played: number;
  first_played: Date;
  last_played: Date;
  updated_at: Date;
}

export interface GameStats {
  stat_type: 'daily' | 'weekly' | 'monthly' | 'all_time';
  date: Date;
  total_rounds: number;
  total_bets: number;
  total_bet_amount: number;
  total_winnings: number;
  house_edge: number;
  average_crash_multiplier: number;
  unique_players: number;
  peak_concurrent_players: number;
  created_at: Date;
  updated_at: Date;
}

export class MongoDBService {
  private client: MongoClient;
  private db: Db;
  private connected: boolean = false;
  private instanceId: string;

  // Colecciones
  private gameRoundsCollection: Collection<GameRound>;
  private betsCollection: Collection<BetRecord>;
  private playerStatsCollection: Collection<PlayerStats>;
  private gameStatsCollection: Collection<GameStats>;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
    
    // Connection string para Replica Set con failover automático
    const connectionString = process.env.MONGODB_URL || 
      'mongodb://mongodb-primary:27017,mongodb-secondary1:27017,mongodb-secondary2:27017/aviator_game?replicaSet=aviator-replica&readPreference=secondaryPreferred';
    
    this.client = new MongoClient(connectionString, {
      maxPoolSize: 10,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      serverSelectionTimeoutMS: 5000,
      heartbeatFrequencyMS: 10000,
      // Preferir lectura en secundarios para no sobrecargar el primary
      readPreference: 'secondaryPreferred'
    });
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();
      
      // Test de conexión
      await this.client.db("admin").admin().ping();
      
      this.db = this.client.db('aviator_game');
      
      // Inicializar colecciones
      this.gameRoundsCollection = this.db.collection<GameRound>('game_rounds');
      this.betsCollection = this.db.collection<BetRecord>('bets');
      this.playerStatsCollection = this.db.collection<PlayerStats>('player_stats');
      this.gameStatsCollection = this.db.collection<GameStats>('game_stats');
      
      this.connected = true;
      console.log(`🍃 [${this.instanceId}] MongoDB conectado al Replica Set`);
      
      // Mostrar información del replica set
      const replicaStatus = await this.db.admin().replSetGetStatus();
      const primary = replicaStatus.members.find(member => member.stateStr === 'PRIMARY');
      console.log(`👑 [${this.instanceId}] Primary node: ${primary?.name || 'Desconocido'}`);
      
    } catch (error) {
      console.error(`❌ [${this.instanceId}] Error conectando a MongoDB:`, error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.connected = false;
      console.log(`🔌 [${this.instanceId}] MongoDB desconectado`);
    }
  }

  // ===== MÉTODOS PARA RONDAS =====
  async saveGameRound(roundData: Omit<GameRound, 'created_at' | 'server_instance'>): Promise<void> {
    if (!this.connected) throw new Error('MongoDB no conectado');

    const round: GameRound = {
      ...roundData,
      created_at: new Date(),
      server_instance: this.instanceId
    };

    // Usar writeConcern para asegurar que se escriba en el primary
    await this.gameRoundsCollection.insertOne(round, { 
      writeConcern: { w: 'majority', j: true } 
    });
    
    console.log(`💾 [${this.instanceId}] Ronda guardada: ${round.round_id} - Crash: ${round.crash_multiplier}x`);
  }

  // ===== MÉTODOS PARA APUESTAS =====
  async saveBets(bets: Omit<BetRecord, 'created_at' | 'server_instance'>[]): Promise<void> {
    if (!this.connected || bets.length === 0) return;

    const betsWithMetadata: BetRecord[] = bets.map(bet => ({
      ...bet,
      created_at: new Date(),
      server_instance: this.instanceId
    }));

    await this.betsCollection.insertMany(betsWithMetadata, { 
      writeConcern: { w: 'majority', j: true } 
    });
    
    console.log(`💰 [${this.instanceId}] ${bets.length} apuestas guardadas`);
  }

  // ===== MÉTODOS PARA ESTADÍSTICAS DE JUGADORES =====
  async upsertPlayerStats(playerId: string, username: string, updateData: Partial<PlayerStats>): Promise<void> {
    if (!this.connected) throw new Error('MongoDB no conectado');

    const now = new Date();
    
    await this.playerStatsCollection.updateOne(
      { player_id: playerId },
      {
        $set: {
          username: username,
          ...updateData,
          updated_at: now
        },
        $setOnInsert: {
          player_id: playerId,
          first_played: now
        }
      },
      { 
        upsert: true,
        writeConcern: { w: 'majority', j: true }
      }
    );
    
    console.log(`📊 [${this.instanceId}] Stats actualizadas para ${username}`);
  }

  // ===== MÉTODOS DE CONSULTA (USAR SECUNDARIOS) =====
  async getPlayerStats(playerId: string): Promise<PlayerStats | null> {
    if (!this.connected) return null;

    return await this.playerStatsCollection.findOne(
      { player_id: playerId },
      { readPreference: 'secondary' }
    );
  }

  async getTopPlayers(limit: number = 10): Promise<PlayerStats[]> {
    if (!this.connected) return [];

    return await this.playerStatsCollection
      .find({}, { readPreference: 'secondary' })
      .sort({ total_winnings: -1 })
      .limit(limit)
      .toArray();
  }

  async getRecentRounds(limit: number = 20): Promise<GameRound[]> {
    if (!this.connected) return [];

    return await this.gameRoundsCollection
      .find({}, { readPreference: 'secondary' })
      .sort({ start_time: -1 })
      .limit(limit)
      .toArray();
  }

  async getRoundStats(roundId: string): Promise<{ round: GameRound | null, bets: BetRecord[] }> {
    if (!this.connected) return { round: null, bets: [] };

    const [round, bets] = await Promise.all([
      this.gameRoundsCollection.findOne(
        { round_id: roundId },
        { readPreference: 'secondary' }
      ),
      this.betsCollection
        .find({ round_id: roundId }, { readPreference: 'secondary' })
        .sort({ bet_time: 1 })
        .toArray()
    ]);

    return { round, bets };
  }

  // ===== MÉTODO PARA PROCESAR FINAL DE RONDA =====
  async processRoundEnd(
    roundId: string,
    startTime: Date,
    endTime: Date,
    crashMultiplier: number,
    bets: any[]
  ): Promise<void> {
    if (!this.connected || bets.length === 0) return;

    try {
      console.log(`🏁 [${this.instanceId}] Procesando final de ronda ${roundId}...`);

      // Preparar datos de las apuestas
      const betRecords: Omit<BetRecord, 'created_at' | 'server_instance'>[] = bets.map(bet => ({
        bet_id: `${roundId}_${bet.player.id_player}`,
        round_id: roundId,
        player_id: bet.player.id_player,
        username: bet.player.username,
        bet_amount: bet.amount,
        bet_time: new Date(bet.date_bet),
        cash_out_multiplier: bet.multiplyer || null,
        cash_out_time: bet.multiplyer ? endTime : null,
        winnings: bet.ganancy || 0,
        is_winner: (bet.ganancy || 0) > 0,
        is_cashed_out: !!bet.multiplyer
      }));

      // Calcular estadísticas de la ronda
      const totalBetAmount = betRecords.reduce((sum, bet) => sum + bet.bet_amount, 0);
      const totalWinnings = betRecords.reduce((sum, bet) => sum + (bet.winnings || 0), 0);
      const winnerCount = betRecords.filter(bet => bet.is_winner).length;

      // Guardar ronda
      await this.saveGameRound({
        round_id: roundId,
        start_time: startTime,
        end_time: endTime,
        crash_multiplier: crashMultiplier,
        status: 'completed',
        total_bets: betRecords.length,
        total_bet_amount: totalBetAmount,
        total_winnings: totalWinnings,
        winner_count: winnerCount
      });

      // Guardar apuestas
      await this.saveBets(betRecords);

      // Actualizar estadísticas de jugadores
      for (const bet of betRecords) {
        const playerUpdate = {
          $inc: {
            total_bets: 1,
            total_bet_amount: bet.bet_amount,
            total_winnings: bet.winnings || 0,
            total_losses: bet.is_winner ? 0 : bet.bet_amount,
            rounds_played: 1
          },
          $max: {
            biggest_win: bet.winnings || 0,
            biggest_win_multiplier: bet.cash_out_multiplier || 0,
            last_played: new Date()
          },
          $set: {
            username: bet.username,
            updated_at: new Date()
          },
          $setOnInsert: {
            player_id: bet.player_id,
            first_played: new Date()
          }
        };

        await this.playerStatsCollection.updateOne(
          { player_id: bet.player_id },
          playerUpdate,
          { upsert: true }
        );
      }

      console.log(`✅ [${this.instanceId}] Ronda ${roundId} procesada: ${betRecords.length} apuestas, ${winnerCount} ganadores`);

    } catch (error) {
      console.error(`❌ [${this.instanceId}] Error procesando ronda ${roundId}:`, error);
    }
  }

  // ===== MÉTODO DE SALUD =====
  async getHealthStatus(): Promise<any> {
    if (!this.connected) return { status: 'disconnected' };

    try {
      const replicaStatus = await this.db.admin().replSetGetStatus();
      return {
        status: 'connected',
        replica_set: replicaStatus.set,
        members: replicaStatus.members.map(member => ({
          name: member.name,
          state: member.stateStr,
          health: member.health
        }))
      };
    } catch (error) {
      return { status: 'error', error: error.message };
    }
  }
}

export default MongoDBService;