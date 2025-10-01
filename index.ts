// backend/index.ts
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");
const cors = require("cors");
const { addSessionPlayer, getPlayers, addBetToCurrentRound, getGameHall, cancelBet, setRoundStatusHall, getRoundStatusHall } = require("./services/game-service");
console.log("game-service exports:", require("./services/game-service"));

const { generateRoundService } = require("./services/aviator-service");

// Importar Redis Manager y MongoDB Service
const { RedisGameManager } = require("./services/redis-manager");
const MongoDBService = require("./services/mongodb-service").default;

// Identificador de la instancia para logs
const INSTANCE_ID = process.env.INSTANCE_ID || `backend-${Math.random().toString(36).substr(2, 9)}`;
const PORT = process.env.PORT || 4000;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

console.log(`🚀 Iniciando instancia: ${INSTANCE_ID}`);
console.log(`🔗 Redis URL: ${REDIS_URL}`);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Variables globales para Redis, MongoDB y estado del juego
let redisManager;
let redisAdapter;
let mongoDBService;

let countdown = 10;
let gameInterval;
let aviatorInterval
let isRunning = false
let multiplier = 1

function startCountdownRound(io) {
  gameInterval = setInterval(() => {
    if (countdown >= 0) {
      io.emit("tick", { secondsLeft: countdown });
      countdown--;
    } else {
      selectStateRound();
    }
  }, 1000);
}

function startAviatorSimulate(io) {
  if (isRunning) return;
  isRunning = true;
  multiplier = 1.0;
  const crashPoint = parseFloat((Math.random() * 15 + 1.1).toFixed(2));

  // Envía señal de inicio con los datos necesarios para que el front calcule
  io.emit("round_start", {
    initialMultiplier: 1.0,
    incrementInterval: 100, // milisegundos entre cada incremento
    incrementAmount: 0.1    // cuánto aumenta en cada paso
  });

  aviatorInterval = setInterval(() => {
    multiplier += 0.1;
    // Solo verifica si alcanzó el punto de quiebre
    if (multiplier >= crashPoint) {
      endRound(io);
    }
  }, 100);
}

async function endRound(io) {
  if (!isRunning) return;
  isRunning = false;

  if (aviatorInterval) {
    clearInterval(aviatorInterval);
    aviatorInterval = null;
  }

  const finalMultiplier = parseFloat(multiplier.toFixed(2));
  const endTime = new Date();

  // Envía el multiplicador final cuando termina
  modifyRound(io, 'finished', 5, false, 'La ronda ha finalizado')
  io.emit("round_end", { 
    finalMultiplier: finalMultiplier,
    timestamp: Date.now()
  });

  // Guardar estadísticas de la ronda en MongoDB (asíncrono, no bloquea el juego)
  if (mongoDBService) {
    const { getGameHall } = require("./services/game-service");
    const currentRound = getGameHall(0);
    
    console.log(`🔍 [${INSTANCE_ID}] Datos de la ronda para MongoDB:`, JSON.stringify(currentRound, null, 2));
    
    if (currentRound && currentRound.game_rounds && currentRound.game_rounds[0]) {
      const roundData = currentRound.game_rounds[0];
      const roundId = `round_${Date.now()}_${INSTANCE_ID}`;
      const startTime = new Date(Date.now() - (10000 + (multiplier - 1) * 100)); // Aproximar tiempo de inicio
      
      // Verificar que tenemos apuestas
      const bets = roundData.bets || [];
      console.log(`💰 [${INSTANCE_ID}] Apuestas encontradas en la ronda: ${bets.length}`);
      if (bets.length > 0) {
        console.log(`📋 [${INSTANCE_ID}] Detalles de apuestas:`, bets.map(bet => `${bet.player?.username || 'Unknown'}: $${bet.amount}`));
      }
      
      // Procesar en background para no bloquear el juego
      mongoDBService.processRoundEnd(
        roundId,
        startTime,
        endTime,
        finalMultiplier,
        bets
      ).catch(error => {
        console.error(`❌ [${INSTANCE_ID}] Error guardando ronda en MongoDB:`, error);
      });
      
      console.log(`📊 [${INSTANCE_ID}] Ronda ${roundId} enviada a MongoDB para procesamiento (${bets.length} apuestas)`);
    } else {
      console.warn(`⚠️ [${INSTANCE_ID}] No se encontraron datos de ronda para guardar en MongoDB`);
    }
  }

  startCountdownRound(io)
}

function selectStateRound() {
  switch (getRoundStatusHall(0, 0)) {
    case 'not_initied':
      modifyRound(io, 'in_progress', 0, false, 'Ronda en progreso')
      clearInterval(gameInterval)
      startAviatorSimulate(io)
      break;
    case 'finished':
      modifyRound(io, 'not_initied', 10, true, 'Prepara tu apuesta')
      break;
    default:
      break;
  }
}

function modifyRound(io, newState, newTimeSec, isBetTime, title) {
  setRoundStatusHall(0, 0, newState)
  countdown = newTimeSec;
  io.emit("update_round_state",
    { newState, isBetTime, title }
  );
}



// Health check endpoint
app.get('/health', async (req, res) => {
  const mongoStatus = mongoDBService ? await mongoDBService.getHealthStatus() : { status: 'disconnected' };
  
  res.json({ 
    status: 'ok', 
    instance: INSTANCE_ID,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    redis: redisManager ? 'connected' : 'disconnected',
    mongodb: mongoStatus
  });
});

// Endpoint para verificar estado de Redis
app.get('/redis-stats', async (req, res) => {
  try {
    if (!redisManager) {
      return res.status(503).json({
        error: 'Redis no disponible',
        instance: INSTANCE_ID,
        mode: 'standalone'
      });
    }
    
    const stats = await redisManager.getStats();
    const currentBets = await redisManager.getCurrentBets();
    const activePlayers = await redisManager.getActivePlayers();
    const roundState = await redisManager.getCurrentRoundState();
    
    res.json({
      instance: INSTANCE_ID,
      redis: 'connected',
      stats: stats,
      gameState: {
        currentBets: Object.keys(currentBets).length,
        activePlayers: activePlayers.length,
        roundState: roundState?.status || 'unknown',
        betsDetails: currentBets
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ [${INSTANCE_ID}] Error obteniendo stats de Redis:`, error);
    res.status(500).json({
      error: 'Error obteniendo estadísticas de Redis',
      instance: INSTANCE_ID,
      details: error.message
    });
  }
});

// Endpoint para limpiar estado de Redis (solo para desarrollo)
app.post('/redis-clear', async (req, res) => {
  try {
    if (!redisManager) {
      return res.status(503).json({
        error: 'Redis no disponible',
        instance: INSTANCE_ID
      });
    }
    
    await redisManager.clearAllBets();
    
    res.json({
      message: 'Estado de Redis limpiado',
      instance: INSTANCE_ID,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ [${INSTANCE_ID}] Error limpiando Redis:`, error);
    res.status(500).json({
      error: 'Error limpiando Redis',
      instance: INSTANCE_ID,
      details: error.message
    });
  }
});

// ===== ENDPOINTS DE ESTADÍSTICAS MONGODB =====
app.get('/stats/players/top', async (req, res) => {
  try {
    if (!mongoDBService) {
      return res.status(503).json({
        error: 'MongoDB no disponible',
        instance: INSTANCE_ID
      });
    }

    const limit = parseInt(req.query.limit as string) || 10;
    const topPlayers = await mongoDBService.getTopPlayers(limit);
    
    res.json({
      success: true,
      instance: INSTANCE_ID,
      data: topPlayers,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ [${INSTANCE_ID}] Error obteniendo top players:`, error);
    res.status(500).json({
      error: 'Error obteniendo estadísticas de jugadores',
      instance: INSTANCE_ID,
      details: error.message
    });
  }
});

app.get('/stats/rounds/recent', async (req, res) => {
  try {
    if (!mongoDBService) {
      return res.status(503).json({
        error: 'MongoDB no disponible',
        instance: INSTANCE_ID
      });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const recentRounds = await mongoDBService.getRecentRounds(limit);
    
    res.json({
      success: true,
      instance: INSTANCE_ID,
      data: recentRounds,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ [${INSTANCE_ID}] Error obteniendo rondas recientes:`, error);
    res.status(500).json({
      error: 'Error obteniendo rondas recientes',
      instance: INSTANCE_ID,
      details: error.message
    });
  }
});

app.get('/stats/round/:roundId', async (req, res) => {
  try {
    if (!mongoDBService) {
      return res.status(503).json({
        error: 'MongoDB no disponible',
        instance: INSTANCE_ID
      });
    }

    const { roundId } = req.params;
    const roundStats = await mongoDBService.getRoundStats(roundId);
    
    res.json({
      success: true,
      instance: INSTANCE_ID,
      data: roundStats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ [${INSTANCE_ID}] Error obteniendo estadísticas de ronda:`, error);
    res.status(500).json({
      error: 'Error obteniendo estadísticas de ronda',
      instance: INSTANCE_ID,
      details: error.message
    });
  }
});

app.get('/stats/player/:playerId', async (req, res) => {
  try {
    if (!mongoDBService) {
      return res.status(503).json({
        error: 'MongoDB no disponible',
        instance: INSTANCE_ID
      });
    }

    const { playerId } = req.params;
    const playerStats = await mongoDBService.getPlayerStats(playerId);
    
    res.json({
      success: true,
      instance: INSTANCE_ID,
      data: playerStats,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error(`❌ [${INSTANCE_ID}] Error obteniendo estadísticas de jugador:`, error);
    res.status(500).json({
      error: 'Error obteniendo estadísticas de jugador',
      instance: INSTANCE_ID,
      details: error.message
    });
  }
});

// Obtener IP del cliente
function getClientIp(socket) {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  return forwarded ? forwarded.split(",")[0] : socket.handshake.address;
}

app.post("/api/validate-user", (req, res) => {
  const { username } = req.body;

  if (!username || username.trim() === "") {
    return res.status(400).json({ success: false, message: "Falta el username" });
  }

  const players = getPlayers();
  const exists = players.some(
    (p) => p.username.toLowerCase() === username.toLowerCase()
  );

  if (exists) {
    return res.json({ success: true });
  } else {
    return res.json({ success: false });
  }
});

io.on("connection", (socket) => {
  const clientIp = getClientIp(socket);
  console.log(`✅ [${INSTANCE_ID}] Cliente conectado: ${socket.id} desde IP ${clientIp}`);

  socket.on("join_game", async (playerData) => {
    const { username, register_date } = playerData;
    
    try {
      // Agregar sesión local
      addSessionPlayer({ id_player: socket.id, username, register_date });
      console.log(`🎮 [${INSTANCE_ID}] Jugador ${playerData.username} (${socket.id}) se unió`);
      
      // Sincronizar sesión con Redis si está disponible
      if (redisManager) {
        await redisManager.publishPlayerUpdate({
          action: 'join',
          player: { id_player: socket.id, username, register_date },
          instanceId: INSTANCE_ID,
          timestamp: Date.now()
        });
        console.log(`📡 [${INSTANCE_ID}] Sesión de ${username} publicada a Redis`);
      }
      
      // Enviar jugadores activos, no las sesiones completas
      const { getActivePlayers } = require("./services/game-service");
      const activePlayers = getActivePlayers();
      console.log('se emite para el update los players (jugadores activos):', activePlayers)
      io.emit("players_update", activePlayers);
      io.emit("bets_update", getGameHall(0));
      
      if (!gameInterval) {
        startCountdownRound(io);
      }
      
    } catch (error) {
      console.error(`❌ [${INSTANCE_ID}] Error en join_game:`, error);
    }
  });


  socket.on("disconnect", async (reason) => {
    console.log(`⚠️ [${INSTANCE_ID}] Cliente ${socket.id} desconectado (${reason})`);
    
    try {
      // Obtener información del jugador antes de remover
      const { getSessionPlayers, removePlayerFromSessions } = require("./services/game-service");
      const sessions = getSessionPlayers();
      const playerSession = sessions.find(s => s.id_session === socket.id);
      
      if (playerSession && redisManager) {
        // Publicar desconexión a Redis
        await redisManager.publishPlayerUpdate({
          action: 'leave',
          player: playerSession.player,
          instanceId: INSTANCE_ID,
          timestamp: Date.now()
        });
        console.log(`📡 [${INSTANCE_ID}] Desconexión de ${playerSession.player.username} publicada a Redis`);
      }
      
      // Remover sesión local
      removePlayerFromSessions(socket.id);
      
    } catch (error) {
      console.error(`❌ [${INSTANCE_ID}] Error en disconnect:`, error);
    }
  });

  socket.on("new_bet", async (newBet) => {
    const { id, amount } = newBet;
    
    try {
      // Agregar apuesta local (para compatibilidad)
      const result = addBetToCurrentRound(id, amount);
      console.log(`[${INSTANCE_ID}] recibiendo apuesta`, newBet, 'resultado:', result);
      
      if (result && redisManager) {
        // Publicar apuesta a Redis para sincronización
        await redisManager.publishBet({
          id_player: id,
          amount: amount,
          instanceId: INSTANCE_ID,
          timestamp: Date.now()
        });
        
        console.log(`💰 [${INSTANCE_ID}] Apuesta publicada a Redis: ${id} - $${amount}`);
        
        // Emitir a clientes locales (Redis se encarga de otras instancias)
        io.emit("bets_update", getGameHall(0));
        
      } else if (result) {
        // Modo standalone sin Redis
        console.log(`💰 [${INSTANCE_ID}] Apuesta procesada localmente: ${id} - $${amount}`);
        io.emit("bets_update", getGameHall(0));
      }
      
    } catch (error) {
      console.error(`❌ [${INSTANCE_ID}] Error procesando apuesta:`, error);
    }
  });

  socket.on("cancel_bet", async (result) => {
    const { id_player } = result;
    
    try {
      // Cancelar apuesta local
      const deletedBet = cancelBet(id_player);
      console.log(`[${INSTANCE_ID}] cancelando apuesta ...`, deletedBet);
      
      if (deletedBet && redisManager) {
        // Publicar cancelación a Redis
        await redisManager.publishCancelBet(id_player);
        
        console.log(`� [${INSTANCE_ID}] Cancelación publicada a Redis: ${id_player}`);
        
        // Emitir a clientes locales
        io.emit("bets_update", getGameHall(0));
        
      } else if (deletedBet) {
        // Modo standalone sin Redis
        console.log(`🚫 [${INSTANCE_ID}] Apuesta cancelada localmente: ${id_player}`);
        io.emit("bets_update", getGameHall(0));
      }
      
    } catch (error) {
      console.error(`❌ [${INSTANCE_ID}] Error cancelando apuesta:`, error);
    }
  });

});

// ===== INICIALIZACIÓN DE REDIS =====
async function initializeRedis() {
  try {
    console.log(`🔄 [${INSTANCE_ID}] Inicializando Redis...`);
    
    // Crear clientes Redis para Socket.IO adapter
    const pubClient = createClient({ url: REDIS_URL });
    const subClient = pubClient.duplicate();
    
    await Promise.all([
      pubClient.connect(),
      subClient.connect()
    ]);
    
    // Configurar adapter de Redis para Socket.IO
    io.adapter(createAdapter(pubClient, subClient));
    console.log(`🔗 [${INSTANCE_ID}] Socket.IO Redis adapter configurado`);
    
    // Inicializar Redis Game Manager
    redisManager = new RedisGameManager(INSTANCE_ID, io, REDIS_URL);
    await redisManager.connect();
    
    console.log(`✅ [${INSTANCE_ID}] Redis inicializado correctamente`);
    return true;
    
  } catch (error) {
    console.error(`❌ [${INSTANCE_ID}] Error inicializando Redis:`, error);
    return false;
  }
}

// ===== INICIALIZACIÓN DE MONGODB =====
async function initializeMongoDB() {
  try {
    console.log(`🍃 [${INSTANCE_ID}] Inicializando MongoDB...`);
    
    mongoDBService = new MongoDBService(INSTANCE_ID);
    await mongoDBService.connect();
    
    console.log(`✅ [${INSTANCE_ID}] MongoDB inicializado correctamente`);
    return true;
    
  } catch (error) {
    console.error(`❌ [${INSTANCE_ID}] Error inicializando MongoDB:`, error);
    return false;
  }
}

// Inicializar servidor
async function startServer() {
  try {
    // Inicializar Redis primero
    const redisInitialized = await initializeRedis();
    
    if (!redisInitialized) {
      console.warn(`⚠️ [${INSTANCE_ID}] Continuando sin Redis (modo standalone)`);
    }
    
    // Inicializar MongoDB
    const mongoInitialized = await initializeMongoDB();
    
    if (!mongoInitialized) {
      console.warn(`⚠️ [${INSTANCE_ID}] Continuando sin MongoDB (solo en memoria)`);
    }
    
    // Iniciar servidor
    server.listen(PORT, () => {
      console.log(`🚀 [${INSTANCE_ID}] Servidor corriendo en puerto ${PORT}`);
      console.log(`📊 [${INSTANCE_ID}] Health check disponible en /health`);
      
      if (redisManager) {
        console.log(`🎮 [${INSTANCE_ID}] Modo distribuido activado con Redis`);
      } else {
        console.log(`🎮 [${INSTANCE_ID}] Modo standalone (sin Redis)`);
      }
    });
    
  } catch (error) {
    console.error(`❌ [${INSTANCE_ID}] Error iniciando servidor:`, error);
    process.exit(1);
  }
}

// Manejo de cierre graceful
process.on('SIGTERM', async () => {
  console.log(`🛑 [${INSTANCE_ID}] Recibiendo SIGTERM, cerrando gracefully...`);
  
  // Desconectar servicios
  if (redisManager) {
    await redisManager.disconnect();
  }
  if (mongoDBService) {
    await mongoDBService.disconnect();
  }
  
  server.close(() => {
    console.log(`👋 [${INSTANCE_ID}] Servidor cerrado`);
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log(`🛑 [${INSTANCE_ID}] Recibiendo SIGINT, cerrando gracefully...`);
  
  // Desconectar servicios
  if (redisManager) {
    await redisManager.disconnect();
  }
  if (mongoDBService) {
    await mongoDBService.disconnect();
  }
  
  server.close(() => {
    console.log(`👋 [${INSTANCE_ID}] Servidor cerrado`);
    process.exit(0);
  });
});

// Inicializar aplicación
startServer();
