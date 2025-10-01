#!/bin/bash
# Script para verificar e inicializar el replica set si es necesario

echo "🔍 Verificando estado del Replica Set..."

# Esperar a que MongoDB esté listo
sleep 10

# Verificar si el replica set ya está configurado
REPLICA_STATUS=$(mongosh --quiet --eval "try { rs.status(); print('CONFIGURED'); } catch(e) { print('NOT_CONFIGURED'); }")

if [[ "$REPLICA_STATUS" == *"NOT_CONFIGURED"* ]]; then
    echo "🚀 Inicializando Replica Set..."
    mongosh --file /docker-entrypoint-initdb.d/init-replica.js
else
    echo "✅ Replica Set ya configurado"
    # Verificar que la base de datos y colecciones existan
    DB_EXISTS=$(mongosh aviator_game --quiet --eval "db.listCollections().toArray().length")
    if [ "$DB_EXISTS" -eq "0" ]; then
        echo "🔧 Creando base de datos y colecciones..."
        mongosh aviator_game --file /docker-entrypoint-initdb.d/init-replica.js
    fi
fi

echo "✅ Verificación completa"