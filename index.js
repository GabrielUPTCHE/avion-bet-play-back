// backend/index.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { addPlayer, getPlayers, addBetToCurrentRound, getGameHall } = require("./services/game-service.ts");

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
    addPlayer({ id: socket.id, username, register_date });
    console.log(`🎮 Jugador ${playerData.username} (${socket.id}) se unió`);
    io.emit("players_update", getPlayers());
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
      io.emit("bets_update", getGameHall());
    }
  });
});



server.listen(4000, () => {
  console.log("🚀 Servidor corriendo en http://localhost:4000");
});
  