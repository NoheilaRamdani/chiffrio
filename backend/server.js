const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const rooms = {};

const generateRoomId = () => {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
};

const checkGuess = (secret, guess) => {
    let wellPlaced = 0;
    let misplaced = 0;
    const secretArr = secret.split('');
    const guessArr = guess.split('');

    // Check for well-placed numbers
    for (let i = 0; i < secretArr.length; i++) {
        if (secretArr[i] === guessArr[i]) {
            wellPlaced++;
            secretArr[i] = 'x'; // Mark as used
            guessArr[i] = 'y'; // Mark as used
        }
    }

    // Check for misplaced numbers
    for (let i = 0; i < guessArr.length; i++) {
        if (guessArr[i] !== 'y') {
            const secretIndex = secretArr.indexOf(guessArr[i]);
            if (secretIndex > -1) {
                misplaced++;
                secretArr[secretIndex] = 'x'; // Mark as used
            }
        }
    }

    return { wellPlaced, misplaced };
};

// Fonction pour valider un nombre selon les règles
const validateNumber = (number, gameSettings) => {
    if (number.length !== gameSettings.digits || !/^\d+$/.test(number)) {
        return { valid: false, error: `Entre ${gameSettings.digits} chiffres valides !` };
    }

    if (!gameSettings.allowDuplicates && new Set(number.split('')).size !== number.length) {
        return { valid: false, error: 'Pas de chiffres en double autorisés !' };
    }

    return { valid: true };
};

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    socket.on('createRoom', ({ pseudo, gameSettings }) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            players: [{ id: socket.id, pseudo, secret: null }],
            secrets: {},
            gameSettings: gameSettings
        };
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, gameSettings });
        console.log(`Room ${roomId} created by ${pseudo}`);
    });

    socket.on('joinRoom', ({ pseudo, roomId }) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error', 'Cette salle n\'existe pas.');
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('error', 'Cette salle est déjà pleine.');
            return;
        }

        room.players.push({ id: socket.id, pseudo, secret: null });
        socket.join(roomId);

        const playersData = {
            player1: room.players[0].pseudo,
            player2: room.players[1].pseudo
        };

        // Envoyer les paramètres de jeu aux deux joueurs
        socket.emit('roomJoined', { roomId, players: playersData, gameSettings: room.gameSettings });
        io.to(room.players[0].id).emit('playerJoined', { players: playersData, gameSettings: room.gameSettings });
        console.log(`${pseudo} joined room ${roomId}`);
    });

    socket.on('setSecret', ({ secret, player }) => {
        const roomId = Object.keys(rooms).find(key => rooms[key].players.some(p => p.id === socket.id));
        const room = rooms[roomId];
        if (!room) return;

        // Valider le secret selon les règles du jeu
        const validation = validateNumber(secret, room.gameSettings);
        if (!validation.valid) {
            socket.emit('error', validation.error);
            return;
        }

        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        room.players[playerIndex].secret = secret;
        room.secrets[socket.id] = secret;

        io.to(roomId).emit('secretSet', { player });

        if (room.players.length === 2 && room.players.every(p => p.secret !== undefined && p.secret !== null)) {
            const startingPlayer = Math.random() < 0.5 ? 1 : 2;
            room.currentPlayer = startingPlayer;
            io.to(roomId).emit('gameStart', { currentPlayer: startingPlayer, gameSettings: room.gameSettings });
            console.log(`Game started in room ${roomId}. Player ${startingPlayer} starts.`);
        }
    });

    socket.on('submitGuess', ({ guess, player }) => {
        const roomId = Object.keys(rooms).find(key => rooms[key].players.some(p => p.id === socket.id));
        const room = rooms[roomId];
        if (!room) return;

        const guesser = room.players.find(p => p.id === socket.id);
        const playerIndex = room.players.findIndex(p => p.id === guesser.id) + 1;
        if (playerIndex !== room.currentPlayer) {
            socket.emit('error', 'Ce n\'est pas votre tour de jouer.');
            return;
        }

        // Valider la proposition selon les règles du jeu
        const validation = validateNumber(guess, room.gameSettings);
        if (!validation.valid) {
            socket.emit('error', validation.error);
            return;
        }

        const opponentId = room.players.find(p => p.id !== socket.id).id;
        const opponentSecret = room.secrets[opponentId];
        const feedback = checkGuess(opponentSecret, guess);

        io.to(roomId).emit('feedback', {
            guess,
            player,
            feedback
        });

        if (feedback.wellPlaced !== room.gameSettings.digits) {
            room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
        }
    });

    socket.on('disconnect', () => {
        const roomId = Object.keys(rooms).find(key => rooms[key].players.some(p => p.id === socket.id));
        if (roomId && rooms[roomId]) {
            const playerIndex = rooms[roomId].players.findIndex(p => p.id === socket.id);
            if (playerIndex !== -1) {
                rooms[roomId].players.splice(playerIndex, 1);
            }
            if (rooms[roomId].players.length === 0) {
                delete rooms[roomId];
                console.log(`Room ${roomId} has been deleted.`);
            } else {
                io.to(roomId).emit('error', 'Votre adversaire s\'est déconnecté. La partie est terminée.');
                delete rooms[roomId];
                console.log(`Room ${roomId} has been ended due to player disconnection.`);
            }
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});