#!/usr/bin/env node

// scripts/setup_database.js
const dbConnection = require('../database/connection');
const DataSeeder = require('../database/seeders/initial_data');

async function setupDatabase() {
    console.log('🚀 Configurando base de datos para Aviator Game...\n');
    
    try {
        // 1. Verificar conexiones
        console.log('1. Verificando conexiones...');
        const connectionStatus = await dbConnection.checkConnections();
        
        console.log('   - Master:', connectionStatus.master ? '✅' : '❌');
        console.log('   - Slave 1:', connectionStatus.slave1 ? '✅' : '❌');
        console.log('   - Slave 2:', connectionStatus.slave2 ? '✅' : '❌');
        
        if (!connectionStatus.master) {
            throw new Error('No se puede conectar al servidor Master');
        }
        
        console.log('');
        
        // 2. Verificar que las tablas existan
        console.log('2. Verificando estructura de base de datos...');
        const tables = await dbConnection.executeRead('SHOW TABLES');
        console.log(`   - Se encontraron ${tables.length} tablas`);
        
        if (tables.length === 0) {
            console.log('   ⚠️  No se encontraron tablas. Ejecuta primero el script schema.sql');
        }
        
        // 3. Seed de datos iniciales
        console.log('\n3. Creando datos iniciales...');
        await DataSeeder.seedInitialData();
        
        // 4. Mostrar resumen
        console.log('\n4. Resumen del setup:');
        
        const playerCount = await dbConnection.executeRead('SELECT COUNT(*) as count FROM players');
        const hallCount = await dbConnection.executeRead('SELECT COUNT(*) as count FROM game_halls');
        const roundCount = await dbConnection.executeRead('SELECT COUNT(*) as count FROM game_rounds');
        
        console.log(`   - Jugadores: ${playerCount[0]?.count || 0}`);
        console.log(`   - Salas de juego: ${hallCount[0]?.count || 0}`);
        console.log(`   - Rondas: ${roundCount[0]?.count || 0}`);
        
        console.log('\n✅ Setup de base de datos completado exitosamente!');
        console.log('\n📋 Próximos pasos:');
        console.log('   1. Copia .env.example a .env y configura las IPs de tus servidores');
        console.log('   2. Ejecuta: npm install');
        console.log('   3. Ejecuta: npm start');
        
    } catch (error) {
        console.error('\n❌ Error durante el setup:', error.message);
        process.exit(1);
    } finally {
        await dbConnection.closeAll();
    }
}

// Funciones adicionales para mantenimiento
async function checkReplicationStatus() {
    console.log('🔍 Verificando estado de replicación...\n');
    
    try {
        const connectionStatus = await dbConnection.checkConnections();
        
        if (connectionStatus.master) {
            console.log('Master Server Status:');
            const masterStatus = await dbConnection.executeRead('SHOW MASTER STATUS');
            console.table(masterStatus);
        }
        
        if (connectionStatus.slave1) {
            console.log('\nSlave 1 Status:');
            try {
                const slave1Status = await dbConnection.executeRead('SHOW SLAVE STATUS');
                if (slave1Status.length > 0) {
                    console.log('   - IO Thread:', slave1Status[0].Slave_IO_Running);
                    console.log('   - SQL Thread:', slave1Status[0].Slave_SQL_Running);
                    console.log('   - Seconds Behind Master:', slave1Status[0].Seconds_Behind_Master);
                }
            } catch (e) {
                console.log('   - No hay información de slave disponible');
            }
        }
        
    } catch (error) {
        console.error('❌ Error verificando replicación:', error.message);
    } finally {
        await dbConnection.closeAll();
    }
}

async function resetDatabase() {
    console.log('⚠️  RESETEAR BASE DE DATOS - Esta acción eliminará todos los datos\n');
    
    const readline = require('readline');
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    rl.question('¿Estás seguro? Escribe "CONFIRMAR" para continuar: ', async (answer) => {
        if (answer === 'CONFIRMAR') {
            try {
                console.log('🧹 Limpiando datos...');
                
                await dbConnection.executeWrite('SET FOREIGN_KEY_CHECKS = 0');
                await dbConnection.executeWrite('TRUNCATE TABLE bets');
                await dbConnection.executeWrite('TRUNCATE TABLE game_rounds');
                await dbConnection.executeWrite('TRUNCATE TABLE game_sessions');
                await dbConnection.executeWrite('TRUNCATE TABLE player_stats');
                await dbConnection.executeWrite('TRUNCATE TABLE players');
                await dbConnection.executeWrite('TRUNCATE TABLE game_halls');
                await dbConnection.executeWrite('SET FOREIGN_KEY_CHECKS = 1');
                
                console.log('✅ Base de datos limpiada');
                
                await DataSeeder.seedInitialData();
                console.log('✅ Datos iniciales recreados');
                
            } catch (error) {
                console.error('❌ Error reseteando base de datos:', error.message);
            } finally {
                await dbConnection.closeAll();
            }
        } else {
            console.log('❌ Operación cancelada');
        }
        rl.close();
    });
}

// CLI Interface
const command = process.argv[2];

switch (command) {
    case 'setup':
        setupDatabase();
        break;
    case 'check-replication':
        checkReplicationStatus();
        break;
    case 'reset':
        resetDatabase();
        break;
    case 'seed-dev':
        DataSeeder.seedDevelopmentData().then(() => {
            console.log('✅ Datos de desarrollo creados');
            dbConnection.closeAll();
        }).catch(console.error);
        break;
    default:
        console.log(`
🎮 Aviator Game - Database Setup Tool

Uso: node scripts/setup_database.js [comando]

Comandos disponibles:
  setup             - Configuración inicial de la base de datos
  check-replication - Verificar estado de la replicación
  reset             - Resetear todos los datos (¡CUIDADO!)
  seed-dev          - Crear datos de desarrollo/testing

Ejemplos:
  node scripts/setup_database.js setup
  node scripts/setup_database.js check-replication
        `);
        break;
}