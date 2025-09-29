// database/models/GameRound.js
const dbConnection = require('../connection');
const { v4: uuidv4 } = require('uuid');

class GameRoundModel {
    
    // Crear una nueva ronda de juego
    static async create(roundData) {
        const { id_game_hall, multiplyer = 2.0 } = roundData;
        const id_round = uuidv4();
        
        const query = `
            INSERT INTO game_rounds (id_round, id_game_hall, multiplyer, start_date, state)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'in_progress')
        `;
        
        await dbConnection.executeWrite(query, [id_round, id_game_hall, multiplyer]);
        return await this.findById(id_round);
    }
    
    // Buscar ronda por ID
    static async findById(id_round) {
        const query = `
            SELECT gr.*, gh.hall_name,
                   COUNT(b.id_bet) as total_bets,
                   SUM(b.amount) as total_bet_amount
            FROM game_rounds gr
            INNER JOIN game_halls gh ON gr.id_game_hall = gh.id_game_hall
            LEFT JOIN bets b ON gr.id_round = b.id_round
            WHERE gr.id_round = ?
            GROUP BY gr.id_round
        `;
        
        const results = await dbConnection.executeRead(query, [id_round]);
        return results[0] || null;
    }
    
    // Obtener ronda activa de una sala
    static async findActiveByHall(id_game_hall) {
        const query = `
            SELECT gr.*, 
                   COUNT(b.id_bet) as total_bets,
                   SUM(b.amount) as total_bet_amount,
                   COUNT(CASE WHEN b.status = 'active' THEN 1 END) as active_bets
            FROM game_rounds gr
            LEFT JOIN bets b ON gr.id_round = b.id_round
            WHERE gr.id_game_hall = ? AND gr.state = 'in_progress'
            GROUP BY gr.id_round
            ORDER BY gr.start_date DESC
            LIMIT 1
        `;
        
        const results = await dbConnection.executeRead(query, [id_game_hall]);
        return results[0] || null;
    }
    
    // Obtener historial de rondas de una sala
    static async findByHall(id_game_hall, limit = 20) {
        const query = `
            SELECT gr.*, 
                   COUNT(b.id_bet) as total_bets,
                   SUM(b.amount) as total_bet_amount,
                   SUM(CASE WHEN b.status IN ('won', 'cashed_out') THEN b.ganancy ELSE 0 END) as total_winnings
            FROM game_rounds gr
            LEFT JOIN bets b ON gr.id_round = b.id_round
            WHERE gr.id_game_hall = ?
            GROUP BY gr.id_round
            ORDER BY gr.start_date DESC
            LIMIT ?
        `;
        
        return await dbConnection.executeRead(query, [id_game_hall, limit]);
    }
    
    // Obtener rondas recientes (últimas completadas)
    static async getRecentRounds(limit = 10) {
        const query = `
            SELECT gr.*, gh.hall_name,
                   COUNT(b.id_bet) as total_bets,
                   SUM(b.amount) as total_bet_amount,
                   SUM(CASE WHEN b.status IN ('won', 'cashed_out') THEN b.ganancy ELSE 0 END) as total_winnings
            FROM game_rounds gr
            INNER JOIN game_halls gh ON gr.id_game_hall = gh.id_game_hall
            LEFT JOIN bets b ON gr.id_round = b.id_round
            WHERE gr.state = 'finished'
            GROUP BY gr.id_round
            ORDER BY gr.end_date DESC
            LIMIT ?
        `;
        
        return await dbConnection.executeRead(query, [limit]);
    }
    
    // Finalizar una ronda
    static async finishRound(id_round, final_multiplyer, crash_point) {
        return await dbConnection.executeTransaction(async (connection) => {
            // Calcular duración
            const [roundInfo] = await connection.execute(
                'SELECT start_date FROM game_rounds WHERE id_round = ?',
                [id_round]
            );
            
            if (!roundInfo.length) {
                throw new Error('Ronda no encontrada');
            }
            
            const startTime = new Date(roundInfo[0].start_date);
            const endTime = new Date();
            const durationSeg = Math.floor((endTime - startTime) / 1000);
            
            // Actualizar ronda
            const [updateResult] = await connection.execute(
                'UPDATE game_rounds SET state = "finished", end_date = CURRENT_TIMESTAMP, duration_seg = ?, final_multiplyer = ?, crash_point = ? WHERE id_round = ?',
                [durationSeg, final_multiplyer, crash_point, id_round]
            );
            
            if (updateResult.affectedRows === 0) {
                throw new Error('No se pudo actualizar la ronda');
            }
            
            return {
                id_round,
                final_multiplyer,
                crash_point,
                duration_seg: durationSeg,
                end_time: endTime
            };
        });
    }
    
    // Cancelar una ronda
    static async cancelRound(id_round, reason = 'Cancelada por el sistema') {
        return await dbConnection.executeTransaction(async (connection) => {
            // Obtener todas las apuestas activas
            const [activeBets] = await connection.execute(
                'SELECT id_bet, id_player, amount FROM bets WHERE id_round = ? AND status = "active"',
                [id_round]
            );
            
            // Reembolsar todas las apuestas
            for (const bet of activeBets) {
                await connection.execute(
                    'UPDATE player_stats SET balance = balance + ? WHERE id_player = ?',
                    [bet.amount, bet.id_player]
                );
                
                await connection.execute(
                    'UPDATE bets SET status = "cancelled" WHERE id_bet = ?',
                    [bet.id_bet]
                );
            }
            
            // Marcar ronda como cancelada
            await connection.execute(
                'UPDATE game_rounds SET state = "cancelled", end_date = CURRENT_TIMESTAMP WHERE id_round = ?',
                [id_round]
            );
            
            return {
                id_round,
                refunded_bets: activeBets.length,
                total_refunded: activeBets.reduce((sum, bet) => sum + bet.amount, 0)
            };
        });
    }
    
    // Obtener estadísticas de rondas por fecha
    static async getRoundStats(startDate, endDate) {
        const query = `
            SELECT 
                DATE(start_date) as round_date,
                COUNT(*) as total_rounds,
                COUNT(CASE WHEN state = 'finished' THEN 1 END) as completed_rounds,
                COUNT(CASE WHEN state = 'cancelled' THEN 1 END) as cancelled_rounds,
                AVG(final_multiplyer) as avg_multiplyer,
                MAX(final_multiplyer) as max_multiplyer,
                MIN(final_multiplyer) as min_multiplyer,
                AVG(duration_seg) as avg_duration_sec
            FROM game_rounds 
            WHERE start_date BETWEEN ? AND ?
            GROUP BY DATE(start_date)
            ORDER BY round_date DESC
        `;
        
        return await dbConnection.executeRead(query, [startDate, endDate]);
    }
    
    // Obtener multiplicadores más altos
    static async getTopMultiplyers(limit = 10) {
        const query = `
            SELECT gr.*, gh.hall_name,
                   COUNT(b.id_bet) as total_bets,
                   SUM(b.amount) as total_bet_amount
            FROM game_rounds gr
            INNER JOIN game_halls gh ON gr.id_game_hall = gh.id_game_hall
            LEFT JOIN bets b ON gr.id_round = b.id_round
            WHERE gr.final_multiplyer IS NOT NULL AND gr.state = 'finished'
            GROUP BY gr.id_round
            ORDER BY gr.final_multiplyer DESC
            LIMIT ?
        `;
        
        return await dbConnection.executeRead(query, [limit]);
    }
    
    // Obtener apuestas de una ronda con información de jugadores
    static async getRoundBets(id_round) {
        const query = `
            SELECT b.*, p.username, ps.balance
            FROM bets b
            INNER JOIN players p ON b.id_player = p.id_player
            LEFT JOIN player_stats ps ON p.id_player = ps.id_player
            WHERE b.id_round = ?
            ORDER BY b.date_bet ASC
        `;
        
        return await dbConnection.executeRead(query, [id_round]);
    }
    
    // Obtener progreso actual de una ronda (para tiempo real)
    static async getCurrentRoundProgress(id_round) {
        const query = `
            SELECT 
                gr.*,
                TIMESTAMPDIFF(SECOND, gr.start_date, CURRENT_TIMESTAMP) as elapsed_seconds,
                COUNT(b.id_bet) as total_bets,
                SUM(b.amount) as total_bet_amount,
                COUNT(CASE WHEN b.status = 'active' THEN 1 END) as active_bets,
                COUNT(CASE WHEN b.status = 'cashed_out' THEN 1 END) as cashed_out_bets
            FROM game_rounds gr
            LEFT JOIN bets b ON gr.id_round = b.id_round
            WHERE gr.id_round = ?
            GROUP BY gr.id_round
        `;
        
        const results = await dbConnection.executeRead(query, [id_round]);
        return results[0] || null;
    }
    
    // Actualizar multiplicador actual (para tiempo real)
    static async updateCurrentMultiplyer(id_round, current_multiplyer) {
        const query = `
            UPDATE game_rounds 
            SET multiplyer = ? 
            WHERE id_round = ? AND state = 'in_progress'
        `;
        
        const result = await dbConnection.executeWrite(query, [current_multiplyer, id_round]);
        return result.affectedRows > 0;
    }
}

module.exports = GameRoundModel;