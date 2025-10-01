// services/redis-manager.ts
import { createClient, RedisClientType } from 'redis';
import { Server } from 'socket.io';

export interface GameStateEvent {
  type: 'new_bet' | 'cancel_bet' | 'round_update' | 'players_update' | 'round_state_change';
  data: any;
  instanceId: string;
  timestamp: number;
}

export interface BetData {
  id_player: string;
  amount: number;
  instanceId: string;
  timestamp: number;
}

export interface RoundState {
  status: 'not_initied' | 'in_progress' | 'finished';
  countdown: number;
  isBetTime: boolean;
  title: string;
  multiplier?: number;
  instanceId: string;
  timestamp: number;
}

export class RedisGameManager {
  private redisClient: RedisClientType;
  private pubClient: RedisClientType;
  private subClient: RedisClientType;
  private instanceId: string;
  private io: Server;
  
  // Canales de Redis
  private readonly CHANNELS = {
    GAME_EVENTS: 'aviator:game_events',
    BETS: 'aviator:bets',
    ROUND_STATE: 'aviator:round_state',
    PLAYERS: 'aviator:players'
  };

  // Keys de Redis para estado persistente
  private readonly KEYS = {
    CURRENT_BETS: 'aviator:current_bets',
    ROUND_STATE: 'aviator:round_state',
    ACTIVE_PLAYERS: 'aviator:active_players',
    GAME_STATS: 'aviator:game_stats'
  };

  constructor(instanceId: string, io: Server, redisUrl: string = 'redis://localhost:6379') {
    this.instanceId = instanceId;
    this.io = io;
    
    // Crear clientes Redis separados para pub/sub
    this.redisClient = createClient({ url: redisUrl });
    this.pubClient = createClient({ url: redisUrl });
    this.subClient = createClient({ url: redisUrl });

    this.setupEventHandlers();
  }

  async connect(): Promise<void> {
    try {
      await Promise.all([
        this.redisClient.connect(),
        this.pubClient.connect(),
        this.subClient.connect()
      ]);

      console.log(`🔗 [${this.instanceId}] Redis conectado exitosamente`);
      
      // Suscribirse a canales
      await this.subscribeToChannels();
      
    } catch (error) {
      console.error(`❌ [${this.instanceId}] Error conectando a Redis:`, error);
      throw error;
    }
  }

  private async subscribeToChannels(): Promise<void> {
    // Suscribirse a eventos de juego
    await this.subClient.subscribe(this.CHANNELS.GAME_EVENTS, (message) => {
      this.handleGameEvent(JSON.parse(message));
    });

    await this.subClient.subscribe(this.CHANNELS.BETS, (message) => {
      this.handleBetEvent(JSON.parse(message));
    });

    await this.subClient.subscribe(this.CHANNELS.ROUND_STATE, (message) => {
      this.handleRoundStateEvent(JSON.parse(message));
    });

    await this.subClient.subscribe(this.CHANNELS.PLAYERS, (message) => {
      this.handlePlayersEvent(JSON.parse(message));
    });

    console.log(`📡 [${this.instanceId}] Suscrito a canales Redis`);
  }

  private setupEventHandlers(): void {
    this.redisClient.on('error', (err) => {
      console.error(`❌ [${this.instanceId}] Redis Error:`, err);
    });

    this.redisClient.on('connect', () => {
      console.log(`🔗 [${this.instanceId}] Redis conectado`);
    });

    this.redisClient.on('disconnect', () => {
      console.log(`🔌 [${this.instanceId}] Redis desconectado`);
    });
  }

  // ===== MANEJO DE APUESTAS =====
  async publishBet(betData: BetData): Promise<void> {
    const event: GameStateEvent = {
      type: 'new_bet',
      data: betData,
      instanceId: this.instanceId,
      timestamp: Date.now()
    };

    // Publicar evento
    await this.pubClient.publish(this.CHANNELS.BETS, JSON.stringify(event));
    
    // Guardar apuesta en Redis
    await this.redisClient.hSet(this.KEYS.CURRENT_BETS, betData.id_player, JSON.stringify(betData));
    
    console.log(`💰 [${this.instanceId}] Apuesta publicada: ${betData.id_player} - $${betData.amount}`);
  }

  async publishCancelBet(playerId: string): Promise<void> {
    const event: GameStateEvent = {
      type: 'cancel_bet',
      data: { id_player: playerId },
      instanceId: this.instanceId,
      timestamp: Date.now()
    };

    // Publicar evento
    await this.pubClient.publish(this.CHANNELS.BETS, JSON.stringify(event));
    
    // Remover apuesta de Redis
    await this.redisClient.hDel(this.KEYS.CURRENT_BETS, playerId);
    
    console.log(`🚫 [${this.instanceId}] Cancelación de apuesta publicada: ${playerId}`);
  }

  async getCurrentBets(): Promise<Record<string, BetData>> {
    const bets = await this.redisClient.hGetAll(this.KEYS.CURRENT_BETS);
    const parsedBets: Record<string, BetData> = {};
    
    for (const [playerId, betJson] of Object.entries(bets)) {
      parsedBets[playerId] = JSON.parse(betJson);
    }
    
    return parsedBets;
  }

  // ===== MANEJO DE ESTADO DE RONDA =====
  async publishRoundState(roundState: RoundState): Promise<void> {
    const event: GameStateEvent = {
      type: 'round_state_change',
      data: roundState,
      instanceId: this.instanceId,
      timestamp: Date.now()
    };

    // Solo la instancia master publica cambios de estado
    if (await this.isMasterInstance()) {
      await this.pubClient.publish(this.CHANNELS.ROUND_STATE, JSON.stringify(event));
      await this.redisClient.set(this.KEYS.ROUND_STATE, JSON.stringify(roundState));
      
      console.log(`🎮 [${this.instanceId}] Estado de ronda publicado: ${roundState.status}`);
    }
  }

  async getCurrentRoundState(): Promise<RoundState | null> {
    const stateJson = await this.redisClient.get(this.KEYS.ROUND_STATE);
    return stateJson ? JSON.parse(stateJson) : null;
  }

  // ===== MANEJO DE JUGADORES =====
  async publishPlayerUpdate(playersOrAction: any[] | any): Promise<void> {
    let event: GameStateEvent;
    
    // Si es un array, es la lista completa de jugadores (comportamiento original)
    if (Array.isArray(playersOrAction)) {
      event = {
        type: 'players_update',
        data: playersOrAction,
        instanceId: this.instanceId,
        timestamp: Date.now()
      };
      
      await this.redisClient.set(this.KEYS.ACTIVE_PLAYERS, JSON.stringify(playersOrAction));
      console.log(`👥 [${this.instanceId}] Jugadores actualizados: ${playersOrAction.length} activos`);
    } 
    // Si es un objeto, es una acción individual (join/leave)
    else {
      event = {
        type: 'players_update',
        data: playersOrAction,
        instanceId: this.instanceId,
        timestamp: Date.now()
      };
      
      console.log(`� [${this.instanceId}] Acción de jugador: ${playersOrAction.action} - ${playersOrAction.player?.username}`);
    }

    await this.pubClient.publish(this.CHANNELS.PLAYERS, JSON.stringify(event));
  }

  async getActivePlayers(): Promise<any[]> {
    const playersJson = await this.redisClient.get(this.KEYS.ACTIVE_PLAYERS);
    return playersJson ? JSON.parse(playersJson) : [];
  }

  // ===== MANEJO DE EVENTOS =====
  private handleGameEvent(event: GameStateEvent): void {
    // No procesar eventos de la misma instancia
    if (event.instanceId === this.instanceId) return;

    console.log(`📨 [${this.instanceId}] Evento recibido de ${event.instanceId}: ${event.type}`);
  }

  private handleBetEvent(event: GameStateEvent): void {
    // No procesar eventos de la misma instancia
    if (event.instanceId === this.instanceId) return;

    console.log(`🎯 [${this.instanceId}] Evento de apuesta de ${event.instanceId}: ${event.type}`);
    
    // Retransmitir a todos los clientes conectados a esta instancia
    if (event.type === 'new_bet') {
      this.io.emit('bets_update', event.data);
    } else if (event.type === 'cancel_bet') {
      this.io.emit('bets_update', event.data);
    }
  }

  private handleRoundStateEvent(event: GameStateEvent): void {
    // No procesar eventos de la misma instancia
    if (event.instanceId === this.instanceId) return;

    console.log(`🔄 [${this.instanceId}] Estado de ronda de ${event.instanceId}: ${event.data.status}`);
    
    // Retransmitir cambios de estado a todos los clientes
    this.io.emit('update_round_state', event.data);
    
    if (event.data.status === 'in_progress') {
      this.io.emit('round_start');
    } else if (event.data.status === 'finished') {
      this.io.emit('round_end', { finalMultiplier: event.data.multiplier });
    }
  }

  private handlePlayersEvent(event: GameStateEvent): void {
    // No procesar eventos de la misma instancia
    if (event.instanceId === this.instanceId) return;

    // Si es una acción individual de jugador (join/leave)
    if (event.data.action && event.data.player) {
      console.log(`👤 [${this.instanceId}] Acción de jugador de ${event.instanceId}: ${event.data.action} - ${event.data.player.username}`);
      
      // Si es un 'join', agregar la sesión localmente para que pueda apostar
      if (event.data.action === 'join') {
        // Importar y usar la función addSessionPlayer
        const { addSessionPlayer, getActivePlayers } = require('./game-service');
        addSessionPlayer(event.data.player);
        console.log(`📥 [${this.instanceId}] Sesión de ${event.data.player.username} agregada localmente`);
        
        // Enviar jugadores activos actualizados
        this.io.emit('players_update', getActivePlayers());
      } else if (event.data.action === 'leave') {
        // Para leave, también enviar jugadores activos actualizados
        const { getActivePlayers } = require('./game-service');
        this.io.emit('players_update', getActivePlayers());
      }
    } 
    // Si es una lista completa de jugadores
    else if (Array.isArray(event.data)) {
      console.log(`👥 [${this.instanceId}] Lista de jugadores actualizada de ${event.instanceId}: ${event.data.length} jugadores`);
      this.io.emit('players_update', event.data);
    }
  }

  // ===== UTILIDADES =====
  private async isMasterInstance(): Promise<boolean> {
    // Implementar lógica para determinar instancia master
    // Por simplicidad, usamos la primera instancia alfabéticamente
    const masterKey = 'aviator:master_instance';
    const currentMaster = await this.redisClient.get(masterKey);
    
    if (!currentMaster) {
      // Intentar ser master
      const result = await this.redisClient.setNX(masterKey, this.instanceId);
      await this.redisClient.expire(masterKey, 30); // TTL de 30 segundos
      return result;
    }
    
    // Renovar TTL si somos master
    if (currentMaster === this.instanceId) {
      await this.redisClient.expire(masterKey, 30);
      return true;
    }
    
    return false;
  }

  async clearAllBets(): Promise<void> {
    await this.redisClient.del(this.KEYS.CURRENT_BETS);
    console.log(`🧹 [${this.instanceId}] Todas las apuestas limpiadas`);
  }

  async getStats(): Promise<Record<string, any>> {
    const bets = await this.getCurrentBets();
    const players = await this.getActivePlayers();
    const roundState = await this.getCurrentRoundState();
    
    return {
      instanceId: this.instanceId,
      activeBets: Object.keys(bets).length,
      activePlayers: players.length,
      roundState: roundState?.status || 'unknown',
      timestamp: new Date().toISOString()
    };
  }

  async disconnect(): Promise<void> {
    await Promise.all([
      this.redisClient.disconnect(),
      this.pubClient.disconnect(),
      this.subClient.disconnect()
    ]);
    
    console.log(`🔌 [${this.instanceId}] Redis desconectado`);
  }
}

export default RedisGameManager;