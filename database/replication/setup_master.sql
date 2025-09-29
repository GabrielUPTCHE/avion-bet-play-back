-- Script de configuración para el servidor MySQL Master
-- Ejecutar después de configurar my.cnf y reiniciar MySQL

-- 1. Crear usuario para replicación
CREATE USER 'replica_user'@'%' IDENTIFIED WITH mysql_native_password BY 'StrongPassword123!';
GRANT REPLICATION SLAVE ON *.* TO 'replica_user'@'%';

-- 2. Crear usuario para la aplicación
CREATE USER 'aviator_app'@'%' IDENTIFIED WITH mysql_native_password BY 'AppPassword123!';
GRANT ALL PRIVILEGES ON aviator_game.* TO 'aviator_app'@'%';

-- 3. Crear usuario para monitoreo
CREATE USER 'monitor_user'@'%' IDENTIFIED WITH mysql_native_password BY 'MonitorPass123!';
GRANT SELECT, PROCESS, REPLICATION CLIENT ON *.* TO 'monitor_user'@'%';

-- 4. Aplicar cambios
FLUSH PRIVILEGES;

-- 5. Verificar estado del master
SHOW MASTER STATUS;

-- 6. Mostrar usuarios creados
SELECT User, Host FROM mysql.user WHERE User IN ('replica_user', 'aviator_app', 'monitor_user');

-- 7. Verificar configuración de binary log
SHOW VARIABLES LIKE 'log_bin';
SHOW VARIABLES LIKE 'server_id';
SHOW VARIABLES LIKE 'gtid_mode';

-- 8. Crear la base de datos si no existe
CREATE DATABASE IF NOT EXISTS aviator_game CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;