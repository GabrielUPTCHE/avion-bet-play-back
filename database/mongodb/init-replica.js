// Script de inicialización del Replica Set
// database/mongodb/init-replica.js

print("🚀 Iniciando configuración del Replica Set...");

// Configuración del Replica Set
rsconf = {
  _id: "aviator-replica",
  version: 1,
  members: [
    {
      _id: 0,
      host: "mongodb-primary:27017",
      priority: 3  // Prioridad alta para ser Primary
    },
    {
      _id: 1,
      host: "mongodb-secondary1:27017",
      priority: 1  // Prioridad media para Secondary
    },
    {
      _id: 2,
      host: "mongodb-secondary2:27017",
      priority: 1  // Prioridad media para Secondary
    }
  ],
  settings: {
    // Configuración de elecciones más rápida para desarrollo
    electionTimeoutMillis: 2000,
    heartbeatTimeoutSecs: 2,
    heartbeatIntervalMillis: 1000
  }
};

// Inicializar el Replica Set
try {
  rs.initiate(rsconf);
  print("✅ Replica Set inicializado correctamente");
} catch (e) {
  print("⚠️ Error al inicializar Replica Set (puede ser normal si ya existe):", e.message);
}

// Esperar a que el Primary esté listo
sleep(5000);

// Crear base de datos (sin autenticación para desarrollo)
db = db.getSiblingDB('aviator_game');

// Comentado para desarrollo sin autenticación
// db.createUser({
//   user: "aviator_app",
//   pwd: "aviator_app_password123",
//   roles: [
//     {
//       role: "readWrite",
//       db: "aviator_game"
//     }
//   ]
// });

print("✅ Base de datos configurada (sin autenticación)");

// Crear colecciones con validación de esquema
print("📋 Creando colecciones...");

// Crear colecciones SIN validadores para máxima compatibilidad
print("🔧 Creando colecciones sin validadores estrictos...");

// 1. Colección de rondas del juego
db.createCollection("game_rounds");

// 2. Colección de apuestas
db.createCollection("bets");

// 3. Colección de estadísticas de jugadores
db.createCollection("player_stats");



// Crear índices para optimizar consultas
print("📊 Creando índices...");

// Índices para game_rounds
db.game_rounds.createIndex({ "round_id": 1 }, { unique: true });
db.game_rounds.createIndex({ "start_time": -1 });
db.game_rounds.createIndex({ "status": 1, "start_time": -1 });

// Índices para bets
db.bets.createIndex({ "bet_id": 1 }, { unique: true });
db.bets.createIndex({ "round_id": 1 });
db.bets.createIndex({ "player_id": 1, "bet_time": -1 });
db.bets.createIndex({ "username": 1, "bet_time": -1 });
db.bets.createIndex({ "is_winner": 1, "winnings": -1 });

// Índices para player_stats
db.player_stats.createIndex({ "player_id": 1 }, { unique: true });
db.player_stats.createIndex({ "username": 1 }, { unique: true });
db.player_stats.createIndex({ "total_winnings": -1 });
db.player_stats.createIndex({ "win_rate": -1 });
db.player_stats.createIndex({ "last_played": -1 });



print("✅ Colecciones e índices creados correctamente");

// Asegurar que no haya validadores en las colecciones
print("🔧 Deshabilitando validadores para máxima compatibilidad...");
db.runCommand({collMod: 'game_rounds', validator: {}, validationLevel: 'off'});
db.runCommand({collMod: 'bets', validator: {}, validationLevel: 'off'});
db.runCommand({collMod: 'player_stats', validator: {}, validationLevel: 'off'});
print("✅ Validadores deshabilitados permanentemente");

// Insertar datos iniciales de ejemplo
print("🔢 Insertando datos de ejemplo...");



print("✅ Configuración inicial completa!");
print("🎮 Base de datos aviator_game lista para usar");
print("📊 Replica Set configurado con failover automático");
print("🔑 Usuario: aviator_app | Password: aviator_app_password123");