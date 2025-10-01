# Guía de Comandos MongoDB Replica Set
# ====================================

## 🚀 Comandos Básicos

### Levantar MongoDB Replica Set
```bash
# Levantar solo MongoDB
docker-compose -f docker-compose.mongodb.yml up -d

# Ver logs
docker-compose -f docker-compose.mongodb.yml logs -f

# Verificar estado
docker-compose -f docker-compose.mongodb.yml ps
```

### Parar MongoDB
```bash
# Parar servicios
docker-compose -f docker-compose.mongodb.yml down

# Parar y eliminar volúmenes (⚠️ BORRA TODOS LOS DATOS)
docker-compose -f docker-compose.mongodb.yml down -v
```

## 🔧 Comandos de Administración

### Conectar a MongoDB
```bash
# Conectar al Primary
docker exec -it mongodb-primary mongosh -u admin -p aviatorpassword123

# Conectar al Secondary 1
docker exec -it mongodb-secondary1 mongosh -u admin -p aviatorpassword123

# Conectar al Secondary 2
docker exec -it mongodb-secondary2 mongosh -u admin -p aviatorpassword123
```

### Verificar Replica Set
```javascript
// Dentro de mongosh
rs.status()                    // Estado del replica set
rs.isMaster()                 // Verificar si es master
rs.conf()                     // Configuración del replica set
db.runCommand("ismaster")     // Info detallada del master
```

### Comandos Útiles en MongoDB
```javascript
// Cambiar a base de datos del juego
use aviator_game

// Ver colecciones
show collections

// Contar documentos
db.game_rounds.countDocuments()
db.bets.countDocuments()
db.player_stats.countDocuments()

// Ver últimas rondas
db.game_rounds.find().sort({start_time: -1}).limit(5)

// Ver estadísticas de un jugador
db.player_stats.find({username: "Gabriel"})

// Ver apuestas de una ronda
db.bets.find({round_id: "round_1234567890"})
```

## 📊 Consultas de Ejemplo

### Top 10 Jugadores por Ganancias
```javascript
db.player_stats.find().sort({total_winnings: -1}).limit(10)
```

### Rondas con Mayor Multiplicador
```javascript
db.game_rounds.find().sort({crash_multiplier: -1}).limit(10)
```

### Estadísticas Generales
```javascript
db.game_rounds.aggregate([
  {
    $group: {
      _id: null,
      totalRounds: {$sum: 1},
      avgMultiplier: {$avg: "$crash_multiplier"},
      totalBets: {$sum: "$total_bets"},
      totalWinnings: {$sum: "$total_winnings"}
    }
  }
])
```

## 🔄 Failover Testing

### Simular Caída del Primary
```bash
# Parar el primary
docker stop mongodb-primary

# Ver como se elige nuevo primary
docker exec -it mongodb-secondary1 mongosh -u admin -p aviatorpassword123 --eval "rs.status()"

# Reiniciar el primary (se convertirá en secondary)
docker start mongodb-primary
```

## 🌐 Acceso Web

### Mongo Express (Interfaz Web)
- URL: http://localhost:8081
- Usuario: admin
- Password: aviatorpassword123

## 📈 Endpoints del Backend

### Estadísticas Disponibles
```bash
# Health check (incluye MongoDB)
curl http://localhost:4000/health

# Top jugadores
curl http://localhost:4000/stats/players/top?limit=10

# Rondas recientes
curl http://localhost:4000/stats/rounds/recent?limit=20

# Estadísticas de ronda específica
curl http://localhost:4000/stats/round/round_1234567890

# Estadísticas de jugador específico
curl http://localhost:4000/stats/player/player123
```

## 🛠️ Solución de Problemas

### Error: "not master"
```javascript
// Encontrar quien es el master
rs.status()
// Conectar al nodo que sea PRIMARY
```

### Error de conexión
```bash
# Verificar que los contenedores estén corriendo
docker ps | grep mongodb

# Ver logs de errores
docker logs mongodb-primary
docker logs mongodb-secondary1
docker logs mongodb-secondary2
```

### Reinicializar Replica Set
```javascript
// SOLO EN CASO EXTREMO - BORRA TODO
rs.reconfig({
  _id: "aviator-replica",
  version: 2,
  members: [
    {_id: 0, host: "mongodb-primary:27017", priority: 3},
    {_id: 1, host: "mongodb-secondary1:27017", priority: 1},
    {_id: 2, host: "mongodb-secondary2:27017", priority: 1}
  ]
}, {force: true})
```

## 🎯 Comandos de Desarrollo

### Levantar todo el sistema
```bash
# MongoDB + Backend + Redis
docker-compose -f docker-compose.mongodb.yml up -d
npm install  # Instalar dependencias de MongoDB
npm run dev  # O docker-compose up según tu setup
```

### Monitoreo en tiempo real
```bash
# Logs de MongoDB
docker-compose -f docker-compose.mongodb.yml logs -f

# Logs del backend
docker-compose logs -f backend-1 backend-2 backend-3
```