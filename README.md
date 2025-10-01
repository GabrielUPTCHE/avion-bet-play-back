# Aviator Game - Sistema Distribuido Backend

Backend del juego de apuestas Aviator con arquitectura distribuida que incluye balanceador de carga, múltiples instancias de backend, Redis para estado centralizado y MongoDB con replicación Master-Slave.

## Arquitectura del Sistema

El sistema está compuesto por las siguientes capas:

- **Balanceador de Carga**: NGINX con algoritmo least_conn para HTTP y ip_hash para WebSockets
- **Backend Distribuido**: 3 instancias de Node.js + TypeScript con Express.js y Socket.IO
- **Estado Centralizado**: Redis 7 con persistencia AOF para sincronización entre instancias
- **Base de Datos**: MongoDB Replica Set (1 Primary + 2 Secondary) para alta disponibilidad
- **Monitoreo**: Mongo Express para administración de base de datos

## Requisitos Previos

- Docker y Docker Compose instalados
- Puertos disponibles: 80, 8080, 6379, 27017, 27018, 27019, 8081
- Mínimo 4GB RAM disponible para contenedores

## Despliegue Completo del Sistema

### 1. Preparación del Entorno

```bash
# Clonar el repositorio
git clone https://github.com/GabrielUPTCHE/avion-bet-play-back.git
cd avion-bet-play-back

# Crear red Docker para el proyecto
docker network create aviator-network
```

### 2. Desplegar Base de Datos MongoDB (Replica Set)

```bash
# Iniciar el cluster de MongoDB con 1 Primary + 2 Secondary
docker-compose -f docker-compose.mongodb.yml up -d

# Verificar que los contenedores estén ejecutándose
docker-compose -f docker-compose.mongodb.yml ps

# Ver logs de inicialización
docker-compose -f docker-compose.mongodb.yml logs -f mongodb-primary
```

### 3. Configurar Replica Set de MongoDB

```bash
# Conectar al MongoDB Primary para configurar el replica set
docker exec -it mongodb-primary mongosh

# Dentro de mongosh, ejecutar:
rs.initiate({
  _id: "aviator-replica",
  members: [
    { _id: 0, host: "mongodb-primary:27017", priority: 1 },
    { _id: 1, host: "mongodb-secondary1:27017", priority: 1 },
    { _id: 2, host: "mongodb-secondary2:27017", priority: 1 }
  ]
})

# Verificar el estado del replica set
rs.status()

# Salir de mongosh
exit
```

### 4. Desplegar Backend con Balanceador de Carga

```bash
# Construir las imágenes de los backends
docker-compose build

# Iniciar todos los servicios (Redis + 3 Backends + NGINX)
docker-compose up -d

# Verificar que todos los contenedores estén ejecutándose
docker-compose ps
```

### 5. Verificar el Estado del Sistema

```bash
# Verificar logs de todos los servicios
docker-compose logs -f

# Verificar logs específicos del balanceador de carga
docker-compose logs nginx-load-balancer

# Verificar logs de las instancias backend
docker-compose logs aviator-backend-1
docker-compose logs aviator-backend-2  
docker-compose logs aviator-backend-3

# Verificar conexión a Redis
docker exec -it aviator-redis redis-cli ping
```

## Comandos de Administración

### Gestión de Contenedores

```bash
# Detener todos los servicios
docker-compose down
docker-compose -f docker-compose.mongodb.yml down

# Reiniciar servicios específicos
docker-compose restart aviator-backend-1
docker-compose restart nginx-load-balancer

# Ver estado de recursos
docker stats

# Limpiar volúmenes (CUIDADO: Elimina datos)
docker-compose down -v
```

### Monitoreo y Logs

```bash
# Logs en tiempo real de todos los servicios
docker-compose logs -f --tail=100

# Logs específicos por servicio
docker-compose logs -f redis-server
docker-compose logs -f mongodb-primary

# Verificar uso de recursos
docker system df
```

### Pruebas de Conectividad

```bash
# Probar el balanceador de carga
curl http://localhost:80/health
curl http://localhost:8080/health

# Probar conexión directa a Redis
docker exec -it aviator-redis redis-cli
# Dentro de redis-cli:
# ping
# info
# exit

# Probar conexión a MongoDB Primary
docker exec -it mongodb-primary mongosh aviator_game
# Dentro de mongosh:
# db.test.insertOne({name: "test"})
# db.test.find()
# exit

# Probar conexión a MongoDB Secondary (solo lectura)
docker exec -it mongodb-secondary1 mongosh aviator_game
# Dentro de mongosh:
# rs.secondaryOk()
# db.test.find()
# exit
```

## Acceso a Servicios

### URLs de Acceso

- **Aplicación Principal**: http://localhost:80
- **Aplicación (Puerto Alternativo)**: http://localhost:8080
- **Mongo Express (Admin DB)**: http://localhost:8081
  - Usuario: admin
  - Contraseña: aviatorpassword123

### Conexiones Directas a Base de Datos

```bash
# MongoDB Primary (Lectura/Escritura)
mongosh mongodb://localhost:27017/aviator_game

# MongoDB Secondary 1 (Solo Lectura)
mongosh mongodb://localhost:27018/aviator_game

# MongoDB Secondary 2 (Solo Lectura)  
mongosh mongodb://localhost:27019/aviator_game

# Redis
redis-cli -h localhost -p 6379
```

## Arquitectura de Red
### Distribución de Puertos

| Servicio | Puerto Host | Puerto Container | Descripción |
|----------|-------------|------------------|-------------|
| NGINX Load Balancer | 80, 8080 | 80 | Balanceador de carga principal |
| Redis Server | 6379 | 6379 | Cache y estado centralizado |
| MongoDB Primary | 27017 | 27017 | Base de datos principal (R/W) |
| MongoDB Secondary 1 | 27018 | 27017 | Replica secundaria (R) |
| MongoDB Secondary 2 | 27019 | 27017 | Replica secundaria (R) |
| Mongo Express | 8081 | 8081 | Interfaz web para MongoDB |
| Backend Instances | - | 4000 | Solo accesibles via load balancer |

### Flujo de Datos

```
Cliente Web
    ↓ HTTP/WebSocket (Puerto 80/8080)
NGINX Load Balancer
    ↓ Distribución least_conn/ip_hash
Backend Instances (3x)
    ↓ Estado sincronizado via Redis
Redis Server (Puerto 6379)
    ↓ Datos persistentes
MongoDB Replica Set
    ├── Primary (R/W - Puerto 27017)
    ├── Secondary 1 (R - Puerto 27018)  
    └── Secondary 2 (R - Puerto 27019)
```
```


**Desarrollado por:** Gabriel, Edinson, Deivid  
**Tecnologías:** Node.js, Socket.io, MySQL 8.0, Docker  
**Arquitectura:** Master-Slave Replication con Load Balancing
