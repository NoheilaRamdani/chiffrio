const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, { cors: { origin: "*" } });

const rooms = new Map();

app.use(express.static('../dist')); // Sert les fichiers build du frontend

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('createRoom', (data) => {
    const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms.set(roomId, {
      players: { 1: data.pseudo, 2: null },
      secrets: { 1: null, 2: null },
      history: { 1: [], 2: [] },
      currentPlayer: 1
    });
    socket.join(roomId);
    socket.emit('roomCreated', { roomId });
  });

  socket.on('joinRoom', (data) => {
    const room = rooms.get(data.roomId);
    // ✅ Gestion des erreurs améliorée
    if (!room) {
      socket.emit('error', 'Cette salle n\'existe pas 🚫');
      return;
    }
    if (room.players[2]) {
      socket.emit('error', 'Cette salle est déjà pleine 🚫');
      return;
    }

    // ✅ Le joueur peut rejoindre
    room.players[2] = data.pseudo;
    socket.join(data.roomId);
    socket.emit('roomJoined', { roomId: data.roomId, players: room.players });
    // ✅ Notifie TOUS les joueurs de la room qu'un joueur a rejoint
    io.to(data.roomId).emit('playerJoined', { players: room.players });
  });

  socket.on('setSecret', (data) => {
    const roomId = [...socket.rooms][1];
    const room = rooms.get(roomId);
    if (room) {
      room.secrets[data.player] = data.secret;
      // ✅ Notifie l'AUTRE joueur qu'un secret a été défini
      socket.to(roomId).emit('secretSet', { player: data.player });

      // ✅ Vérifie si les deux secrets sont définis
      if (room.secrets[1] && room.secrets[2]) {
        io.to(roomId).emit('gameStart');
      }
    }
  });

  socket.on('submitGuess', (data) => {
    const roomId = [...socket.rooms][1];
    const room = rooms.get(roomId);
    if (room && room.currentPlayer === data.player) {
      const secret = room.secrets[data.player === 1 ? 2 : 1];
      let wellPlaced = 0, misplaced = 0;

      // ✅ Amélioration de l'algorithme de comparaison
      const secretArr = secret.split('');
      const guessArr = data.guess.split('');
      const secretUsed = new Array(4).fill(false);
      const guessUsed = new Array(4).fill(false);

      // D'abord, compter les bien placés
      for (let i = 0; i < 4; i++) {
        if (secretArr[i] === guessArr[i]) {
          wellPlaced++;
          secretUsed[i] = true;
          guessUsed[i] = true;
        }
      }

      // Ensuite, compter les mal placés
      for (let i = 0; i < 4; i++) {
        if (!guessUsed[i]) {
          for (let j = 0; j < 4; j++) {
            if (!secretUsed[j] && secretArr[j] === guessArr[i]) {
              misplaced++;
              secretUsed[j] = true;
              break;
            }
          }
        }
      }

      data.feedback = { wellPlaced, misplaced };
      room.history[data.player].push(data);
      io.to(roomId).emit('feedback', data);

      // ✅ Changer le joueur actuel seulement si le jeu continue
      if (data.feedback.wellPlaced !== 4) {
        room.currentPlayer = data.player === 1 ? 2 : 1;
      }
    }
  });

  // ✅ Fonction pour vérifier si le jeu peut commencer
  socket.on('checkGameStart', (data) => {
    const room = rooms.get(data.roomId);
    if (room && room.secrets[1] && room.secrets[2]) {
      io.to(data.roomId).emit('gameStart');
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    // ✅ Optionnel : nettoyer les rooms vides
    for (const [roomId, room] of rooms.entries()) {
      // Si tu veux gérer la déconnexion, tu peux ajouter la logique ici
    }
  });
});

server.listen(3001, () => {
  console.log('Server running on port 3001');
});