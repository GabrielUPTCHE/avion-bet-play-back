#!/bin/bash

# deploy_mysql_replication.sh
# Script para desplegar MySQL Master-Slave con Docker Compose

set -e

echo "🚀 Desplegando MySQL Master-Slave para Aviator Game"
echo "==================================================""

# Crear directorio para los datos
mkdir -p mysql-data/{master,slave1,slave2}
mkdir -p mysql-logs/{master,slave1,slave2}

# Crear docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  mysql-master:
    image: mysql:8.0
    container_name: aviator-mysql-master
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: RootPassword123!
      MYSQL_DATABASE: aviator_game
      MYSQL_USER: aviator_app
      MYSQL_PASSWORD: AppPassword123!
    ports:
      - "3308:3306"
    volumes:
      - ./mysql-data/master:/var/lib/mysql
      - ./mysql-logs/master:/var/log/mysql
      - ./database/replication/master_config.cnf:/etc/mysql/conf.d/mysql.cnf:ro
      - ./database/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro
      - ./database/replication/setup_master.sql:/docker-entrypoint-initdb.d/02-setup.sql:ro
    networks:
      aviator-network:
        ipv4_address: 192.168.100.10
    command: --server-id=1 --log-bin=mysql-bin --gtid_mode=ON --enforce_gtid_consistency=ON

  mysql-slave1:
    image: mysql:8.0
    container_name: aviator-mysql-slave1
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: RootPassword123!
    ports:
      - "3307:3306"
    volumes:
      - ./mysql-data/slave1:/var/lib/mysql
      - ./mysql-logs/slave1:/var/log/mysql
      - ./database/replication/slave1_config.cnf:/etc/mysql/conf.d/mysql.cnf:ro
    networks:
      aviator-network:
        ipv4_address: 192.168.100.11
    depends_on:
      - mysql-master
    command: --server-id=2 --log-bin=mysql-bin --gtid_mode=ON --enforce_gtid_consistency=ON --read_only=1

  mysql-slave2:
    image: mysql:8.0
    container_name: aviator-mysql-slave2
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: RootPassword123!
    ports:
      - "3309:3306"
    volumes:
      - ./mysql-data/slave2:/var/lib/mysql
      - ./mysql-logs/slave2:/var/log/mysql
      - ./database/replication/slave2_config.cnf:/etc/mysql/conf.d/mysql.cnf:ro
    networks:
      aviator-network:
        ipv4_address: 192.168.100.12
    depends_on:
      - mysql-master
    command: --server-id=3 --log-bin=mysql-bin --gtid_mode=ON --enforce_gtid_consistency=ON --read_only=1

  phpmyadmin:
    image: phpmyadmin/phpmyadmin
    container_name: aviator-phpmyadmin
    restart: unless-stopped
    environment:
      PMA_HOSTS: mysql-master,mysql-slave1,mysql-slave2
      PMA_PORTS: 3306,3306,3306
      PMA_USER: aviator_app
      PMA_PASSWORD: AppPassword123!
    ports:
      - "8080:80"
    depends_on:
      - mysql-master
      - mysql-slave1
      - mysql-slave2
    networks:
      - aviator-network

networks:
  aviator-network:
    driver: bridge
    ipam:
      config:
        - subnet: 192.168.100.0/24

volumes:
  master-data:
  slave1-data:
  slave2-data:
EOF

# Crear archivo .env para Docker
cat > .env << 'EOF'
# Docker MySQL Configuration
MYSQL_ROOT_PASSWORD=RootPassword123!
MYSQL_DATABASE=aviator_game
MYSQL_USER=aviator_app
MYSQL_PASSWORD=AppPassword123!

# Configuración de la aplicación Node.js
DB_MASTER_HOST=192.168.100.10
DB_MASTER_PORT=3306
DB_MASTER_USER=aviator_app
DB_MASTER_PASSWORD=AppPassword123!
DB_MASTER_DATABASE=aviator_game

DB_SLAVE1_HOST=192.168.100.11
DB_SLAVE1_PORT=3306
DB_SLAVE1_USER=aviator_read
DB_SLAVE1_PASSWORD=ReadPassword123!
DB_SLAVE1_DATABASE=aviator_game

DB_SLAVE2_HOST=192.168.100.12
DB_SLAVE2_PORT=3306
DB_SLAVE2_USER=aviator_read
DB_SLAVE2_PASSWORD=ReadPassword123!
DB_SLAVE2_DATABASE=aviator_game

NODE_ENV=development
PORT=4000
EOF

echo "📁 Archivos de configuración creados"

# Desplegar servicios
echo "🐳 Iniciando contenedores MySQL..."
docker-compose up -d mysql-master

echo "⏳ Esperando que el Master esté listo..."
sleep 30

echo "🐳 Iniciando slaves..."
docker-compose up -d mysql-slave1 mysql-slave2

echo "⏳ Esperando que los slaves estén listos..."
sleep 20

echo "🔧 Configurando replicación en slaves..."

# Configurar Slave 1
# Configurar Slave 1
echo "🔧 Configurando replicación en Slave 1..."
docker exec -i aviator-mysql-slave1 mysql -uroot -pRootPassword123! <<EOF
CHANGE MASTER TO
    MASTER_HOST = '192.168.100.10',
    MASTER_PORT = 3306,
    MASTER_USER = 'replica_user',
    MASTER_PASSWORD = 'StrongPassword123!',
    MASTER_AUTO_POSITION = 1;
START SLAVE;
EOF

# Crear usuario de lectura en Slave 1
echo "👤 Creando usuario de lectura en Slave 1..."
docker exec -i aviator-mysql-slave1 mysql -uroot -pRootPassword123! <<EOF
CREATE USER 'aviator_read'@'%' IDENTIFIED WITH mysql_native_password BY 'ReadPassword123!';
GRANT SELECT ON aviator_game.* TO 'aviator_read'@'%';
FLUSH PRIVILEGES;
EOF

# Configurar Slave 2
echo "🔧 Configurando replicación en Slave 2..."
docker exec -i aviator-mysql-slave2 mysql -uroot -pRootPassword123! <<EOF
CHANGE MASTER TO
    MASTER_HOST = '192.168.100.10',
    MASTER_PORT = 3306,
    MASTER_USER = 'replica_user',
    MASTER_PASSWORD = 'StrongPassword123!',
    MASTER_AUTO_POSITION = 1;
START SLAVE;
EOF

# Crear usuario de lectura en Slave 2
echo "👤 Creando usuario de lectura en Slave 2..."
docker exec -i aviator-mysql-slave2 mysql -uroot -pRootPassword123! <<EOF
CREATE USER 'aviator_read'@'%' IDENTIFIED WITH mysql_native_password BY 'ReadPassword123!';
GRANT SELECT ON aviator_game.* TO 'aviator_read'@'%';
FLUSH PRIVILEGES;
EOF

# Verificar estado de replicación
echo "🔍 Verificando estado de replicación..."
echo "=== SLAVE 1 STATUS ==="
docker exec aviator-mysql-slave1 mysql -uroot -pRootPassword123! -e "SHOW SLAVE STATUS\G" | grep -E "Slave_IO_Running|Slave_SQL_Running|Master_Host|Seconds_Behind_Master"

echo "=== SLAVE 2 STATUS ==="
docker exec aviator-mysql-slave2 mysql -uroot -pRootPassword123! -e "SHOW SLAVE STATUS\G" | grep -E "Slave_IO_Running|Slave_SQL_Running|Master_Host|Seconds_Behind_Master"

echo "🐳 Iniciando PHPMyAdmin..."
docker-compose up -d phpmyadmin

echo ""
echo "✅ Despliegue completado!"
echo ""
echo "� Desplegando MySQL Master-Slave para Aviator Game"
echo "=================================================="
echo ""
echo "🔍 Para verificar la replicación:"
echo "   docker exec aviator-mysql-slave1 mysql -uroot -pRootPassword123! -e 'SHOW SLAVE STATUS\\G'"
echo ""
echo "📋 Próximos pasos:"
echo "   1. Ejecuta: npm install"
echo "   2. Ejecuta: node scripts/setup_database.js setup"
echo "   3. Ejecuta: npm start"