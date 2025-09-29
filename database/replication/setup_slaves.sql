-- Script de configuración para los servidores MySQL Slaves
-- Ejecutar en CADA servidor esclavo después de configurar my.cnf y reiniciar MySQL
-- IMPORTANTE: Cambiar la IP del master (192.168.1.100) por la IP real de tu servidor master

-- PASO 1: Verificar configuración inicial
SHOW VARIABLES LIKE 'server_id';
SHOW VARIABLES LIKE 'read_only';
SHOW VARIABLES LIKE 'gtid_mode';

-- PASO 2: Configurar la conexión al master
-- Reemplazar MASTER_HOST con la IP real del servidor master
-- Las credenciales deben coincidir con las creadas en setup_master.sql

CHANGE MASTER TO
    MASTER_HOST = '192.168.1.100',  -- IP del servidor master
    MASTER_PORT = 3306,
    MASTER_USER = 'replica_user',
    MASTER_PASSWORD = 'StrongPassword123!',
    MASTER_AUTO_POSITION = 1;  -- Usar GTID automático

-- PASO 3: Iniciar la replicación
START SLAVE;

-- PASO 4: Verificar el estado de la replicación
SHOW SLAVE STATUS\G

-- PASO 5: Crear usuarios para la aplicación (solo lectura)
CREATE USER 'aviator_read'@'%' IDENTIFIED WITH mysql_native_password BY 'ReadPassword123!';
GRANT SELECT ON aviator_game.* TO 'aviator_read'@'%';

-- PASO 6: Aplicar cambios
FLUSH PRIVILEGES;

-- PASO 7: Verificar que la replicación funciona
-- (Ejecutar después de insertar datos en el master)
USE aviator_game;
SHOW TABLES;

-- COMANDOS ÚTILES PARA TROUBLESHOOTING:

-- Detener replicación
-- STOP SLAVE;

-- Reiniciar replicación
-- RESET SLAVE;
-- START SLAVE;

-- Ver errores de replicación
-- SHOW SLAVE STATUS\G

-- Verificar posición actual
-- SHOW MASTER STATUS;

-- Verificar GTIDs
-- SELECT @@GLOBAL.GTID_EXECUTED;
-- SELECT @@GLOBAL.GTID_PURGED;