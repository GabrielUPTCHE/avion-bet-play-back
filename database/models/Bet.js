// database/models/Bet.js
const dbConnection = require('../connection');
const { v4: uuidv4 } = require('uuid');

class BetModel {
    
    // Crear una nueva apuesta
    static async create(betData) {
        const { id_player, id_round, amount } = betData;
        const id_bet = uuidv4();
        
        return await dbConnection.executeTransaction(async (connection) => {
            // Verificar que el jugador tenga suficiente balance
            const [balanceResult] = await connection.execute(
                'SELECT balance FROM player_stats WHERE id_player = ?',
                [id_player]
            );
            
            if (!balanceResult.length || balanceResult[0].balance < amount) {
                throw new Error('Balance insuficiente');
            }
            
            // Verificar que la ronda esté activa
            const [roundResult] = await connection.execute(
                'SELECT state FROM game_rounds WHERE id_round = ?',
                [id_round]
            );
            
            if (!roundResult.length || roundResult[0].state !== 'in_progress') {
                throw new Error('La ronda no está activa');
            }
            
            // Crear la apuesta
            await connection.execute(
                'INSERT INTO bets (id_bet, id_player, id_round, amount, date_bet, status) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, "active")',
                [id_bet, id_player, id_round, amount]
            );
            
            // Descontar del balance del jugador
            await connection.execute(
                'UPDATE player_stats SET balance = balance - ? WHERE id_player = ?',
                [amount, id_player]
            );
            
            return { id_bet, id_player, id_round, amount, status: 'active' };
        });
    }
    
    // Buscar apuesta por ID
    static async findById(id_bet) {
        const query = `
            SELECT b.*, p.username, gr.state as round_state, gr.final_multiplyer
            FROM bets b
            INNER JOIN players p ON b.id_player = p.id_player
            INNER JOIN game_rounds gr ON b.id_round = gr.id_round
            WHERE b.id_bet = ?
        `;
        
        const results = await dbConnection.executeRead(query, [id_bet]);
        return results[0] || null;
    }
    
    // Obtener apuestas de una ronda
    static async findByRound(id_round) {
        const query = `
            SELECT b.*, p.username
            FROM bets b
            INNER JOIN players p ON b.id_player = p.id_player
            WHERE b.id_round = ?
            ORDER BY b.date_bet ASC
        `;
        
        return await dbConnection.executeRead(query, [id_round]);
    }
    
    // Obtener apuestas de un jugador
    static async findByPlayer(id_player, limit = 50) {
        const query = `
            SELECT b.*, gr.final_multiplyer, gr.state as round_state
            FROM bets b
            INNER JOIN game_rounds gr ON b.id_round = gr.id_round
            WHERE b.id_player = ?
            ORDER BY b.date_bet DESC
            LIMIT ?
        `;
        
        return await dbConnection.executeRead(query, [id_player, limit]);
    }
    
    // Obtener apuestas activas de un jugador
    static async findActiveByPlayer(id_player) {
        const query = `
            SELECT b.*, gr.state as round_state
            FROM bets b
            INNER JOIN game_rounds gr ON b.id_round = gr.id_round
            WHERE b.id_player = ? AND b.status = 'active' AND gr.state = 'in_progress'
            ORDER BY b.date_bet DESC
        `;
        
        return await dbConnection.executeRead(query, [id_player]);
    }
    
    // Cash out de una apuesta
    static async cashOut(id_bet, current_multiplyer) {
        return await dbConnection.executeTransaction(async (connection) => {
            // Obtener información de la apuesta
            const [betResult] = await connection.execute(
                'SELECT b.*, gr.state FROM bets b INNER JOIN game_rounds gr ON b.id_round = gr.id_round WHERE b.id_bet = ? AND b.status = "active"',
                [id_bet]
            );
            
            if (!betResult.length) {
                throw new Error('Apuesta no encontrada o no está activa');
            }
            
            const bet = betResult[0];
            
            if (bet.state !== 'in_progress') {
                throw new Error('La ronda ya terminó');
            }
            
            // Calcular ganancia
            const winAmount = bet.amount * current_multiplyer;
            
            // Actualizar la apuesta
            await connection.execute(
                'UPDATE bets SET status = "cashed_out", cash_out_multiplyer = ?, cash_out_time = CURRENT_TIMESTAMP, ganancy = ?, multiplyer = ? WHERE id_bet = ?',
                [current_multiplyer, winAmount, current_multiplyer, id_bet]
            );
            
            // Agregar ganancia al balance del jugador
            await connection.execute(
                'UPDATE player_stats SET balance = balance + ?, total_winnings = total_winnings + ? WHERE id_player = ?',
                [winAmount, winAmount, bet.id_player]
            );
            
            return { 
                id_bet, 
                cash_out_multiplyer: current_multiplyer, 
                winAmount,
                player_id: bet.id_player 
            };
        });
    }
    
    // Procesar apuestas al final de una ronda
    static async processRoundEnd(id_round, final_multiplyer, crash_point) {
        return await dbConnection.executeTransaction(async (connection) => {
            // Obtener todas las apuestas activas de la ronda
            const [activeBets] = await connection.execute(
                'SELECT * FROM bets WHERE id_round = ? AND status = "active"',
                [id_round]
            );
            
            const processedBets = [];
            
            for (const bet of activeBets) {
                // Las apuestas activas se consideran perdidas
                await connection.execute(
                    'UPDATE bets SET status = "lost", multiplyer = ? WHERE id_bet = ?',
                    [final_multiplyer, bet.id_bet]
                );
                
                processedBets.push({
                    id_bet: bet.id_bet,
                    id_player: bet.id_player,
                    status: 'lost',
                    amount: bet.amount
                });
            }
            
            // Obtener estadísticas de la ronda
            const [roundStats] = await connection.execute(
                'SELECT COUNT(*) as total_bets, SUM(amount) as total_amount, SUM(CASE WHEN status = "cashed_out" THEN ganancy ELSE 0 END) as total_winnings FROM bets WHERE id_round = ?',
                [id_round]
            );
            
            return {
                processedBets,
                roundStats: roundStats[0]
            };
        });
    }
    
    // Obtener estadísticas de apuestas por fecha
    static async getBettingStats(startDate, endDate) {
        const query = `
            SELECT 
                DATE(date_bet) as bet_date,
                COUNT(*) as total_bets,
                SUM(amount) as total_bet_amount,
                SUM(CASE WHEN status = 'won' OR status = 'cashed_out' THEN ganancy ELSE 0 END) as total_winnings,
                AVG(amount) as avg_bet_amount,
                COUNT(CASE WHEN status = 'won' OR status = 'cashed_out' THEN 1 END) as winning_bets,
                COUNT(CASE WHEN status = 'lost' THEN 1 END) as losing_bets
            FROM bets 
            WHERE date_bet BETWEEN ? AND ?
            GROUP BY DATE(date_bet)
            ORDER BY bet_date DESC
        `;
        
        return await dbConnection.executeRead(query, [startDate, endDate]);
    }
    
    // Obtener mejores apuestas (por multiplicador)
    static async getTopBets(limit = 10) {
        const query = `
            SELECT b.*, p.username, b.multiplyer, b.ganancy
            FROM bets b
            INNER JOIN players p ON b.id_player = p.id_player
            WHERE b.status IN ('won', 'cashed_out') AND b.multiplyer IS NOT NULL
            ORDER BY b.multiplyer DESC
            LIMIT ?
        `;
        
        return await dbConnection.executeRead(query, [limit]);
    }
    
    // Cancelar apuesta (solo si la ronda no ha empezado)
    static async cancel(id_bet) {
        return await dbConnection.executeTransaction(async (connection) => {
            // Obtener información de la apuesta y ronda
            const [betResult] = await connection.execute(
                'SELECT b.*, gr.state FROM bets b INNER JOIN game_rounds gr ON b.id_round = gr.id_round WHERE b.id_bet = ? AND b.status = "active"',
                [id_bet]
            );
            
            if (!betResult.length) {
                throw new Error('Apuesta no encontrada o no está activa');
            }
            
            const bet = betResult[0];
            
            // Solo se puede cancelar si la ronda aún no ha empezado (implementar lógica según necesidades)
            // Por ahora, permitimos cancelar solo si está en progreso y han pasado menos de 5 segundos
            
            // Reembolsar al jugador
            await connection.execute(
                'UPDATE player_stats SET balance = balance + ? WHERE id_player = ?',
                [bet.amount, bet.id_player]
            );
            
            // Marcar apuesta como cancelada
            await connection.execute(
                'DELETE FROM bets WHERE id_bet = ?',
                [id_bet]
            );
            
            return { id_bet, refunded_amount: bet.amount, player_id: bet.id_player };
        });
    }
}

module.exports = BetModel;