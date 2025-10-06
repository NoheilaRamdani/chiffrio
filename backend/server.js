const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// En production, remplace '*' par l'URL de ton frontend (ex: https://ton-frontend.onrender.com)
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

const rooms = {};
const RECONNECTION_TIMEOUT = 30000;

const generateRoomId = () => {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
};

const checkGuess = (secret, guess, settings) => {
    let wellPlaced = 0;
    let misplaced = 0;
    const wellPlacedDigits = [];
    const misplacedDigits = [];
    const secretArr = secret.split('');
    const guessArr = guess.split('');

    for (let i = 0; i < secretArr.length; i++) {
        if (secretArr[i] === guessArr[i]) {
            wellPlaced++;
            wellPlacedDigits.push(i);
            secretArr[i] = 'x';
            guessArr[i] = 'y';
        }
    }

    for (let i = 0; i < guessArr.length; i++) {
        if (guessArr[i] !== 'y') {
            const secretIndex = secretArr.indexOf(guessArr[i]);
            if (secretIndex > -1) {
                misplaced++;
                misplacedDigits.push(i);
                secretArr[secretIndex] = 'x';
            }
        }
    }

    return {
        wellPlaced,
        misplaced: settings.showMisplaced ? misplaced : 0,
        wellPlacedDigits: settings.showWellPlacedDigits ? wellPlacedDigits : [],
        misplacedDigits: settings.showMisplacedDigits ? misplacedDigits : []
    };
};

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

    socket.on('createRoom', ({ pseudo, gameSettings, sessionId }) => {
        const roomId = generateRoomId();
        rooms[roomId] = {
            players: [{ id: socket.id, pseudo, secret: null, sessionId, connected: true }],
            secrets: {},
            gameSettings,
            history: [],
            currentPlayer: null,
            gameState: 'hosting'
        };
        socket.join(roomId);
        socket.emit('roomCreated', { roomId, gameSettings });
        console.log(`Room ${roomId} created by ${pseudo}`);
    });

    socket.on('joinRoom', ({ pseudo, roomId, sessionId }) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error', 'Cette salle n\'existe pas.');
            return;
        }

        if (room.players.length >= 2) {
            socket.emit('error', 'Cette salle est déjà pleine.');
            return;
        }

        if (pseudo.length < 2) {
            socket.emit('error', 'Pseudo trop court (au moins 2 caractères).');
            return;
        }

        room.players.push({ id: socket.id, pseudo, secret: null, sessionId, connected: true });
        room.gameState = 'setup';
        socket.join(roomId);

        const playersData = {
            player1: room.players[0].pseudo,
            player2: room.players[1].pseudo
        };

        socket.emit('roomJoined', { roomId, players: playersData, gameSettings: room.gameSettings });
        io.to(room.players[0].id).emit('playerJoined', { players: playersData, gameSettings: room.gameSettings });
        console.log(`${pseudo} joined room ${roomId}`);
    });

    // ... (le reste du server.js reste identique à la version précédente)

    socket.on('reconnect', ({ sessionId }) => {
        const roomId = Object.keys(rooms).find(key =>
            rooms[key].players.some(p => p.sessionId === sessionId)
        );
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error', 'Aucune salle trouvée pour cette session.');
            return;
        }

        const player = room.players.find(p => p.sessionId === sessionId);
        if (!player) {
            socket.emit('error', 'Joueur non trouvé.');
            return;
        }

        player.id = socket.id;
        player.connected = true;
        socket.join(roomId);

        socket.emit('reconnected', {
            gameState: {
                state: room.gameState,
                roomId,
                players: {
                    player1: room.players[0].pseudo,
                    player2: room.players[1]?.pseudo || ''
                },
                myPlayerId: room.players.findIndex(p => p.sessionId === sessionId) + 1,
                currentPlayer: room.currentPlayer,
                isMyTurn: room.currentPlayer === (room.players.findIndex(p => p.sessionId === sessionId) + 1),
                gameSettings: room.gameSettings,
                history: room.history,
                playerSecret: player.secret || Array(room.gameSettings.digits).fill('')
            }
        });

        const otherPlayer = room.players.find(p => p.sessionId !== sessionId);
        if (otherPlayer && otherPlayer.connected) {
            io.to(otherPlayer.id).emit('playerReconnected', { pseudo: player.pseudo });
        }

        console.log(`Player ${player.pseudo} reconnected to room ${roomId}`);
    });

    socket.on('setSecret', ({ secret, player, sessionId }) => {
        const roomId = Object.keys(rooms).find(key => rooms[key].players.some(p => p.sessionId === sessionId));
        const room = rooms[roomId];
        if (!room) return;

        const validation = validateNumber(secret, room.gameSettings);
        if (!validation.valid) {
            socket.emit('error', validation.error);
            return;
        }

        const playerIndex = room.players.findIndex(p => p.sessionId === sessionId);
        room.players[playerIndex].secret = secret;
        room.secrets[socket.id] = secret;

        io.to(roomId).emit('secretSet', { player });

        if (room.players.length === 2 && room.players.every(p => p.secret !== null && p.secret !== undefined)) {
            room.gameState = 'playing';
            room.currentPlayer = Math.random() < 0.5 ? 1 : 2;
            io.to(roomId).emit('gameStart', { currentPlayer: room.currentPlayer, gameSettings: room.gameSettings });
            console.log(`Game started in room ${roomId}. Player ${room.currentPlayer} starts.`);
        }
    });

    socket.on('submitGuess', ({ guess, player, sessionId }) => {
        const roomId = Object.keys(rooms).find(key => rooms[key].players.some(p => p.sessionId === sessionId));
        const room = rooms[roomId];
        if (!room) return;

        const guesser = room.players.find(p => p.sessionId === sessionId);
        const playerIndex = room.players.findIndex(p => p.sessionId === sessionId) + 1;
        if (playerIndex !== room.currentPlayer) {
            socket.emit('error', 'Ce n\'est pas votre tour de jouer.');
            return;
        }

        const validation = validateNumber(guess, room.gameSettings);
        if (!validation.valid) {
            socket.emit('error', validation.error);
            return;
        }

        const opponent = room.players.find(p => p.sessionId !== sessionId);
        const opponentSecret = room.secrets[opponent.id];
        const feedback = checkGuess(opponentSecret, guess, room.gameSettings);

        const newEntry = {
            guess,
            player,
            feedback,
            timestamp: Date.now()
        };
        room.history.push(newEntry);

        io.to(roomId).emit('feedback', newEntry);

        if (feedback.wellPlaced === room.gameSettings.digits) {
            room.gameState = 'won';
            io.to(roomId).emit('gameWon', { winner: player });
        } else {
            room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
        }
    });

    socket.on('updateSettings', ({ roomId, gameSettings, sessionId }) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error', 'Salle non trouvée.');
            return;
        }

        const playerIndex = room.players.findIndex(p => p.sessionId === sessionId);
        if (playerIndex !== 0) { // Only host (player 1) can update settings
            socket.emit('error', 'Seul l\'hôte peut modifier les règles.');
            return;
        }

        room.gameSettings = gameSettings;
        room.players.forEach(player => {
            player.secret = null;
            room.secrets[player.id] = null;
        });
        room.history = [];
        room.gameState = 'setup';
        room.currentPlayer = null;

        io.to(roomId).emit('settingsUpdated', gameSettings);
        console.log(`Settings updated in room ${roomId}`);
    });

    socket.on('restartGame', ({ roomId, sessionId }) => {
        const room = rooms[roomId];
        if (!room) {
            socket.emit('error', 'Salle non trouvée.');
            return;
        }

        room.gameState = 'setup';
        room.history = [];
        room.currentPlayer = null;
        room.players.forEach(player => {
            player.secret = null;
            room.secrets[player.id] = null;
        });

        io.to(roomId).emit('gameRestarted');
        console.log(`Room ${roomId} restarted.`);
    });

    socket.on('disconnect', () => {
        const roomId = Object.keys(rooms).find(key => rooms[key].players.some(p => p.id === socket.id));
        if (!roomId || !rooms[roomId]) return;

        const player = rooms[roomId].players.find(p => p.id === socket.id);
        if (player) {
            player.connected = false;
            console.log(`Player ${player.pseudo} disconnected from room ${roomId}`);

            const otherPlayer = rooms[roomId].players.find(p => p.id !== socket.id && p.connected);
            if (otherPlayer) {
                io.to(otherPlayer.id).emit('playerDisconnected', { pseudo: player.pseudo });
            }

            setTimeout(() => {
                if (!rooms[roomId] || rooms[roomId].players.every(p => !p.connected)) {
                    delete rooms[roomId];
                    console.log(`Room ${roomId} deleted due to no connected players.`);
                } else if (!player.connected) {
                    rooms[roomId].players = rooms[roomId].players.filter(p => p.connected);
                    io.to(roomId).emit('error', `${player.pseudo} n'a pas pu se reconnecter. La partie est terminée.`);
                    delete rooms[roomId];
                    console.log(`Room ${roomId} ended due to prolonged disconnection.`);
                }
            }, RECONNECTION_TIMEOUT);
        }
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});