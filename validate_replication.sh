#!/bin/bash

# validate_replication.sh
# Script para validar que la replicación MySQL funcione correctamente

set -e

echo "🔍 Validando configuración de replicación MySQL"
echo "=============================================="

# Función para mostrar el estado de un servidor
check_server() {
    local container_name=$1
    local server_type=$2
    local port=$3
    
    echo ""
    echo "📊 Verificando $server_type ($container_name)..."
    
    # Verificar que el contenedor esté ejecutándose
    if ! docker ps | grep -q $container_name; then
        echo "❌ El contenedor $container_name no está ejecutándose"
        return 1
    fi
    
    # Verificar conectividad
    if docker exec $container_name mysqladmin ping -h localhost --silent; then
        echo "✅ Servidor MySQL respondiendo"
    else
        echo "❌ Servidor MySQL no responde"
        return 1
    fi
    
    # Verificar usuarios
    echo "👥 Usuarios configurados:"
    docker exec $container_name mysql -uroot -pRootPassword123! -e "
        SELECT User, Host, authentication_string IS NOT NULL as Has_Password 
        FROM mysql.user 
        WHERE User IN ('replica_user', 'aviator_app', 'aviator_read', 'monitor_user')
        ORDER BY User;
    " 2>/dev/null || echo "   ⚠️  No se pudieron obtener los usuarios"
    
    return 0
}

# Función para verificar la replicación
check_replication() {
    local slave_container=$1
    local slave_name=$2
    
    echo ""
    echo "🔄 Verificando replicación en $slave_name..."
    
    local slave_status=$(docker exec $slave_container mysql -uroot -pRootPassword123! -e "SHOW SLAVE STATUS\G" 2>/dev/null)
    
    if [ -z "$slave_status" ]; then
        echo "❌ No se pudo obtener el estado de replicación"
        return 1
    fi
    
    # Extraer información crítica
    local io_running=$(echo "$slave_status" | grep "Slave_IO_Running:" | awk '{print $2}')
    local sql_running=$(echo "$slave_status" | grep "Slave_SQL_Running:" | awk '{print $2}')
    local master_host=$(echo "$slave_status" | grep "Master_Host:" | awk '{print $2}')
    local seconds_behind=$(echo "$slave_status" | grep "Seconds_Behind_Master:" | awk '{print $2}')
    local last_error=$(echo "$slave_status" | grep "Last_Error:" | cut -d: -f2- | xargs)
    
    echo "   - IO Thread: $io_running"
    echo "   - SQL Thread: $sql_running" 
    echo "   - Master Host: $master_host"
    echo "   - Seconds Behind Master: $seconds_behind"
    
    if [ "$last_error" != "" ] && [ "$last_error" != "NULL" ]; then
        echo "   - ⚠️  Last Error: $last_error"
    fi
    
    # Verificar que todo esté OK
    if [ "$io_running" = "Yes" ] && [ "$sql_running" = "Yes" ]; then
        echo "✅ Replicación funcionando correctamente"
        return 0
    else
        echo "❌ Replicación con problemas"
        return 1
    fi
}

# Función para probar la sincronización de datos
test_data_sync() {
    echo ""
    echo "🧪 Probando sincronización de datos..."
    
    # Insertar dato de prueba en el master
    local test_id=$(date +%s)
    local test_username="sync_test_$test_id"
    
    echo "   📝 Insertando dato de prueba en Master..."
    docker exec aviator-mysql-master mysql -uaviator_app -pAppPassword123! -Daviator_game -e "
        INSERT INTO players (id_player, username, register_date) 
        VALUES ('test_$test_id', '$test_username', NOW());
    " 2>/dev/null
    
    if [ $? -ne 0 ]; then
        echo "❌ No se pudo insertar el dato de prueba"
        return 1
    fi
    
    # Esperar un momento para la replicación
    echo "   ⏳ Esperando replicación..."
    sleep 3
    
    # Verificar en slaves
    local slaves=("aviator-mysql-slave1" "aviator-mysql-slave2")
    local sync_ok=0
    
    for slave in "${slaves[@]}"; do
        echo "   🔍 Verificando en $slave..."
        
        local found=$(docker exec $slave mysql -uaviator_read -pReadPassword123! -Daviator_game -sN -e "
            SELECT COUNT(*) FROM players WHERE username = '$test_username';
        " 2>/dev/null)
        
        if [ "$found" = "1" ]; then
            echo "     ✅ Dato sincronizado correctamente"
            ((sync_ok++))
        else
            echo "     ❌ Dato no encontrado"
        fi
    done
    
    # Limpiar dato de prueba
    docker exec aviator-mysql-master mysql -uaviator_app -pAppPassword123! -Daviator_game -e "
        DELETE FROM players WHERE username = '$test_username';
    " 2>/dev/null
    
    if [ $sync_ok -eq 2 ]; then
        echo "✅ Sincronización funcionando correctamente en ambos slaves"
        return 0
    else
        echo "❌ Problemas de sincronización detectados"
        return 1
    fi
}

# Función principal
main() {
    local errors=0
    
    # 1. Verificar Master
    if ! check_server "aviator-mysql-master" "MASTER" "3306"; then
        ((errors++))
    fi
    
    # 2. Verificar Slaves
    if ! check_server "aviator-mysql-slave1" "SLAVE 1" "3307"; then
        ((errors++))
    fi
    
    if ! check_server "aviator-mysql-slave2" "SLAVE 2" "3309"; then
        ((errors++))
    fi
    
    # 3. Verificar replicación si los servers están OK
    if [ $errors -eq 0 ]; then
        if ! check_replication "aviator-mysql-slave1" "SLAVE 1"; then
            ((errors++))
        fi
        
        if ! check_replication "aviator-mysql-slave2" "SLAVE 2"; then
            ((errors++))
        fi
        
        # 4. Probar sincronización de datos
        if [ $errors -eq 0 ]; then
            if ! test_data_sync; then
                ((errors++))
            fi
        fi
    fi
    
    # Resumen final
    echo ""
    echo "📋 RESUMEN DE VALIDACIÓN"
    echo "======================"
    
    if [ $errors -eq 0 ]; then
        echo "✅ Todas las validaciones pasaron correctamente"
        echo "🎮 Tu configuración de replicación MySQL está lista para Aviator Game!"
        echo ""
        echo "🔧 Próximos pasos:"
        echo "   1. Ejecuta: npm install"
        echo "   2. Ejecuta: node scripts/setup_database.js setup"
        echo "   3. Ejecuta: npm start"
    else
        echo "❌ Se encontraron $errors error(es)"
        echo "🔧 Revisa los logs anteriores y corrige los problemas"
        echo ""
        echo "💡 Comandos útiles para debugging:"
        echo "   docker logs aviator-mysql-master"
        echo "   docker logs aviator-mysql-slave1" 
        echo "   docker logs aviator-mysql-slave2"
        echo "   docker exec aviator-mysql-slave1 mysql -uroot -pRootPassword123! -e 'SHOW SLAVE STATUS\\G'"
    fi
    
    return $errors
}

# Ejecutar validación
main