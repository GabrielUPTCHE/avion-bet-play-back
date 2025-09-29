-- Esquema de Base de Datos para Aviator Game
-- Creación de la base de datos
CREATE DATABASE IF NOT EXISTS aviator_game CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE aviator_game;

-- Tabla de jugadores
CREATE TABLE players (
    id_player VARCHAR(255) PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    register_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabla de salas de juego
CREATE TABLE game_halls (
    id_game_hall VARCHAR(255) PRIMARY KEY,
    hall_name VARCHAR(100) NOT NULL,
    max_capacity INT NOT NULL DEFAULT 10,
    active BOOLEAN DEFAULT TRUE,
    actual_players INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabla de sesiones de juego (cuando un jugador entra/sale de una sala)
CREATE TABLE game_sessions (
    id_session VARCHAR(255) PRIMARY KEY,
    id_player VARCHAR(255) NOT NULL,
    id_game_hall VARCHAR(255) NOT NULL,
    date_ingress TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    date_exit TIMESTAMP NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_player) REFERENCES players(id_player) ON DELETE CASCADE,
    FOREIGN KEY (id_game_hall) REFERENCES game_halls(id_game_hall) ON DELETE CASCADE,
    INDEX idx_player_session (id_player),
    INDEX idx_hall_session (id_game_hall),
    INDEX idx_active_sessions (is_active, date_exit)
);

-- Tabla de rondas de juego
CREATE TABLE game_rounds (
    id_round VARCHAR(255) PRIMARY KEY,
    id_game_hall VARCHAR(255) NOT NULL,
    multiplyer DECIMAL(10, 2) NOT NULL,
    start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_date TIMESTAMP NULL,
    duration_seg INT NULL,
    state ENUM('in_progress', 'finished', 'cancelled') DEFAULT 'in_progress',
    final_multiplyer DECIMAL(10, 2) NULL,
    crash_point DECIMAL(10, 2) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_game_hall) REFERENCES game_halls(id_game_hall) ON DELETE CASCADE,
    INDEX idx_hall_rounds (id_game_hall),
    INDEX idx_round_state (state),
    INDEX idx_round_dates (start_date, end_date)
);

-- Tabla de apuestas
CREATE TABLE bets (
    id_bet VARCHAR(255) PRIMARY KEY,
    id_player VARCHAR(255) NOT NULL,
    id_round VARCHAR(255) NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    date_bet TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ganancy DECIMAL(10, 2) NULL,
    multiplyer DECIMAL(10, 2) NULL,
    cash_out_multiplyer DECIMAL(10, 2) NULL,
    cash_out_time TIMESTAMP NULL,
    status ENUM('active', 'won', 'lost', 'cashed_out') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_player) REFERENCES players(id_player) ON DELETE CASCADE,
    FOREIGN KEY (id_round) REFERENCES game_rounds(id_round) ON DELETE CASCADE,
    INDEX idx_player_bets (id_player),
    INDEX idx_round_bets (id_round),
    INDEX idx_bet_status (status),
    INDEX idx_bet_date (date_bet)
);

-- Tabla de estadísticas de jugadores
CREATE TABLE player_stats (
    id_player VARCHAR(255) PRIMARY KEY,
    total_bets INT DEFAULT 0,
    total_amount_bet DECIMAL(15, 2) DEFAULT 0.00,
    total_winnings DECIMAL(15, 2) DEFAULT 0.00,
    best_multiplyer DECIMAL(10, 2) DEFAULT 1.00,
    games_played INT DEFAULT 0,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    balance DECIMAL(15, 2) DEFAULT 1000.00, -- Balance inicial
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (id_player) REFERENCES players(id_player) ON DELETE CASCADE
);

-- Tabla de configuración del sistema
CREATE TABLE system_config (
    config_key VARCHAR(100) PRIMARY KEY,
    config_value TEXT,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insertar configuraciones iniciales
INSERT INTO system_config (config_key, config_value, description) VALUES
('min_bet_amount', '1.00', 'Monto mínimo de apuesta'),
('max_bet_amount', '1000.00', 'Monto máximo de apuesta'),
('default_balance', '1000.00', 'Balance inicial para nuevos jugadores'),
('max_multiplyer', '100.00', 'Multiplicador máximo del juego');

-- Crear sala de juego por defecto
INSERT INTO game_halls (id_game_hall, hall_name, max_capacity) VALUES
('hall_001', 'Sala Principal', 50);

-- Triggers para mantener estadísticas actualizadas
DELIMITER //

CREATE TRIGGER update_player_stats_after_bet
AFTER INSERT ON bets
FOR EACH ROW
BEGIN
    INSERT INTO player_stats (id_player, total_bets, total_amount_bet)
    VALUES (NEW.id_player, 1, NEW.amount)
    ON DUPLICATE KEY UPDATE
        total_bets = total_bets + 1,
        total_amount_bet = total_amount_bet + NEW.amount,
        last_active = CURRENT_TIMESTAMP;
END//

CREATE TRIGGER update_player_stats_after_win
AFTER UPDATE ON bets
FOR EACH ROW
BEGIN
    IF NEW.ganancy IS NOT NULL AND OLD.ganancy IS NULL THEN
        UPDATE player_stats 
        SET total_winnings = total_winnings + NEW.ganancy,
            best_multiplyer = GREATEST(best_multiplyer, COALESCE(NEW.multiplyer, 1.00))
        WHERE id_player = NEW.id_player;
    END IF;
END//

CREATE TRIGGER update_hall_player_count
AFTER INSERT ON game_sessions
FOR EACH ROW
BEGIN
    IF NEW.is_active = TRUE THEN
        UPDATE game_halls 
        SET actual_players = actual_players + 1 
        WHERE id_game_hall = NEW.id_game_hall;
    END IF;
END//

CREATE TRIGGER decrease_hall_player_count
AFTER UPDATE ON game_sessions
FOR EACH ROW
BEGIN
    IF OLD.is_active = TRUE AND NEW.is_active = FALSE THEN
        UPDATE game_halls 
        SET actual_players = GREATEST(0, actual_players - 1) 
        WHERE id_game_hall = NEW.id_game_hall;
    END IF;
END//

DELIMITER ;

-- Índices adicionales para optimización
CREATE INDEX idx_players_username ON players(username);
CREATE INDEX idx_players_register_date ON players(register_date);
CREATE INDEX idx_game_sessions_dates ON game_sessions(date_ingress, date_exit);
CREATE INDEX idx_bets_amount ON bets(amount);
CREATE INDEX idx_player_stats_balance ON player_stats(balance);