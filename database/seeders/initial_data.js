// database/seeders/initial_data.js
const PlayerModel = require('../models/Player');
const GameHallModel = require('../models/GameHall');
const GameRoundModel = require('../models/GameRound');
const BetModel = require('../models/Bet');

class DataSeeder {
    
    static async seedInitialData() {
        try {
            console.log('🌱 Iniciando seed de datos iniciales...');
            
            // 1. Crear sala de juego por defecto
            await this.createDefaultGameHall();
            
            // 2. Crear jugadores de prueba
            await this.createTestPlayers();
            
            // 3. Crear ronda inicial
            await this.createInitialRound();
            
            console.log('✅ Seed completado exitosamente');
            
        } catch (error) {
            console.error('❌ Error durante el seed:', error);
            throw error;
        }
    }
    
    static async createDefaultGameHall() {
        try {
            const existingHall = await GameHallModel.getDefaultHall();
            
            if (!existingHall) {
                const hallData = {
                    hall_name: 'Sala Principal',
                    max_capacity: 100,
                    active: true
                };
                
                const hall = await GameHallModel.create(hallData);
                console.log('✅ Sala de juego creada:', hall.hall_name);
                return hall;
            } else {
                console.log('ℹ️ Sala de juego ya existe:', existingHall.hall_name);
                return existingHall;
            }
            
        } catch (error) {
            console.error('❌ Error creando sala de juego:', error);
            throw error;
        }
    }
    
    static async createTestPlayers() {
        const testPlayers = [
            {
                username: 'player_demo_1',
                register_date: new Date()
            },
            {
                username: 'player_demo_2', 
                register_date: new Date()
            },
            {
                username: 'player_demo_3',
                register_date: new Date()
            }
        ];
        
        for (const playerData of testPlayers) {
            try {
                const existingPlayer = await PlayerModel.findByUsername(playerData.username);
                
                if (!existingPlayer) {
                    const player = await PlayerModel.create(playerData);
                    console.log('✅ Jugador de prueba creado:', player.username);
                } else {
                    console.log('ℹ️ Jugador ya existe:', playerData.username);
                }
                
            } catch (error) {
                console.warn('⚠️ Error creando jugador', playerData.username, ':', error.message);
            }
        }
    }
    
    static async createInitialRound() {
        try {
            const defaultHall = await GameHallModel.getDefaultHall();
            
            if (!defaultHall) {
                throw new Error('No se encontró sala por defecto');
            }
            
            const activeRound = await GameRoundModel.findActiveByHall(defaultHall.id_game_hall);
            
            if (!activeRound) {
                const roundData = {
                    id_game_hall: defaultHall.id_game_hall,
                    multiplyer: 1.0
                };
                
                const round = await GameRoundModel.create(roundData);
                console.log('✅ Ronda inicial creada:', round.id_round);
                return round;
            } else {
                console.log('ℹ️ Ya existe una ronda activa:', activeRound.id_round);
                return activeRound;
            }
            
        } catch (error) {
            console.error('❌ Error creando ronda inicial:', error);
            throw error;
        }
    }
    
    // Método para limpiar datos de prueba
    static async cleanTestData() {
        try {
            console.log('🧹 Limpiando datos de prueba...');
            
            // Eliminar apuestas de prueba
            await dbConnection.executeWrite('DELETE FROM bets WHERE id_player LIKE "%-demo-%"');
            
            // Eliminar estadísticas de jugadores de prueba  
            await dbConnection.executeWrite('DELETE FROM player_stats WHERE id_player IN (SELECT id_player FROM players WHERE username LIKE "player_demo_%")');
            
            // Eliminar jugadores de prueba
            await dbConnection.executeWrite('DELETE FROM players WHERE username LIKE "player_demo_%"');
            
            console.log('✅ Datos de prueba limpiados');
            
        } catch (error) {
            console.error('❌ Error limpiando datos de prueba:', error);
            throw error;
        }
    }
    
    // Método para crear datos de desarrollo/testing
    static async seedDevelopmentData() {
        try {
            console.log('🧪 Creando datos de desarrollo...');
            
            const defaultHall = await GameHallModel.getDefaultHall();
            const testPlayer = await PlayerModel.findByUsername('player_demo_1');
            
            if (defaultHall && testPlayer) {
                // Crear algunas rondas de ejemplo
                for (let i = 0; i < 5; i++) {
                    const round = await GameRoundModel.create({
                        id_game_hall: defaultHall.id_game_hall,
                        multiplyer: 1.0
                    });
                    
                    // Simular algunas apuestas
                    const betAmount = Math.random() * 100 + 10; // Entre 10 y 110
                    await BetModel.create({
                        id_player: testPlayer.id_player,
                        id_round: round.id_round,
                        amount: betAmount
                    });
                    
                    // Finalizar la ronda con un multiplicador aleatorio
                    const finalMultiplyer = Math.random() * 10 + 1; // Entre 1 y 11
                    await GameRoundModel.finishRound(round.id_round, finalMultiplyer, finalMultiplyer);
                    
                    console.log(`✅ Ronda de desarrollo ${i + 1} creada`);
                }
            }
            
            console.log('✅ Datos de desarrollo creados');
            
        } catch (error) {
            console.error('❌ Error creando datos de desarrollo:', error);
            throw error;
        }
    }
}

module.exports = DataSeeder;