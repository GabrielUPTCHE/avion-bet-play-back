// backend/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { addPlayer, getPlayers, addBetToCurrentRound, getGameHall, cancelBet, setRoundStatusHall, getRoundStatusHall } = require("./services/game-service.ts");
const { generateRoundService } = require("./services/aviator-service.ts")

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



// Obtener IP del cliente
function getClientIp(socket) {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  return forwarded ? forwarded.split(",")[0] : socket.handshake.address;
}

io.on("connection", (socket) => {
  const clientIp = getClientIp(socket);
  console.log(`✅ Cliente conectado: ${socket.id} desde IP ${clientIp}`);

  socket.on("join_game", (playerData) => {
    const { username, register_date } = playerData;
    addPlayer({ id_player: socket.id, username, register_date });
    console.log(`🎮 Jugador ${playerData.username} (${socket.id}) se unió`);
    console.log('se emite para el update los players:', getPlayers())
    io.emit("players_update", getPlayers());
    io.emit("bets_update", getGameHall(0));
    if (!gameInterval) {
      startCountdownRound(io);
    }
  });


  socket.on("disconnect", (reason) => {
    console.log(`⚠️ Cliente ${socket.id} desconectado (${reason})`);

  });


  socket.on("new_bet", (newBet) => {
    const { id, amount } = newBet;
    const result = addBetToCurrentRound(id, amount);
    console.log('recibiendo apuesta', newBet, 'resultado:', result);
    if (result) {
      console.log(`💰 Apuesta recibida de ${id}: $${amount}`);
      console.log('estado del juego:', getGameHall(0));
      io.emit("bets_update", getGameHall(0));
    }
  });

  socket.on("cancel_bet", (result) => {
    const { id_player } = result;
    const deletedBet = cancelBet(id_player);
    console.log('cancelando apuesta ...', deletedBet);
    if (deletedBet) {
      console.log(`💰 Apuesta cancelada de ${id_player}`);
      console.log('estado del juego:', getGameHall(0).game_rounds[0].bets);
      io.emit("bets_update", getGameHall(0));
    }
  });

});






server.listen(4000, () => {
  console.log("🚀 Servidor corriendo en http://localhost:4000");
});
