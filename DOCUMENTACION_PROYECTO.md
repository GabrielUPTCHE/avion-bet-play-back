# Documentación del Proyecto Aviator Game - Sistema Distribuido

## 1. Resumen del Proyecto

El presente documento describe la implementación de un sistema distribuido para el juego Aviator, implementando un clúster de bases de datos con replicación Maestro-Esclavo, balanceador de carga y comunicación en tiempo real mediante WebSockets.

### 1.1 Objetivos del Sistema

- Implementar alta disponibilidad mediante replicación de bases de datos
- Distribuir la carga de trabajo entre múltiples instancias de backend
- Mantener comunicación en tiempo real entre clientes
- Gestionar failover automático en caso de fallos del nodo maestro

### 1.2 Tecnologías Utilizadas

- **Backend**: Node.js con TypeScript, Express.js
- **Base de Datos**: MongoDB con replicación maestro-esclavo
- **Cache/Estado**: Redis para gestión de estado centralizado
- **Balanceador de Carga**: Nginx
- **Comunicación Tiempo Real**: Socket.IO con adaptador Redis
- **Contenedores**: Docker y Docker Compose
- **Proxy Reverso**: Nginx

## 2. Arquitectura del Sistema

### 2.1 Componentes Principales

#### 2.1.1 Load Balancer (Nginx)
- **Propósito**: Distribuir peticiones HTTP y WebSocket entre instancias backend
- **Algoritmo**: Least Connections para HTTP, IP Hash para WebSockets
- **Puerto**: 80 (principal), 8080 (alternativo)
- **Tecnología**: Nginx Alpine

#### 2.1.2 Backend Instances
- **Cantidad**: 3 instancias (aviator-backend-1, aviator-backend-2, aviator-backend-3)
- **Tecnología**: Node.js 18 Alpine, TypeScript, Express.js
- **Puerto Interno**: 4000
- **Estado**: Sincronizado mediante Redis

#### 2.1.3 Redis Server
- **Propósito**: Cache distribuido y gestión de estado centralizado
- **Puerto**: 6379
- **Persistencia**: AOF (Append Only File)
- **Configuración**: MaxMemory 256MB con política LRU

#### 2.1.4 MongoDB Cluster
- **Arquitectura**: 1 Primary + 2 Secondary nodes
- **Puertos**: 27017 (Primary), 27018 (Secondary1), 27019 (Secondary2)
- **Replicación**: Replica Set con failover automático


### 2.3 Configuración de Red

- **Red Docker**: `aviator-network` (Bridge)
- **Rangos IP**: Asignación automática por Docker
- **DNS Interno**: Resolución por nombre de contenedor

## 3. Configuración del Clúster de Base de Datos

### 3.1 MongoDB Replica Set

#### 3.1.1 Configuración Primary Node
```javascript
// Configuración del nodo primario
{
  _id: "aviator-replica-set",
  members: [
    { _id: 0, host: "mongodb-primary:27017", priority: 1 },
    { _id: 1, host: "mongodb-secondary1:27017", priority: 1 },
    { _id: 2, host: "mongodb-secondary2:27017", priority: 1 }
  ]
}
```

#### 3.1.2 Lógica de Conexión Backend

**Escrituras (Write Operations)**:
- Dirigidas exclusivamente al nodo Primary
- Utiliza conexión directa a `mongodb-primary:27017`
- Garantiza consistencia de datos

**Lecturas (Read Operations)**:
- Distribuidas entre nodos Secondary
- Implementa Round-Robin entre `mongodb-secondary1` y `mongodb-secondary2`
- Reduce carga en el nodo primario

```typescript
// Ejemplo de implementación
class DatabaseManager {
  private primaryConnection: MongoClient;
  private secondaryConnections: MongoClient[];
  
  async write(collection: string, data: any) {
    return await this.primaryConnection
      .db('aviator_game')
      .collection(collection)
      .insertOne(data);
  }
  
  async read(collection: string, query: any) {
    const randomSecondary = this.getRandomSecondary();
    return await randomSecondary
      .db('aviator_game')
      .collection(collection)
      .find(query).toArray();
  }
}
```

### 3.2 Gestión de Failover

#### 3.2.1 Detección de Fallos
- **Health Checks**: Verificación cada 10 segundos
- **Timeout**: 30 segundos para declarar nodo inaccesible
- **Retry Logic**: 3 intentos antes de failover

#### 3.2.2 Proceso de Failover
1. **Detección**: MongoDB detecta fallo del Primary
2. **Elección**: Replica Set elige nuevo Primary automáticamente
3. **Reconexión**: Backend detecta cambio y actualiza conexiones
4. **Notificación**: Logs de sistema registran el evento

```typescript
// Implementación de reconexión automática
class ConnectionManager {
  async handleConnectionError() {
    try {
      await this.discoverNewPrimary();
      await this.reconnectToPrimary();
      this.notifyReconnection();
    } catch (error) {
      this.handleFailoverFailure(error);
    }
  }
}
```

## 4. Balanceador de Carga

### 4.1 Configuración Nginx

#### 4.1.1 Upstream Backend
```nginx
upstream backend {
    least_conn;
    server aviator-backend-1:4000 max_fails=3 fail_timeout=30s;
    server aviator-backend-2:4000 max_fails=3 fail_timeout=30s;
    server aviator-backend-3:4000 max_fails=3 fail_timeout=30s;
}
```

#### 4.1.2 Upstream WebSocket
```nginx
upstream websocket {
    ip_hash;  # Mantiene sesión WebSocket
    server aviator-backend-1:4000 max_fails=3 fail_timeout=30s;
    server aviator-backend-2:4000 max_fails=3 fail_timeout=30s;
    server aviator-backend-3:4000 max_fails=3 fail_timeout=30s;
}
```

### 4.2 Algoritmos de Balanceo

- **HTTP Requests**: Least Connections (menos conexiones activas)
- **WebSocket Connections**: IP Hash (afinidad de sesión)
- **Health Checks**: Automaticos con retry logic

## 5. Comunicación en Tiempo Real

### 5.1 Socket.IO con Redis Adapter

#### 5.1.1 Configuración del Adaptador
```typescript
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';

const pubClient = createClient({ url: 'redis://redis-server:6379' });
const subClient = pubClient.duplicate();

io.adapter(createAdapter(pubClient, subClient));
```

#### 5.1.2 Sincronización de Estado

**Eventos Sincronizados**:
- Inicio/Fin de rondas de juego
- Apuestas de jugadores
- Resultados de partidas
- Estados de conexión de usuarios

**Implementación**:
```typescript
class GameStateManager {
  async broadcastGameEvent(event: GameEvent) {
    // Publican en Redis para sincronización
    await this.redisClient.publish('game:events', JSON.stringify(event));
    
    // Emit local para clientes conectados
    this.io.emit('gameUpdate', event);
  }
  
  async handleRedisMessage(channel: string, message: string) {
    const event = JSON.parse(message);
    // Propagar a clientes locales
    this.io.emit('gameUpdate', event);
  }
}
```

## 6. Instrucciones de Despliegue

### 6.1 Prerrequisitos

- Docker Engine 20.10+
- Docker Compose 2.0+
- Sistema operativo: Linux/Windows/macOS
- Memoria RAM: Mínimo 4GB disponible
- Espacio en disco: 2GB disponible

### 6.2 Despliegue en Entorno LAN

#### 6.2.1 Clonar el Repositorio
```bash
git clone https://github.com/GabrielUPTCHE/avion-bet-play-back.git
cd avion-bet-play-back
```

#### 6.2.2 Configurar Variables de Entorno
```bash
# Crear archivo .env
cp .env.example .env

# Variables principales
NODE_ENV=production
MONGODB_PRIMARY_URI=mongodb://mongodb-primary:27017/aviator_game
MONGODB_SECONDARY_URI=mongodb://mongodb-secondary1:27017,mongodb-secondary2:27017/aviator_game
REDIS_URL=redis://redis-server:6379
```

#### 6.2.3 Crear Red Docker
```bash
docker network create aviator-network
```

#### 6.2.4 Desplegar MongoDB Cluster
```bash
# Iniciar servicios de MongoDB
docker-compose -f docker-compose.mongodb.yml up -d

# Esperar inicialización (30-60 segundos)
sleep 60

# Configurar Replica Set
docker exec mongodb-primary mongosh --eval "
rs.initiate({
  _id: 'aviator-replica-set',
  members: [
    { _id: 0, host: 'mongodb-primary:27017', priority: 2 },
    { _id: 1, host: 'mongodb-secondary1:27017', priority: 1 },
    { _id: 2, host: 'mongodb-secondary2:27017', priority: 1 }
  ]
})
"
```

#### 6.2.5 Desplegar Backend y Load Balancer
```bash
# Construir imágenes
docker-compose build

# Iniciar servicios
docker-compose up -d
```

#### 6.2.6 Verificar Despliegue
```bash
# Verificar estado de contenedores
docker-compose ps

# Verificar logs
docker-compose logs -f

# Verificar conectividad
curl http://localhost/health
```

### 6.3 Configuración de Red LAN

#### 6.3.1 Acceso desde Red Local
Para acceder desde otros equipos en la LAN:

1. **Obtener IP del host**:
```bash
# Linux/macOS
hostname -I

# Windows
ipconfig
```

2. **Configurar firewall** (si es necesario):
```bash
# Linux (Ubuntu/Debian)
sudo ufw allow 80
sudo ufw allow 8080

# Windows
# Abrir puertos 80 y 8080 en Windows Firewall
```

3. **Acceder desde otros equipos**:
```
http://[IP_DEL_HOST]/
http://[IP_DEL_HOST]:8080/
```

## 7. Pruebas del Sistema

### 7.1 Pruebas de Conectividad

#### 7.1.1 Health Check Endpoints
```bash
# Verificar load balancer
curl http://localhost/health

# Verificar Redis
curl http://localhost/redis/status

# Verificar MongoDB
curl http://localhost/database/status
```

#### 7.1.2 Pruebas de Load Balancer
```bash
# Múltiples requests para verificar distribución
for i in {1..10}; do
  curl -s http://localhost/api/instance | grep instance_id
done
```

### 7.2 Pruebas de Failover

#### 7.2.1 Simulación de Fallo de Backend
```bash
# Detener una instancia
docker stop aviator-backend-1

# Verificar que el tráfico se redistribuye
curl http://localhost/health

# Reiniciar instancia
docker start aviator-backend-1
```

#### 7.2.2 Simulación de Fallo de MongoDB Primary
```bash
# Detener primary
docker stop mongodb-primary

# Verificar promoción de secondary
docker exec mongodb-secondary1 mongosh --eval "rs.status()"

# El sistema debe continuar funcionando
curl http://localhost/database/status
```

### 7.3 Pruebas de WebSocket

#### 7.3.1 Cliente de Prueba
```javascript
// client-test.js
const io = require('socket.io-client');

const socket = io('http://localhost');

socket.on('connect', () => {
  console.log('Conectado:', socket.id);
  
  // Enviar apuesta de prueba
  socket.emit('placeBet', { amount: 100, multiplier: 2.0 });
});

socket.on('gameUpdate', (data) => {
  console.log('Actualización del juego:', data);
});
```

```bash
# Ejecutar cliente de prueba
node client-test.js
```

### 7.4 Pruebas de Carga

#### 7.4.1 Usando Apache Bench
```bash
# Instalar ab (si no está disponible)
sudo apt-get install apache2-utils

# Prueba de carga HTTP
ab -n 1000 -c 50 http://localhost/

# Prueba con POST requests
ab -n 500 -c 25 -p bet-data.json -T application/json http://localhost/api/bet
```

#### 7.4.2 Monitoreo Durante Pruebas
```bash
# Monitorear recursos de contenedores
docker stats

# Monitorear logs en tiempo real
docker-compose logs -f --tail=100
```

## 8. Monitoreo y Mantenimiento

### 8.1 Comandos de Administración

#### 8.1.1 Estado del Sistema
```bash
# Estado general
docker-compose ps

# Recursos utilizados
docker stats --no-stream

# Logs del sistema
docker-compose logs --since=1h
```

#### 8.1.2 Backup de Datos
```bash
# Backup de MongoDB
docker exec mongodb-primary mongodump --out /backup/$(date +%Y%m%d)

# Backup de Redis
docker exec aviator-redis redis-cli BGSAVE
```

#### 8.1.3 Limpieza del Sistema
```bash
# Limpiar logs antiguos
docker system prune -f

# Reiniciar servicios sin pérdida de datos
docker-compose restart
```

### 8.2 Métricas Importantes

#### 8.2.1 Performance Indicators
- **Latencia promedio**: < 100ms para requests HTTP
- **Throughput**: > 1000 requests/segundo
- **Disponibilidad**: > 99.9% uptime
- **Tiempo de failover**: < 30 segundos

#### 8.2.2 Alertas Críticas
- Uso de memoria > 80%
- Lag de replicación > 10 segundos
- Instancias backend down > 1
- Redis conexiones rechazadas

## 9. Solución de Problemas

### 9.1 Problemas Comunes

#### 9.1.1 Backend No Responde
```bash
# Verificar logs
docker-compose logs aviator-backend-1

# Reiniciar instancia específica
docker-compose restart aviator-backend-1

# Verificar conectividad Redis
docker exec aviator-backend-1 ping redis-server
```

#### 9.1.2 MongoDB Replica Set Problemas
```bash
# Verificar estado del replica set
docker exec mongodb-primary mongosh --eval "rs.status()"

# Forzar reconfiguración
docker exec mongodb-primary mongosh --eval "rs.reconfig(config, {force: true})"
```

#### 9.1.3 Load Balancer Issues
```bash
# Verificar configuración Nginx
docker exec aviator-nginx-lb nginx -t

# Recargar configuración
docker exec aviator-nginx-lb nginx -s reload
```

### 9.2 Recovery Procedures

#### 9.2.1 Recuperación Total del Sistema
```bash
# Parar todos los servicios
docker-compose down

# Limpiar volúmenes (CUIDADO: Pérdida de datos)
docker-compose down -v

# Reiniciar desde cero
docker-compose up -d
```

## 10. Conclusiones

### 10.1 Arquitectura Implementada

El sistema implementado proporciona:

- **Alta Disponibilidad**: Mediante replicación y balanceo de carga
- **Escalabilidad Horizontal**: Fácil adición de nuevas instancias
- **Tolerancia a Fallos**: Failover automático en todos los niveles
- **Rendimiento Optimizado**: Distribución inteligente de la carga

### 10.2 Beneficios Alcanzados

- **Confiabilidad**: Sistema robusto ante fallos individuales
- **Performance**: Distribución eficiente de recursos
- **Mantenibilidad**: Arquitectura modular y bien documentada
- **Monitoreo**: Visibilidad completa del estado del sistema

### 10.3 Consideraciones Futuras

- Implementación de métricas avanzadas (Prometheus/Grafana)
- Automatización de backups
- Implementación de SSL/TLS
- Optimización de consultas de base de datos
- Implementación de cache adicional (Memcached)

---

**Versión del Documento**: 1.0  
**Fecha de Creación**: Octubre 2025  
**Autores**: Gabriel, Edinson, Deivid  
**Estado**: Producción