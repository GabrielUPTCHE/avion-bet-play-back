// backend/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { addPlayer, getPlayers, addBetToCurrentRound, getGameHall, cancelBet, setRoundStatusHall, getRoundStatusHall } = require("./services/game-service.ts");

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

let countdown = 10; // 60 segundos

function startCountdownRound(io) {
  const interval = setInterval(() => {
    if (countdown > 0) {
      console.log(`⏳ Tiempo restante: ${countdown}s`);
      io.emit("tick", { secondsLeft: countdown });
      countdown--;
    } else {
      console.log("🚀 ¡Ronda iniciada!");
      io.emit("round_start", { message: "La ronda ha comenzado!" });
      if (getRoundStatusHall(0,0) === 'not_initied') {
        modifyRound(io,'in_progress', 30, false, 'Ronda en progreso' )
      }
      if(getRoundStatusHall(0,0) === 'in_progress'){
        modifyRound(io,'finished', 10, false, 'La ronda ha finalizado' )
      }
      if(getRoundStatusHall(0,0) === 'finished'){
        modifyRound(io,'finished', 10, true, 'Prepara tu apuesta' )
      }
      // aquí podrías iniciar la lógica de la ronda (ej: crecimiento del avión)
    }
  }, 1000);
}

function modifyRound(io,newState, newTimeSec, isBetTime, title) {
  setRoundStatusHall(0,0,newState)
  countdown = newTimeSec;
  io.emit("update_round_state",
          {newState,isBetTime,title}
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
    startCountdownRound(io);
  });


  socket.on("disconnect", (reason) => {
    console.log(`⚠️ Cliente ${socket.id} desconectado (${reason})`);

    //io.emit("players_update", Array.from(players.values()));
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
    console.log('')
    const { id_player} = result;
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
  