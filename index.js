// backend/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { createAdapter } = require("@socket.io/redis-adapter");
const { createClient } = require("redis");
const cors = require("cors");
const { addPlayer, getPlayers, addBetToCurrentRound, getGameHall, cancelBet, setRoundStatusHall, getRoundStatusHall } = require("./services/game-service.ts");
const { generateRoundService } = require("./services/aviator-service.ts");

// Importar Redis Manager
const { RedisGameManager } = require("./services/redis-manager.ts");

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

// Variables globales para Redis y estado del juego
let redisManager;
let redisAdapter;

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

  io.emit("round_start");

  aviatorInterval = setInterval(() => {
    if (multiplier >= crashPoint) {
      endRound(io);
    } else {
      multiplier += 0.1;
      //se elimina, solo se envia cuando termina
      io.emit("plane_update", {
        multiplier: parseFloat(multiplier.toFixed(2)),
        timestamp: Date.now(),
      });
    }
  }, 100);
}

function endRound(io) {
  if (!isRunning) return;
  isRunning = false;

  if (aviatorInterval) {
    clearInterval(aviatorInterval);
    aviatorInterval = null;
  }

  modifyRound(io, 'finished', 5, false, 'La ronda ha finalizado')
  io.emit("round_end", { finalMultiplier: multiplier.toFixed(2) });
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
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    instance: INSTANCE_ID,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    redis: redisManager ? 'connected' : 'disconnected'
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

// Obtener IP del cliente
function getClientIp(socket) {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  return forwarded ? forwarded.split(",")[0] : socket.handshake.address;
}

io.on("connection", (socket) => {
  const clientIp = getClientIp(socket);
  console.log(`✅ [${INSTANCE_ID}] Cliente conectado: ${socket.id} desde IP ${clientIp}`);

  socket.on("join_game", (playerData) => {
    const { username, register_date } = playerData;
    addPlayer({ id_player: socket.id, username, register_date });
    console.log(`🎮 [${INSTANCE_ID}] Jugador ${playerData.username} (${socket.id}) se unió`);
    console.log('se emite para el update los players:', getPlayers())
    io.emit("players_update", getPlayers());
    io.emit("bets_update", getGameHall(0));
    if (!gameInterval) {
      startCountdownRound(io);
    }
  });


  socket.on("disconnect", (reason) => {
    console.log(`⚠️ [${INSTANCE_ID}] Cliente ${socket.id} desconectado (${reason})`);
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

// Inicializar servidor
async function startServer() {
  try {
    // Inicializar Redis primero
    const redisInitialized = await initializeRedis();
    
    if (!redisInitialized) {
      console.warn(`⚠️ [${INSTANCE_ID}] Continuando sin Redis (modo standalone)`);
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
  if (redisManager) {
    await redisManager.disconnect();
  }
  server.close(() => {
    console.log(`👋 [${INSTANCE_ID}] Servidor cerrado`);
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log(`🛑 [${INSTANCE_ID}] Recibiendo SIGINT, cerrando gracefully...`);
  if (redisManager) {
    await redisManager.disconnect();
  }
  server.close(() => {
    console.log(`👋 [${INSTANCE_ID}] Servidor cerrado`);
    process.exit(0);
  });
});

// Inicializar aplicación
startServer();
