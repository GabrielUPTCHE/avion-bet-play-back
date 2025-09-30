#!/bin/bash

# Script para gestionar el despliegue del Load Balancer Aviator Game

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para mostrar ayuda
show_help() {
    echo -e "${BLUE}Aviator Game Load Balancer Management Script${NC}"
    echo ""
    echo "Uso: $0 [COMANDO]"
    echo ""
    echo "Comandos disponibles:"
    echo "  start         - Iniciar todas las instancias con load balancer"
    echo "  stop          - Detener todas las instancias"
    echo "  restart       - Reiniciar todas las instancias"
    echo "  status        - Mostrar estado de los contenedores"
    echo "  logs          - Mostrar logs de todas las instancias"
    echo "  logs-nginx    - Mostrar logs del load balancer (nginx)"
    echo "  logs-backend  - Mostrar logs de las instancias backend"
    echo "  scale [N]     - Escalar a N instancias de backend"
    echo "  health        - Verificar salud de las instancias"
    echo "  build         - Reconstruir las imágenes"
    echo "  clean         - Limpiar contenedores y volúmenes"
    echo "  help          - Mostrar esta ayuda"
    echo ""
}

# Función para verificar si Docker está corriendo
check_docker() {
    if ! docker info > /dev/null 2>&1; then
        echo -e "${RED}Error: Docker no está corriendo${NC}"
        exit 1
    fi
}

# Función para iniciar los servicios
start_services() {
    echo -e "${GREEN}🚀 Iniciando Aviator Game Load Balancer...${NC}"
    check_docker
    docker-compose up -d
    echo -e "${GREEN}✅ Servicios iniciados correctamente${NC}"
    echo -e "${BLUE}📍 Aplicación disponible en: http://localhost${NC}"
    echo -e "${BLUE}📍 Puerto alternativo: http://localhost:8081${NC}"
}

# Función para detener los servicios
stop_services() {
    echo -e "${YELLOW}🛑 Deteniendo servicios...${NC}"
    docker-compose down
    echo -e "${GREEN}✅ Servicios detenidos${NC}"
}

# Función para reiniciar los servicios
restart_services() {
    echo -e "${YELLOW}🔄 Reiniciando servicios...${NC}"
    stop_services
    start_services
}

# Función para mostrar estado
show_status() {
    echo -e "${BLUE}📊 Estado de los contenedores:${NC}"
    docker-compose ps
}

# Función para mostrar logs
show_logs() {
    echo -e "${BLUE}📋 Logs de todos los servicios:${NC}"
    docker-compose logs -f --tail=100
}

# Función para mostrar logs de nginx
show_nginx_logs() {
    echo -e "${BLUE}📋 Logs del Load Balancer (Nginx):${NC}"
    docker-compose logs -f nginx-load-balancer
}

# Función para mostrar logs del backend
show_backend_logs() {
    echo -e "${BLUE}📋 Logs de las instancias Backend:${NC}"
    docker-compose logs -f aviator-backend-1 aviator-backend-2 aviator-backend-3
}

# Función para verificar salud
check_health() {
    echo -e "${BLUE}🏥 Verificando salud de las instancias...${NC}"
    
    # Verificar load balancer
    if curl -s http://localhost/health > /dev/null; then
        echo -e "${GREEN}✅ Load Balancer: OK${NC}"
    else
        echo -e "${RED}❌ Load Balancer: Error${NC}"
    fi
    
    # Verificar cada instancia a través del load balancer
    for i in {1..5}; do
        response=$(curl -s http://localhost/health 2>/dev/null || echo "error")
        if [[ $response == *"ok"* ]]; then
            instance=$(echo $response | grep -o '"instance":"[^"]*"' | cut -d'"' -f4)
            echo -e "${GREEN}✅ Respuesta $i: $instance${NC}"
        else
            echo -e "${RED}❌ Respuesta $i: Error${NC}"
        fi
        sleep 1
    done
}

# Función para construir imágenes
build_images() {
    echo -e "${BLUE}🔨 Reconstruyendo imágenes...${NC}"
    docker-compose build --no-cache
    echo -e "${GREEN}✅ Imágenes reconstruidas${NC}"
}

# Función para limpiar
clean_all() {
    echo -e "${YELLOW}🧹 Limpiando contenedores y volúmenes...${NC}"
    docker-compose down -v --remove-orphans
    docker system prune -f
    echo -e "${GREEN}✅ Limpieza completada${NC}"
}

# Función para escalar instancias
scale_backend() {
    local count=${1:-3}
    echo -e "${BLUE}⚖️  Escalando a $count instancias de backend...${NC}"
    
    if [ $count -lt 1 ] || [ $count -gt 10 ]; then
        echo -e "${RED}Error: El número de instancias debe estar entre 1 y 10${NC}"
        exit 1
    fi
    
    # Nota: Este script básico asume máximo 3 instancias
    # Para más instancias, se necesitaría modificar docker-compose.yml dinámicamente
    echo -e "${YELLOW}Nota: Escalado dinámico requiere modificar docker-compose.yml${NC}"
    echo -e "${BLUE}Actualmente configurado para 3 instancias máximo${NC}"
}

# Procesar argumentos
case "${1:-help}" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        restart_services
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    logs-nginx)
        show_nginx_logs
        ;;
    logs-backend)
        show_backend_logs
        ;;
    scale)
        scale_backend $2
        ;;
    health)
        check_health
        ;;
    build)
        build_images
        ;;
    clean)
        clean_all
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}Comando no reconocido: $1${NC}"
        show_help
        exit 1
        ;;
esac