// database/connection.js
const mysql = require('mysql2/promise');
require('dotenv').config();

class DatabaseConnection {
    constructor() {
        this.masterPool = null;
        this.slave1Pool = null;
        this.slave2Pool = null;
        this.currentSlaveIndex = 0; // Para load balancing entre slaves
        
        this.initializePools();
    }

    initializePools() {
        // Pool de conexiones para el Master (escritura)
        this.masterPool = mysql.createPool({
            host: process.env.DB_MASTER_HOST || 'localhost',
            port: process.env.DB_MASTER_PORT || 3306,
            user: process.env.DB_MASTER_USER,
            password: process.env.DB_MASTER_PASSWORD,
            database: process.env.DB_MASTER_DATABASE,
            waitForConnections: true,
            connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 20,
            queueLimit: 0,
            acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000,
            timeout: parseInt(process.env.DB_TIMEOUT) || 60000,
            reconnect: true,
            charset: 'utf8mb4'
        });

        // Pool de conexiones para Slave 1 (lectura)
        this.slave1Pool = mysql.createPool({
            host: process.env.DB_SLAVE1_HOST,
            port: process.env.DB_SLAVE1_PORT || 3306,
            user: process.env.DB_SLAVE1_USER,
            password: process.env.DB_SLAVE1_PASSWORD,
            database: process.env.DB_SLAVE1_DATABASE,
            waitForConnections: true,
            connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 20,
            queueLimit: 0,
            acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000,
            timeout: parseInt(process.env.DB_TIMEOUT) || 60000,
            reconnect: true,
            charset: 'utf8mb4'
        });

        // Pool de conexiones para Slave 2 (lectura)
        this.slave2Pool = mysql.createPool({
            host: process.env.DB_SLAVE2_HOST,
            port: process.env.DB_SLAVE2_PORT || 3306,
            user: process.env.DB_SLAVE2_USER,
            password: process.env.DB_SLAVE2_PASSWORD,
            database: process.env.DB_SLAVE2_DATABASE,
            waitForConnections: true,
            connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 20,
            queueLimit: 0,
            acquireTimeout: parseInt(process.env.DB_ACQUIRE_TIMEOUT) || 60000,
            timeout: parseInt(process.env.DB_TIMEOUT) || 60000,
            reconnect: true,
            charset: 'utf8mb4'
        });

        // Configurar manejo de errores
        this.setupErrorHandling();
    }

    setupErrorHandling() {
        [this.masterPool, this.slave1Pool, this.slave2Pool].forEach((pool, index) => {
            const poolName = index === 0 ? 'Master' : `Slave${index}`;
            
            pool.on('connection', (connection) => {
                console.log(`✅ Nueva conexión establecida en ${poolName}: ${connection.threadId}`);
            });

            pool.on('error', (err) => {
                console.error(`❌ Error en pool ${poolName}:`, err);
                if (err.code === 'PROTOCOL_CONNECTION_LOST') {
                    console.log(`🔄 Reintentando conexión en ${poolName}...`);
                }
            });
        });
    }

    // Obtener conexión para escritura (Master)
    async getMasterConnection() {
        try {
            return await this.masterPool.getConnection();
        } catch (error) {
            console.error('❌ Error al obtener conexión del Master:', error);
            throw error;
        }
    }

    // Obtener conexión para lectura con load balancing
    async getSlaveConnection() {
        const slavePools = [this.slave1Pool, this.slave2Pool];
        let attempts = 0;
        const maxAttempts = slavePools.length;

        while (attempts < maxAttempts) {
            try {
                const currentPool = slavePools[this.currentSlaveIndex];
                const connection = await currentPool.getConnection();
                
                // Rotar al siguiente slave para la próxima consulta
                this.currentSlaveIndex = (this.currentSlaveIndex + 1) % slavePools.length;
                
                return connection;
            } catch (error) {
                console.warn(`⚠️ Error en Slave ${this.currentSlaveIndex + 1}:`, error.message);
                this.currentSlaveIndex = (this.currentSlaveIndex + 1) % slavePools.length;
                attempts++;
            }
        }

        console.error('❌ Todos los slaves fallaron, usando Master para lectura');
        return await this.getMasterConnection();
    }

    // Ejecutar consulta de escritura
    async executeWrite(query, params = []) {
        const connection = await this.getMasterConnection();
        try {
            const [results] = await connection.execute(query, params);
            return results;
        } catch (error) {
            console.error('❌ Error en consulta de escritura:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Ejecutar consulta de lectura
    async executeRead(query, params = []) {
        const connection = await this.getSlaveConnection();
        try {
            const [results] = await connection.execute(query, params);
            return results;
        } catch (error) {
            console.error('❌ Error en consulta de lectura:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Ejecutar transacción (siempre en Master)
    async executeTransaction(callback) {
        const connection = await this.getMasterConnection();
        try {
            await connection.beginTransaction();
            
            const result = await callback(connection);
            
            await connection.commit();
            return result;
        } catch (error) {
            await connection.rollback();
            console.error('❌ Error en transacción, rollback ejecutado:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // Verificar estado de las conexiones
    async checkConnections() {
        const results = {
            master: false,
            slave1: false,
            slave2: false
        };

        try {
            const masterConn = await this.masterPool.getConnection();
            await masterConn.ping();
            results.master = true;
            masterConn.release();
        } catch (error) {
            console.error('❌ Master no disponible:', error.message);
        }

        try {
            const slave1Conn = await this.slave1Pool.getConnection();
            await slave1Conn.ping();
            results.slave1 = true;
            slave1Conn.release();
        } catch (error) {
            console.error('❌ Slave1 no disponible:', error.message);
        }

        try {
            const slave2Conn = await this.slave2Pool.getConnection();
            await slave2Conn.ping();
            results.slave2 = true;
            slave2Conn.release();
        } catch (error) {
            console.error('❌ Slave2 no disponible:', error.message);
        }

        return results;
    }

    // Cerrar todas las conexiones
    async closeAll() {
        console.log('🔌 Cerrando conexiones de base de datos...');
        
        await Promise.all([
            this.masterPool.end(),
            this.slave1Pool.end(),
            this.slave2Pool.end()
        ]);
        
        console.log('✅ Todas las conexiones cerradas');
    }
}

// Instancia singleton
const dbConnection = new DatabaseConnection();

module.exports = dbConnection;