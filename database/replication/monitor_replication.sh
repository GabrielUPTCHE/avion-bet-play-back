#!/bin/bash

# Script de monitoreo de replicación MySQL
# Uso: ./monitor_replication.sh

echo "=== MONITOREO DE REPLICACIÓN MYSQL ==="
echo "Fecha: $(date)"
echo "==========================================="

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Función para verificar el estado del master
check_master() {
    echo -e "\n${YELLOW}=== ESTADO DEL MASTER ===${NC}"
    mysql -u monitor_user -pMonitorPass123! -h 192.168.1.100 -e "
        SELECT 
            'Master Status' as Info,
            @@server_id as Server_ID,
            @@log_bin as Binary_Log_Enabled;
        SHOW MASTER STATUS;
        SELECT 
            COUNT(*) as Connected_Slaves 
        FROM information_schema.processlist 
        WHERE command = 'Binlog Dump GTID';
    "
}

# Función para verificar el estado de un slave
check_slave() {
    local slave_host=$1
    local slave_name=$2
    
    echo -e "\n${YELLOW}=== ESTADO DEL $slave_name ===${NC}"
    
    # Verificar conectividad
    if mysql -u aviator_read -pReadPassword123! -h $slave_host -e "SELECT 1" &>/dev/null; then
        echo -e "${GREEN}✓ Conectividad OK${NC}"
        
        # Obtener información del slave
        mysql -u aviator_read -pReadPassword123! -h $slave_host -e "
            SELECT 
                'Slave Info' as Info,
                @@server_id as Server_ID,
                @@read_only as Read_Only,
                @@super_read_only as Super_Read_Only;
        "
        
        # Verificar estado de replicación (necesita privilegios especiales)
        mysql -u monitor_user -pMonitorPass123! -h $slave_host -e "
            SHOW SLAVE STATUS\G
        " | grep -E "Slave_IO_Running|Slave_SQL_Running|Master_Host|Seconds_Behind_Master|Last_Error"
        
    else
        echo -e "${RED}✗ No se puede conectar al $slave_name${NC}"
    fi
}

# Función para verificar sincronización de datos
check_data_sync() {
    echo -e "\n${YELLOW}=== VERIFICACIÓN DE SINCRONIZACIÓN ===${NC}"
    
    # Contar registros en master
    master_count=$(mysql -u monitor_user -pMonitorPass123! -h 192.168.1.100 -D aviator_game -sN -e "SELECT COUNT(*) FROM players")
    echo "Registros en Master (players): $master_count"
    
    # Contar registros en slaves
    slave1_count=$(mysql -u aviator_read -pReadPassword123! -h 192.168.1.101 -D aviator_game -sN -e "SELECT COUNT(*) FROM players" 2>/dev/null || echo "ERROR")
    slave2_count=$(mysql -u aviator_read -pReadPassword123! -h 192.168.1.102 -D aviator_game -sN -e "SELECT COUNT(*) FROM players" 2>/dev/null || echo "ERROR")
    
    echo "Registros en Slave 1 (players): $slave1_count"
    echo "Registros en Slave 2 (players): $slave2_count"
    
    # Verificar si están sincronizados
    if [ "$master_count" = "$slave1_count" ] && [ "$master_count" = "$slave2_count" ]; then
        echo -e "${GREEN}✓ Datos sincronizados correctamente${NC}"
    else
        echo -e "${RED}✗ Los datos no están sincronizados${NC}"
    fi
}

# Función principal
main() {
    check_master
    check_slave "192.168.1.101" "SLAVE 1"
    check_slave "192.168.1.102" "SLAVE 2"
    check_data_sync
    
    echo -e "\n${YELLOW}=== RESUMEN ===${NC}"
    echo "Master: 192.168.1.100"
    echo "Slave 1: 192.168.1.101"
    echo "Slave 2: 192.168.1.102"
    echo "Monitoreo completado: $(date)"
}

# Ejecutar si se llama directamente
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi