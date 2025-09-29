// database/models/GameHall.js
const dbConnection = require('../connection');
const { v4: uuidv4 } = require('uuid');

class GameHallModel {
    
    // Crear una nueva sala de juego
    static async create(hallData) {
        const { hall_name, max_capacity = 50, active = true } = hallData;
        const id_game_hall = uuidv4();
        
        const query = `
            INSERT INTO game_halls (id_game_hall, hall_name, max_capacity, active, actual_players)
            VALUES (?, ?, ?, ?, 0)
        `;
        
        await dbConnection.executeWrite(query, [id_game_hall, hall_name, max_capacity, active]);
        return await this.findById(id_game_hall);
    }
    
    // Buscar sala por ID
    static async findById(id_game_hall) {
        const query = `
            SELECT * FROM game_halls WHERE id_game_hall = ?
        `;
        
        const results = await dbConnection.executeRead(query, [id_game_hall]);
        return results[0] || null;
    }
    
    // Obtener todas las salas activas
    static async findActive() {
        const query = `
            SELECT * FROM game_halls 
            WHERE active = TRUE 
            ORDER BY created_at ASC
        `;
        
        return await dbConnection.executeRead(query);
    }
    
    // Obtener sala con jugadores activos
    static async findWithActivePlayers(id_game_hall) {
        const query = `
            SELECT gh.*, 
                   COUNT(CASE WHEN gs.is_active = TRUE THEN 1 END) as current_active_players
            FROM game_halls gh
            LEFT JOIN game_sessions gs ON gh.id_game_hall = gs.id_game_hall
            WHERE gh.id_game_hall = ?
            GROUP BY gh.id_game_hall
        `;
        
        const results = await dbConnection.executeRead(query, [id_game_hall]);
        return results[0] || null;
    }
    
    // Obtener sesiones activas de una sala
    static async getActiveSessions(id_game_hall) {
        const query = `
            SELECT gs.*, p.username, p.register_date
            FROM game_sessions gs
            INNER JOIN players p ON gs.id_player = p.id_player
            WHERE gs.id_game_hall = ? AND gs.is_active = TRUE
            ORDER BY gs.date_ingress DESC
        `;
        
        return await dbConnection.executeRead(query, [id_game_hall]);
    }
    
    // Obtener rondas de una sala
    static async getGameRounds(id_game_hall, limit = 10) {
        const query = `
            SELECT gr.*, 
                   COUNT(b.id_bet) as total_bets,
                   SUM(b.amount) as total_bet_amount
            FROM game_rounds gr
            LEFT JOIN bets b ON gr.id_round = b.id_round
            WHERE gr.id_game_hall = ?
            GROUP BY gr.id_round
            ORDER BY gr.start_date DESC
            LIMIT ?
        `;
        
        return await dbConnection.executeRead(query, [id_game_hall, limit]);
    }
    
    // Obtener ronda activa de una sala
    static async getActiveRound(id_game_hall) {
        const query = `
            SELECT gr.*, 
                   COUNT(b.id_bet) as total_bets,
                   SUM(b.amount) as total_bet_amount
            FROM game_rounds gr
            LEFT JOIN bets b ON gr.id_round = b.id_round
            WHERE gr.id_game_hall = ? AND gr.state = 'in_progress'
            GROUP BY gr.id_round
            LIMIT 1
        `;
        
        const results = await dbConnection.executeRead(query, [id_game_hall]);
        return results[0] || null;
    }
    
    // Agregar jugador a una sala
    static async addPlayerToHall(id_player, id_game_hall) {
        const id_session = uuidv4();
        
        return await dbConnection.executeTransaction(async (connection) => {
            // Verificar si la sala tiene capacidad
            const [hallResult] = await connection.execute(
                'SELECT max_capacity, actual_players FROM game_halls WHERE id_game_hall = ? AND active = TRUE',
                [id_game_hall]
            );
            
            if (!hallResult.length) {
                throw new Error('Sala no encontrada o inactiva');
            }
            
            const hall = hallResult[0];
            if (hall.actual_players >= hall.max_capacity) {
                throw new Error('La sala está llena');
            }
            
            // Verificar si el jugador ya está en la sala
            const [existingSession] = await connection.execute(
                'SELECT id_session FROM game_sessions WHERE id_player = ? AND id_game_hall = ? AND is_active = TRUE',
                [id_player, id_game_hall]
            );
            
            if (existingSession.length) {
                throw new Error('El jugador ya está en la sala');
            }
            
            // Crear nueva sesión
            await connection.execute(
                'INSERT INTO game_sessions (id_session, id_player, id_game_hall, date_ingress, is_active) VALUES (?, ?, ?, CURRENT_TIMESTAMP, TRUE)',
                [id_session, id_player, id_game_hall]
            );
            
            return { id_session, id_player, id_game_hall };
        });
    }
    
    // Remover jugador de una sala
    static async removePlayerFromHall(id_player, id_game_hall) {
        return await dbConnection.executeTransaction(async (connection) => {
            const [result] = await connection.execute(
                'UPDATE game_sessions SET date_exit = CURRENT_TIMESTAMP, is_active = FALSE WHERE id_player = ? AND id_game_hall = ? AND is_active = TRUE',
                [id_player, id_game_hall]
            );
            
            return result.affectedRows > 0;
        });
    }
    
    // Obtener estadísticas de una sala
    static async getHallStats(id_game_hall) {
        const query = `
            SELECT 
                gh.hall_name,
                gh.max_capacity,
                gh.actual_players,
                COUNT(DISTINCT gs.id_player) as unique_players_today,
                COUNT(DISTINCT gr.id_round) as rounds_played_today,
                COALESCE(SUM(b.amount), 0) as total_bets_today,
                COALESCE(AVG(gr.final_multiplyer), 0) as avg_multiplyer_today
            FROM game_halls gh
            LEFT JOIN game_sessions gs ON gh.id_game_hall = gs.id_game_hall 
                AND DATE(gs.date_ingress) = CURDATE()
            LEFT JOIN game_rounds gr ON gh.id_game_hall = gr.id_game_hall 
                AND DATE(gr.start_date) = CURDATE()
            LEFT JOIN bets b ON gr.id_round = b.id_round
            WHERE gh.id_game_hall = ?
            GROUP BY gh.id_game_hall
        `;
        
        const results = await dbConnection.executeRead(query, [id_game_hall]);
        return results[0] || null;
    }
    
    // Actualizar contador de jugadores en sala
    static async updatePlayerCount(id_game_hall) {
        const query = `
            UPDATE game_halls 
            SET actual_players = (
                SELECT COUNT(*) 
                FROM game_sessions 
                WHERE id_game_hall = ? AND is_active = TRUE
            )
            WHERE id_game_hall = ?
        `;
        
        const result = await dbConnection.executeWrite(query, [id_game_hall, id_game_hall]);
        return result.affectedRows > 0;
    }
    
    // Obtener sala por defecto (la primera activa)
    static async getDefaultHall() {
        const query = `
            SELECT * FROM game_halls 
            WHERE active = TRUE 
            ORDER BY created_at ASC 
            LIMIT 1
        `;
        
        const results = await dbConnection.executeRead(query);
        return results[0] || null;
    }
    
    // Desactivar sala
    static async deactivateHall(id_game_hall) {
        const query = `
            UPDATE game_halls 
            SET active = FALSE, updated_at = CURRENT_TIMESTAMP 
            WHERE id_game_hall = ?
        `;
        
        const result = await dbConnection.executeWrite(query, [id_game_hall]);
        return result.affectedRows > 0;
    }
}

module.exports = GameHallModel;