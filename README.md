# 🎮 Aviator Game - Backend con MySQL Replicación

Backend del juego de apuestas Aviator con sistema de base de datos MySQL distribuida (1 Master + 2 Slaves).

## 🚀 Deploy Rápido con Docker

### 1. Clonar y preparar
```bash
git clone https://github.com/GabrielUPTCHE/avion-bet-play-back.git
cd avion-bet-play-back
```

### 2. Desplegar MySQL con replicación
```bash
# Hacer ejecutable el script
chmod +x deploy_mysql_replication.sh

# Desplegar infraestructura completa
./deploy_mysql_replication.sh
```

### 3. Validar la replicación
```bash
# Verificar que todo funcione correctamente
chmod +x validate_replication.sh
./validate_replication.sh
```

### 4. Instalar dependencias y configurar
```bash
npm install
node scripts/setup_database.js setup
```

### 5. Iniciar el servidor
```bash
npm start
```

## 🏗️ Arquitectura del Sistema

```
🎮 Cliente (Frontend)
    ↕️ WebSocket
📡 Node.js + Socket.io (Puerto 4000)
    ↕️ Connection Pool
🔄 Load Balancer Automático
    ↕️
🗄️ MySQL Master (Puerto 3306) ← Escritura
    ↓ Replicación Binlog + GTID
🗄️ MySQL Slave 1 (Puerto 3307) ← Lectura
🗄️ MySQL Slave 2 (Puerto 3309) ← Lectura
```

## 📊 Servicios Desplegados

| Servicio | Puerto | Credenciales | Uso |
|----------|--------|--------------|-----|
| **MySQL Master** | 3306 | `aviator_app` / `AppPassword123!` | Escritura |
| **MySQL Slave 1** | 3307 | `aviator_read` / `ReadPassword123!` | Lectura |
| **MySQL Slave 2** | 3309 | `aviator_read` / `ReadPassword123!` | Lectura |
| **PHPMyAdmin** | 8080 | Acceso web a todas las bases | Admin |
| **Node.js API** | 4000 | - | WebSocket + API |

## 🔐 Usuarios de Base de Datos

- **`replica_user`**: Usuario dedicado para replicación entre servidores
- **`aviator_app`**: Usuario de aplicación para operaciones de escritura
- **`aviator_read`**: Usuario de solo lectura para los slaves
- **`monitor_user`**: Usuario para monitoreo del sistema

## 🎯 Características Principales

### ✅ Sistema de Replicación Robusto
- **Master-Slave con 2 esclavos** para alta disponibilidad
- **GTID (Global Transaction ID)** para replicación consistente
- **Load balancing automático** entre slaves para lecturas
- **Failover automático** si un slave falla

### ✅ Base de Datos Optimizada
- **7 tablas** con relaciones optimizadas
- **Índices especializados** para consultas rápidas
- **Triggers automáticos** para estadísticas
- **Transacciones ACID** para operaciones críticas

### ✅ Sistema de Juego Completo
- **Múltiples salas de juego** simultáneas
- **Sistema de apuestas** con cash-out en tiempo real
- **Estadísticas de jugadores** detalladas
- **Historial completo** de partidas

## 🛠️ Comandos Útiles

### Gestión de Base de Datos
```bash
# Setup inicial
node scripts/setup_database.js setup

# Verificar replicación
node scripts/setup_database.js check-replication

# Crear datos de desarrollo
node scripts/setup_database.js seed-dev

# Resetear base de datos (¡CUIDADO!)
node scripts/setup_database.js reset
```

### Gestión de Contenedores
```bash
# Ver logs
docker logs aviator-mysql-master
docker logs aviator-mysql-slave1
docker logs aviator-mysql-slave2

# Reiniciar servicios
docker-compose restart

# Parar todo
docker-compose down

# Parar y eliminar volúmenes
docker-compose down -v
```

### Verificación Manual
```bash
# Estado de replicación en slaves
docker exec aviator-mysql-slave1 mysql -uroot -pRootPassword123! -e "SHOW SLAVE STATUS\G"
docker exec aviator-mysql-slave2 mysql -uroot -pRootPassword123! -e "SHOW SLAVE STATUS\G"

# Estado del master
docker exec aviator-mysql-master mysql -uroot -pRootPassword123! -e "SHOW MASTER STATUS"
```

## 🔧 Integración con tu Código

El sistema incluye modelos pre-construidos para integrarse fácilmente:

```javascript
const PlayerModel = require('./database/models/Player');
const BetModel = require('./database/models/Bet');
const GameHallModel = require('./database/models/GameHall');
const GameRoundModel = require('./database/models/GameRound');

// Ejemplo: Crear jugador
const player = await PlayerModel.create({
    username: 'nuevo_jugador',
    register_date: new Date()
});

// Ejemplo: Realizar apuesta
const bet = await BetModel.create({
    id_player: player.id_player,
    id_round: currentRound.id_round,
    amount: 50.00
});

// Ejemplo: Cash out
const result = await BetModel.cashOut(bet.id_bet, 2.5);
```

## 🚨 Troubleshooting

### Problema: Replicación no funciona
**Solución:**
```bash
# 1. Verificar usuarios de replicación
docker exec aviator-mysql-master mysql -uroot -pRootPassword123! -e "
SELECT User, Host FROM mysql.user WHERE User = 'replica_user';
"

# 2. Verificar estado de slaves
./validate_replication.sh

# 3. Reiniciar replicación si es necesario
docker exec aviator-mysql-slave1 mysql -uroot -pRootPassword123! -e "
STOP SLAVE; RESET SLAVE; START SLAVE;
"
```

### Problema: Error de conexión
**Solución:**
1. Verificar que los contenedores estén ejecutándose: `docker ps`
2. Verificar las credenciales en `.env`
3. Verificar que los puertos no estén ocupados: `netstat -an | grep 3306`

### Problema: Performance lenta
**Solución:**
1. Verificar configuración del pool de conexiones
2. Revisar índices de base de datos
3. Monitorear queries lentas en logs de MySQL

## 📈 Escalabilidad y Rendimiento

Esta configuración soporta:
- ✅ **Miles de jugadores** simultáneos
- ✅ **Cientos de apuestas** por segundo
- ✅ **Múltiples salas** de juego en paralelo
- ✅ **Alta disponibilidad** con failover automático
- ✅ **Distribución de carga** automática en lecturas

## 📚 Documentación Adicional

- [📖 Guía Detallada de Base de Datos](README_DATABASE.md)
- [🔧 Configuración de Replicación](database/replication/)
- [📊 Scripts de Monitoreo](scripts/)

---

**Desarrollado por:** Gabriel, Edinson, Deivid  
**Tecnologías:** Node.js, Socket.io, MySQL 8.0, Docker  
**Arquitectura:** Master-Slave Replication con Load Balancing
