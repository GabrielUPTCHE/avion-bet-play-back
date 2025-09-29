# 🎮 Aviator Game - Guía de Base de Datos MySQL con Replicación

Esta guía te ayudará a configurar una base de datos MySQL con replicación 1 maestro + 2 esclavos para el juego Aviator.

## 📋 Estructura del Proyecto

```
database/
├── schema.sql              # Esquema de la base de datos
├── connection.js           # Manejo de conexiones con load balancing
├── models/                 # Modelos de datos
│   ├── Player.js
│   ├── GameHall.js
│   ├── GameRound.js
│   └── Bet.js
├── seeders/               # Scripts para datos iniciales
│   └── initial_data.js
└── replication/           # Configuración de replicación
    ├── master_config.cnf
    ├── slave1_config.cnf
    ├── slave2_config.cnf
    ├── setup_master.sql
    ├── setup_slaves.sql
    └── monitor_replication.sh
```

## 🗃️ Esquema de Base de Datos

### Tablas principales:
- **players**: Información de jugadores
- **game_halls**: Salas de juego
- **game_sessions**: Sesiones de jugadores en salas
- **game_rounds**: Rondas de juego
- **bets**: Apuestas realizadas
- **player_stats**: Estadísticas de jugadores
- **system_config**: Configuración del sistema

### Características:
- ✅ Soporte para múltiples salas de juego
- ✅ Sistema de apuestas con cash-out
- ✅ Estadísticas detalladas de jugadores
- ✅ Triggers automáticos para estadísticas
- ✅ Índices optimizados para rendimiento

## 🏗️ Configuración de Replicación MySQL

### Arquitectura:
- **1 Servidor Master**: Escritura (INSERT, UPDATE, DELETE)
- **2 Servidores Slave**: Lectura (SELECT) con load balancing

### Usuarios creados:
- `replica_user`: Para replicación entre servidores
- `aviator_app`: Para la aplicación (lectura/escritura en master)
- `aviator_read`: Para la aplicación (solo lectura en slaves)
- `monitor_user`: Para monitoreo de replicación

## 🚀 Instalación Rápida con Docker

### Opción 1: Deploy automático con Docker Compose

```bash
# Hacer ejecutable el script
chmod +x deploy_mysql_replication.sh

# Ejecutar deployment
./deploy_mysql_replication.sh
```

Esto creará:
- MySQL Master en puerto 3306
- MySQL Slave 1 en puerto 3307  
- MySQL Slave 2 en puerto 3308
- PHPMyAdmin en http://localhost:8080

### Opción 2: Instalación manual

1. **Instalar dependencias**:
```bash
npm install mysql2 dotenv uuid
```

2. **Configurar servidores MySQL**:
   - Copia los archivos de configuración de `database/replication/` a cada servidor
   - Ejecuta `setup_master.sql` en el master
   - Ejecuta `setup_slaves.sql` en cada slave

3. **Configurar variables de entorno**:
```bash
cp .env.example .env
# Edita .env con las IPs reales de tus servidores
```

4. **Ejecutar schema y datos iniciales**:
```bash
# En el servidor master
mysql -u root -p < database/schema.sql

# Setup automático
node scripts/setup_database.js setup
```

## 🔧 Uso de la Base de Datos en Node.js

### Conexión automática con load balancing:

```javascript
const dbConnection = require('./database/connection');

// Escritura (usa Master automáticamente)
await dbConnection.executeWrite(
    'INSERT INTO players (id_player, username) VALUES (?, ?)',
    [playerId, username]
);

// Lectura (usa Slaves con load balancing)
const players = await dbConnection.executeRead(
    'SELECT * FROM players WHERE username = ?',
    [username]
);

// Transacción (siempre en Master)
await dbConnection.executeTransaction(async (connection) => {
    await connection.execute('UPDATE player_stats SET balance = balance - ? WHERE id_player = ?', [amount, playerId]);
    await connection.execute('INSERT INTO bets (...) VALUES (...)', [...]);
});
```

### Usando los modelos:

```javascript
const PlayerModel = require('./database/models/Player');
const BetModel = require('./database/models/Bet');

// Crear jugador
const player = await PlayerModel.create({
    username: 'nuevo_jugador',
    register_date: new Date()
});

// Crear apuesta
const bet = await BetModel.create({
    id_player: player.id_player,
    id_round: roundId,
    amount: 50.00
});

// Cash out
const result = await BetModel.cashOut(bet.id_bet, 2.5);
```

## 📊 Monitoreo de Replicación

### Script automático:
```bash
chmod +x database/replication/monitor_replication.sh
./database/replication/monitor_replication.sh
```

### Verificación manual:
```sql
-- En el Master
SHOW MASTER STATUS;

-- En cada Slave
SHOW SLAVE STATUS\G
```

### Verificar sincronización:
```bash
node scripts/setup_database.js check-replication
```

## 🛠️ Comandos Útiles

### Setup inicial:
```bash
node scripts/setup_database.js setup
```

### Crear datos de desarrollo:
```bash
node scripts/setup_database.js seed-dev
```

### Resetear base de datos:
```bash
node scripts/setup_database.js reset
```

### Verificar conexiones:
```javascript
const status = await dbConnection.checkConnections();
console.log(status); // { master: true, slave1: true, slave2: false }
```

## 🔧 Integración con tu Proyecto Actual

Para integrar con tu `index.js` actual, reemplaza las funciones de memoria por las de base de datos:

```javascript
// Antes (en memoria)
let players = [];
function addPlayer(player) {
    players.push(player);
    return player;
}

// Después (con base de datos)
const PlayerModel = require('./database/models/Player');
const GameHallModel = require('./database/models/GameHall');

async function addPlayer(playerData) {
    const player = await PlayerModel.create(playerData);
    
    // Agregar a la sala por defecto
    const defaultHall = await GameHallModel.getDefaultHall();
    await GameHallModel.addPlayerToHall(player.id_player, defaultHall.id_game_hall);
    
    return player;
}
```

## 🚨 Troubleshooting

### Error de conexión:
1. Verificar que los servidores MySQL estén ejecutándose
2. Verificar las credenciales en `.env`
3. Verificar que los puertos estén abiertos

### Replicación no funciona:
1. Verificar usuarios de replicación
2. Verificar configuración de binary logs
3. Revisar logs de MySQL: `/var/log/mysql/mysql.log`

### Performance issues:
1. Verificar índices en las tablas
2. Monitorear queries lentas
3. Ajustar pool de conexiones en `connection.js`

## 🔐 Seguridad

- Cambia todas las contraseñas por defecto
- Usa SSL/TLS para conexiones de replicación
- Configura firewall para limitar acceso a puertos MySQL
- Considera usar MySQL 8.0+ para mejores características de seguridad

## 📈 Escalabilidad

Esta configuración soporta:
- Miles de jugadores simultáneos
- Cientos de apuestas por segundo
- Múltiples salas de juego
- Balanceador de carga automático entre slaves
- Failover automático en caso de falla de slaves

¡Tu sistema de base de datos está listo para producción! 🎮✨