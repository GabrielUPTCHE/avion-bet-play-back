// database/models/Player.js
const dbConnection = require('../connection');
const { v4: uuidv4 } = require('uuid');

class PlayerModel {
    
    // Crear un nuevo jugador
    static async create(playerData) {
        const { username, register_date } = playerData;
        const id_player = uuidv4();
        
        const query = `
            INSERT INTO players (id_player, username, register_date)
            VALUES (?, ?, ?)
        `;
        
        try {
            await dbConnection.executeWrite(query, [id_player, username, register_date || new Date()]);
            
            // Crear estadísticas iniciales del jugador
            await this.createInitialStats(id_player);
            
            return await this.findById(id_player);
        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                throw new Error('El nombre de usuario ya existe');
            }
            throw error;
        }
    }
    
    // Crear estadísticas iniciales para un jugador
    static async createInitialStats(id_player) {
        const query = `
            INSERT INTO player_stats (id_player, balance)
            VALUES (?, (SELECT config_value FROM system_config WHERE config_key = 'default_balance'))
        `;
        
        return await dbConnection.executeWrite(query, [id_player]);
    }
    
    // Buscar jugador por ID
    static async findById(id_player) {
        const query = `
            SELECT p.*, ps.balance, ps.total_bets, ps.total_winnings, ps.best_multiplyer
            FROM players p
            LEFT JOIN player_stats ps ON p.id_player = ps.id_player
            WHERE p.id_player = ?
        `;
        
        const results = await dbConnection.executeRead(query, [id_player]);
        return results[0] || null;
    }
    
    // Buscar jugador por nombre de usuario
    static async findByUsername(username) {
        const query = `
            SELECT p.*, ps.balance, ps.total_bets, ps.total_winnings, ps.best_multiplyer
            FROM players p
            LEFT JOIN player_stats ps ON p.id_player = ps.id_player
            WHERE p.username = ?
        `;
        
        const results = await dbConnection.executeRead(query, [username]);
        return results[0] || null;
    }
    
    // Obtener todos los jugadores
    static async findAll() {
        const query = `
            SELECT p.*, ps.balance, ps.total_bets, ps.total_winnings, ps.best_multiplyer
            FROM players p
            LEFT JOIN player_stats ps ON p.id_player = ps.id_player
            ORDER BY p.register_date DESC
        `;
        
        return await dbConnection.executeRead(query);
    }
    
    // Obtener jugadores activos (con sesiones activas)
    static async findActive() {
        const query = `
            SELECT DISTINCT p.*, ps.balance, ps.total_bets, ps.total_winnings
            FROM players p
            INNER JOIN game_sessions gs ON p.id_player = gs.id_player
            LEFT JOIN player_stats ps ON p.id_player = ps.id_player
            WHERE gs.is_active = TRUE
            ORDER BY gs.date_ingress DESC
        `;
        
        return await dbConnection.executeRead(query);
    }
    
    // Actualizar balance del jugador
    static async updateBalance(id_player, newBalance) {
        const query = `
            UPDATE player_stats 
            SET balance = ?, last_active = CURRENT_TIMESTAMP
            WHERE id_player = ?
        `;
        
        const result = await dbConnection.executeWrite(query, [newBalance, id_player]);
        return result.affectedRows > 0;
    }
    
    // Obtener balance del jugador
    static async getBalance(id_player) {
        const query = `
            SELECT balance FROM player_stats WHERE id_player = ?
        `;
        
        const results = await dbConnection.executeRead(query, [id_player]);
        return results[0]?.balance || 0;
    }
    
    // Obtener estadísticas del jugador
    static async getStats(id_player) {
        const query = `
            SELECT ps.*, 
                   (SELECT COUNT(*) FROM bets b WHERE b.id_player = ps.id_player AND b.status = 'won') as games_won,
                   (SELECT COUNT(*) FROM bets b WHERE b.id_player = ps.id_player AND b.status = 'lost') as games_lost
            FROM player_stats ps
            WHERE ps.id_player = ?
        `;
        
        const results = await dbConnection.executeRead(query, [id_player]);
        return results[0] || null;
    }
    
    // Obtener top jugadores por ganancias
    static async getTopPlayers(limit = 10) {
        const query = `
            SELECT p.username, ps.total_winnings, ps.best_multiplyer, ps.games_played
            FROM players p
            INNER JOIN player_stats ps ON p.id_player = ps.id_player
            ORDER BY ps.total_winnings DESC
            LIMIT ?
        `;
        
        return await dbConnection.executeRead(query, [limit]);
    }
    
    // Eliminar jugador (soft delete - marcar como inactivo)
    static async delete(id_player) {
        // En lugar de eliminar, podríamos marcar como inactivo
        const query = `
            UPDATE players 
            SET updated_at = CURRENT_TIMESTAMP
            WHERE id_player = ?
        `;
        
        const result = await dbConnection.executeWrite(query, [id_player]);
        return result.affectedRows > 0;
    }
    
    // Verificar si un jugador puede hacer una apuesta
    static async canMakeBet(id_player, betAmount) {
        const balance = await this.getBalance(id_player);
        return balance >= betAmount;
    }
    
    // Procesar ganancia de apuesta
    static async processWinning(id_player, winAmount, multiplyer) {
        return await dbConnection.executeTransaction(async (connection) => {
            // Actualizar balance
            const [updateResult] = await connection.execute(
                'UPDATE player_stats SET balance = balance + ?, total_winnings = total_winnings + ? WHERE id_player = ?',
                [winAmount, winAmount, id_player]
            );
            
            // Actualizar mejor multiplicador si es necesario
            await connection.execute(
                'UPDATE player_stats SET best_multiplyer = GREATEST(best_multiplyer, ?) WHERE id_player = ?',
                [multiplyer, id_player]
            );
            
            return updateResult.affectedRows > 0;
        });
    }
}

module.exports = PlayerModel;