# Aviator Game Load Balancer

Este proyecto implementa un balanceador de carga con Nginx para distribuir el tráfico entre múltiples instancias del backend del juego Aviator.

## 🏗️ Arquitectura

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Cliente Web   │────│ Nginx Load       │────│ Backend         │
│   (Frontend)    │    │ Balancer         │    │ Instancia 1     │
└─────────────────┘    │ (Puerto 80)      │    └─────────────────┘
                       │                  │    ┌─────────────────┐
                       │                  │────│ Backend         │
                       │                  │    │ Instancia 2     │
                       │                  │    └─────────────────┘
                       │                  │    ┌─────────────────┐
                       │                  │────│ Backend         │
                       └──────────────────┘    │ Instancia 3     │
                                               └─────────────────┘
```

## Características

- **Load Balancing**: Distribución automática de carga entre múltiples instancias
- **WebSocket Support**: Soporte completo para Socket.IO con sesión persistente
- **Health Checks**: Monitoreo automático de la salud de las instancias
- **Failover**: Tolerancia a fallos automática
- **Escalabilidad**: Fácil escalado horizontal
- **Logging**: Logs detallados por instancia

## 🚀 Inicio Rápido

### Prerrequisitos
- Docker y Docker Compose instalados
- Puertos 80 y 8081 disponibles

### 1. Usando PowerShell (Windows)
```powershell
# Iniciar todos los servicios
.\manage-loadbalancer.ps1 start

# Ver estado
.\manage-loadbalancer.ps1 status

# Ver logs
.\manage-loadbalancer.ps1 logs

# Verificar salud
.\manage-loadbalancer.ps1 health
```

### 2. Usando Bash (Linux/Mac)
```bash
# Dar permisos de ejecución
chmod +x manage-loadbalancer.sh

# Iniciar todos los servicios
./manage-loadbalancer.sh start

# Ver estado
./manage-loadbalancer.sh status

# Ver logs
./manage-loadbalancer.sh logs
```

### 3. Usando Docker Compose directamente
```bash
# Iniciar servicios
docker-compose up -d

# Ver logs
docker-compose logs -f

# Detener servicios
docker-compose down
```

## 🌐 Acceso a la Aplicación

- **Aplicación principal**: http://localhost
- **Puerto alternativo**: http://localhost:8081
- **Health Check**: http://localhost/health

## 📊 Comandos de Gestión

| Comando | Descripción |
|---------|-------------|
| `start` | Iniciar todas las instancias |
| `stop` | Detener todas las instancias |
| `restart` | Reiniciar todas las instancias |
| `status` | Ver estado de contenedores |
| `logs` | Ver logs de todos los servicios |
| `logs-nginx` | Ver logs del load balancer |
| `logs-backend` | Ver logs de las instancias backend |
| `health` | Verificar salud de las instancias |
| `build` | Reconstruir imágenes |
| `clean` | Limpiar contenedores y volúmenes |

## 🔧 Configuración

### Nginx Load Balancer
El archivo `nginx.conf` contiene la configuración del load balancer:

- **Algoritmo**: `least_conn` para HTTP, `ip_hash` para WebSockets
- **Health Checks**: Reintentos automáticos con failover
- **Timeouts**: Configurados para conexiones persistentes
- **Compresión**: Habilitada para mejor rendimiento

### Instancias Backend
- **3 instancias** por defecto (aviator-backend-1, 2, 3)
- **Puerto interno**: 4000 en cada contenedor
- **Variables de entorno**: `INSTANCE_ID` para identificación
- **Health endpoint**: `/health` en cada instancia

## 🏥 Monitoreo

### Health Checks
Cada instancia expone un endpoint `/health` que devuelve:
```json
{
  "status": "ok",
  "instance": "backend-1",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 3600
}
```

### Logs
Los logs incluyen identificación de instancia:
```
🎮 [backend-1] Jugador JohnDoe (abc123) se unió
💰 [backend-2] Apuesta recibida de player456: $100
✅ [backend-3] Cliente conectado: xyz789 desde IP 192.168.1.100
```

## 🔄 Tolerancia a Fallos

### Detección de Fallos
- **Max Fails**: 3 intentos fallidos antes de marcar como no disponible
- **Fail Timeout**: 30 segundos antes de reintentar
- **Health Checks**: Verificación continua del estado

### Recuperación Automática
- Las instancias que se recuperan son automáticamente reintegradas
- El load balancer redistribuye el tráfico automáticamente
- No se requiere intervención manual

## 📈 Escalabilidad

### Escalado Horizontal
Para agregar más instancias, modificar `docker-compose.yml`:

```yaml
  aviator-backend-4:
    build: .
    container_name: aviator-backend-4
    environment:
      - INSTANCE_ID=backend-4
    networks:
      - aviator-network
```

Y actualizar `nginx.conf`:
```nginx
upstream backend {
    least_conn;
    server aviator-backend-1:4000;
    server aviator-backend-2:4000;
    server aviator-backend-3:4000;
    server aviator-backend-4:4000;  # Nueva instancia
}
```

## 🚫 Bases de Datos (Comentadas)

Las configuraciones de MySQL están comentadas en `docker-compose.yml` y pueden ser habilitadas cuando sea necesario:

```yaml
# mysql-master:
#   image: mysql:8.0
#   # ... configuración completa disponible
```

## 🛠️ Troubleshooting

### Problemas Comunes

1. **Puerto 80 ocupado**
   ```powershell
   # Cambiar puerto en docker-compose.yml
   ports:
     - "8080:80"  # Usar puerto 8080 en lugar de 80
   ```

2. **Instancia no responde**
   ```bash
   # Ver logs de la instancia específica
   docker logs aviator-backend-1
   
   # Reiniciar instancia específica
   docker-compose restart aviator-backend-1
   ```

3. **Load Balancer no distribuye**
   ```bash
   # Verificar configuración de Nginx
   docker exec aviator-nginx-lb nginx -t
   
   # Recargar configuración
   docker exec aviator-nginx-lb nginx -s reload
   ```

## 📝 Próximos Pasos

1. **Redis para Estado Compartido**: Implementar Redis para sincronizar estado entre instancias
2. **Cliente con Reconexión**: Lógica de reconexión automática en el frontend
3. **Métricas Avanzadas**: Prometheus/Grafana para monitoreo detallado
4. **SSL/TLS**: Certificados HTTPS para producción
5. **CI/CD**: Pipeline de despliegue automatizado

## 🤝 Contribución

Para contribuir al proyecto:
1. Fork el repositorio
2. Crear rama feature (`git checkout -b feature/nueva-funcionalidad`)
3. Commit cambios (`git commit -am 'Agregar nueva funcionalidad'`)
4. Push a la rama (`git push origin feature/nueva-funcionalidad`)
5. Crear Pull Request

## 📄 Licencia

Este proyecto está bajo la licencia ISC. Ver archivo LICENSE para más detalles.