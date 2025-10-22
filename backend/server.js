const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

app.use(cors({
    origin: [
        'https://chiffrio-frontend.onrender.com',
        'https://chiffrio.onrender.com',
        'http://localhost:5173'
    ],
    methods: ['GET', 'POST'],
    credentials: true
}));

const io = new Server(server, {
    cors: {
        origin: [
            'https://chiffrio-frontend.onrender.com',
            'https://chiffrio.onrender.com',
            'http://localhost:5173'
        ],
        methods: ['GET', 'POST'],
        credentials: true
    },
    pingTimeout: 60000,
    pingInterval: 25000
});

const rooms = {};
const playerSockets = new Map();

const generateRoomId = () => {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    for (let i = 0; i < 6; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    if (rooms[result]) {
        return generateRoomId();
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
    if (!number || typeof number !== 'string') {
        return { valid: false, error: 'Nombre invalide' };
    }
    if (number.length !== gameSettings.digits) {
        return { valid: false, error: `Entre exactement ${gameSettings.digits} chiffres !` };
    }
    if (!/^\d+$/.test(number)) {
        return { valid: false, error: 'Seuls les chiffres sont autorisés !' };
    }
    if (!gameSettings.allowDuplicates && new Set(number.split('')).size !== number.length) {
        return { valid: false, error: 'Pas de chiffres en double autorisés !' };
    }
    return { valid: true };
};

const validatePseudo = (pseudo) => {
    if (!pseudo || typeof pseudo !== 'string') {
        return { valid: false, error: 'Pseudo invalide' };
    }
    const trimmed = pseudo.trim();
    if (trimmed.length < 2) {
        return { valid: false, error: 'Pseudo trop court (minimum 2 caractères)' };
    }
    if (trimmed.length > 20) {
        return { valid: false, error: 'Pseudo trop long (maximum 20 caractères)' };
    }
    return { valid: true, pseudo: trimmed };
};

const validateGameSettings = (settings) => {
    if (!settings || typeof settings !== 'object') {
        return false;
    }
    const validDigits = [3, 4, 5];
    if (!validDigits.includes(settings.digits)) {
        return false;
    }
    if (typeof settings.allowDuplicates !== 'boolean' ||
        typeof settings.showMisplaced !== 'boolean' ||
        typeof settings.showWellPlacedDigits !== 'boolean' ||
        typeof settings.showMisplacedDigits !== 'boolean') {
        return false;
    }
    return true;
};

io.on('connection', (socket) => {
    console.log('✅ Nouvelle connexion:', socket.id);

    socket.on('createRoom', ({ pseudo, gameSettings }) => {
        try {
            const pseudoValidation = validatePseudo(pseudo);
            if (!pseudoValidation.valid) return socket.emit('error', pseudoValidation.error);
            if (!validateGameSettings(gameSettings)) return socket.emit('error', 'Paramètres de jeu invalides');

            const roomId = generateRoomId();
            const playerUuid = uuidv4();
            rooms[roomId] = {
                players: [{
                    socketId: socket.id,
                    uuid: playerUuid,
                    pseudo: pseudoValidation.pseudo,
                    secret: null,
                    connected: true,
                    playerId: 1
                }],
                secrets: {},
                gameSettings: { ...gameSettings },
                history: [],
                currentPlayer: null,
                gameState: 'hosting',
                createdAt: Date.now()
            };

            playerSockets.set(socket.id, { roomId, playerId: 1, uuid: playerUuid });
            socket.join(roomId);
            socket.emit('roomCreated', { roomId, gameSettings: rooms[roomId].gameSettings, uuid: playerUuid });
            console.log(`✅ Salle ${roomId} créée par ${pseudoValidation.pseudo}`);
        } catch (e) {
            console.error("Erreur dans createRoom:", e);
            socket.emit('error', "Une erreur interne est survenue.");
        }
    });

    socket.on('joinRoom', ({ pseudo, roomId }) => {
        try {
            const pseudoValidation = validatePseudo(pseudo);
            if (!pseudoValidation.valid) return socket.emit('error', pseudoValidation.error);
            if (!roomId || typeof roomId !== 'string' || roomId.length !== 6) return socket.emit('error', 'Code de salle invalide');

            const room = rooms[roomId.trim().toUpperCase()];
            if (!room) return socket.emit('error', 'Cette salle n\'existe pas.');
            if (room.players.length >= 2) return socket.emit('error', 'Cette salle est déjà pleine.');

            const playerUuid = uuidv4();
            room.players.push({
                socketId: socket.id,
                uuid: playerUuid,
                pseudo: pseudoValidation.pseudo,
                secret: null,
                connected: true,
                playerId: 2
            });
            room.gameState = 'setup';

            playerSockets.set(socket.id, { roomId, playerId: 2, uuid: playerUuid });
            socket.join(roomId);

            const playersData = {
                player1: room.players[0].pseudo,
                player2: room.players[1].pseudo
            };

            socket.emit('roomJoined', { roomId, players: playersData, gameSettings: room.gameSettings, uuid: playerUuid });
            io.to(room.players[0].socketId).emit('playerJoined', { players: playersData, gameSettings: room.gameSettings });
            console.log(`✅ ${pseudoValidation.pseudo} a rejoint la salle ${roomId}`);
        } catch (e) {
            console.error("Erreur dans joinRoom:", e);
            socket.emit('error', "Une erreur interne est survenue.");
        }
    });

    socket.on('reconnectToRoom', ({ pseudo, roomId, uuid }) => {
        try {
            const room = rooms[roomId.toUpperCase()];
            if (!room) {
                socket.emit('error', 'Salle non trouvée ou expirée');
                return;
            }

            const player = room.players.find(p => p.uuid === uuid && p.pseudo === pseudo);
            if (!player) {
                socket.emit('error', 'Joueur non reconnu dans cette salle');
                return;
            }

            player.socketId = socket.id;
            player.connected = true;
            playerSockets.set(socket.id, { roomId, playerId: player.playerId, uuid });
            socket.join(roomId);

            socket.emit('reconnected', {
                roomId,
                players: { player1: room.players[0].pseudo, player2: room.players[1]?.pseudo },
                gameState: room.gameState,
                gameSettings: room.gameSettings,
                history: room.history || [],
                myPlayerId: player.playerId,
                mySecret: player.secret
            });

            const otherPlayer = room.players.find(p => p.uuid !== uuid);
            if (otherPlayer && otherPlayer.connected) {
                io.to(otherPlayer.socketId).emit('playerReconnected', { pseudo });
            }
            console.log(`✅ ${pseudo} reconnecté à ${roomId}`);
        } catch (e) {
            console.error("Erreur dans reconnectToRoom:", e);
            socket.emit('error', "Impossible de reconnecter à cette salle");
        }
    });

    socket.on('setSecret', ({ secret, player }) => {
        try {
            const playerInfo = playerSockets.get(socket.id);
            if (!playerInfo) return socket.emit('error', 'Joueur non trouvé');

            const { roomId, playerId } = playerInfo;
            const room = rooms[roomId];
            if (!room) return socket.emit('error', 'Salle non trouvée');

            const validation = validateNumber(secret, room.gameSettings);
            if (!validation.valid) return socket.emit('validationError', validation.error);

            const playerInRoom = room.players.find(p => p.socketId === socket.id);
            if (!playerInRoom) return socket.emit('error', 'Joueur non trouvé dans la salle');

            playerInRoom.secret = secret;
            room.secrets[playerId] = secret;

            io.to(roomId).emit('secretSet', { player });
            console.log(`🔒 Secret défini pour joueur ${player} dans salle ${roomId}`);

            if (room.players.length === 2 && room.players.every(p => p.secret !== null)) {
                room.gameState = 'playing';
                room.currentPlayer = Math.random() < 0.5 ? 1 : 2;
                io.to(roomId).emit('gameStart', { currentPlayer: room.currentPlayer, gameSettings: room.gameSettings });
                console.log(`🎮 Jeu démarré dans salle ${roomId}. Joueur ${room.currentPlayer} commence.`);
            }
        } catch (e) {
            console.error("Erreur dans setSecret:", e);
            socket.emit('error', "Une erreur interne est survenue.");
        }
    });

    socket.on('submitGuess', ({ guess, player }) => {
        try {
            const playerInfo = playerSockets.get(socket.id);
            if (!playerInfo) return socket.emit('error', 'Joueur non trouvé');

            const {roomId, playerId} = playerInfo;
            const room = rooms[roomId];
            if (!room) return socket.emit('error', 'Salle non trouvée');
            if (playerId !== room.currentPlayer) return socket.emit('error', 'Ce n\'est pas votre tour de jouer.');

            const validation = validateNumber(guess, room.gameSettings);
            if (!validation.valid) return socket.emit('validationError', validation.error);

            const opponent = room.players.find(p => p.playerId !== playerId);
            if (!opponent) return socket.emit('error', 'Adversaire non trouvé');

            const opponentSecret = room.secrets[opponent.playerId];
            if (!opponentSecret) return socket.emit('error', 'Secret de l\'adversaire non défini, l\'adversaire doit se reconnecter.');

            const feedback = checkGuess(opponentSecret, guess, room.gameSettings);

            const newEntry = {
                guess,
                player,
                feedback: {
                    wellPlaced: feedback.wellPlaced,
                    misplaced: feedback.misplaced,
                    wellPlacedDigits: feedback.wellPlacedDigits || [],
                    misplacedDigits: feedback.misplacedDigits || []
                },
                timestamp: Date.now()
            };
            room.history.push(newEntry);

            io.to(roomId).emit('feedback', newEntry);
            console.log(`📊 Feedback envoyé: ${feedback.wellPlaced} bien placés, ${feedback.misplaced} mal placés`);

            if (feedback.wellPlaced === room.gameSettings.digits) {
                room.gameState = 'won';

                // Envoyer les bonnes infos à chaque joueur
                const winner = room.players.find(p => p.playerId === playerId);
                const loser = room.players.find(p => p.playerId !== playerId);

                // Au gagnant : son secret + le secret qu'il a trouvé
                io.to(winner.socketId).emit('gameWon', {
                    winner: playerId,
                    mySecret: room.secrets[playerId],
                    opponentSecret: opponentSecret,
                    fullHistory: room.history
                });

                // Au perdant : son secret + le secret du gagnant
                io.to(loser.socketId).emit('gameWon', {
                    winner: playerId,
                    mySecret: room.secrets[loser.playerId],
                    opponentSecret: room.secrets[playerId],
                    fullHistory: room.history
                });

                console.log(`🏆 Joueur ${playerId} a gagné dans la salle ${roomId}`);
            } else {
                room.currentPlayer = room.currentPlayer === 1 ? 2 : 1;
            }
        } catch (e) {
            console.error("Erreur dans submitGuess:", e);
            socket.emit('error', "Une erreur interne est survenue. Réessayez.");
        }
    });

    socket.on('updateSettings', ({ roomId, gameSettings }) => {
        try {
            const room = rooms[roomId];
            if (!room) return socket.emit('error', 'Salle non trouvée.');

            const playerInfo = playerSockets.get(socket.id);
            if (!playerInfo || playerInfo.playerId !== 1) return socket.emit('error', 'Seul l\'hôte peut modifier les règles.');
            if (!validateGameSettings(gameSettings)) return socket.emit('error', 'Paramètres de jeu invalides');

            room.gameSettings = { ...gameSettings };
            room.players.forEach(player => {
                player.secret = null;
            });
            room.secrets = {};
            room.history = [];
            room.gameState = 'setup';
            room.currentPlayer = null;

            io.to(roomId).emit('settingsUpdated', room.gameSettings);
            console.log(`⚙️ Paramètres mis à jour dans salle ${roomId}`);
        } catch (e) {
            console.error("Erreur dans updateSettings:", e);
            socket.emit('error', "Une erreur interne est survenue.");
        }
    });

    socket.on('restartGame', ({ roomId }) => {
        try {
            const room = rooms[roomId];
            if (!room) return socket.emit('error', 'Salle non trouvée.');

            room.gameState = 'setup';
            room.history = [];
            room.currentPlayer = null;
            room.players.forEach(player => {
                player.secret = null;
            });
            room.secrets = {};

            io.to(roomId).emit('gameRestarted');
            console.log(`🔄 Salle ${roomId} relancée.`);
        } catch (e) {
            console.error("Erreur dans restartGame:", e);
            socket.emit('error', "Une erreur interne est survenue.");
        }
    });

    socket.on('endGameAndNewRoom', ({ pseudo, gameSettings }) => {
        try {
            const playerInfo = playerSockets.get(socket.id);
            if (!playerInfo) return socket.emit('error', 'Joueur non trouvé');
            if (playerInfo.playerId !== 1) return socket.emit('error', 'Seul l\'hôte peut créer une nouvelle partie');

            const oldRoomId = playerInfo.roomId;
            const oldRoom = rooms[oldRoomId];
            if (oldRoom) {
                io.to(oldRoomId).emit('gameEndedByHost');
                delete rooms[oldRoomId];
                console.log(`🗑️ Salle ${oldRoomId} supprimée`);
            }

            const pseudoValidation = validatePseudo(pseudo);
            if (!pseudoValidation.valid) return socket.emit('error', pseudoValidation.error);
            if (!validateGameSettings(gameSettings)) return socket.emit('error', 'Paramètres de jeu invalides');

            const roomId = generateRoomId();
            const playerUuid = uuidv4();
            rooms[roomId] = {
                players: [{
                    socketId: socket.id,
                    uuid: playerUuid,
                    pseudo: pseudoValidation.pseudo,
                    secret: null,
                    connected: true,
                    playerId: 1
                }],
                secrets: {},
                gameSettings: { ...gameSettings },
                history: [],
                currentPlayer: null,
                gameState: 'hosting',
                createdAt: Date.now()
            };

            playerSockets.set(socket.id, { roomId, playerId: 1, uuid: playerUuid });
            socket.join(roomId);
            socket.emit('newRoomCreatedAfterEnd', { roomId, gameSettings: rooms[roomId].gameSettings, uuid: playerUuid });
            console.log(`✅ Nouvelle salle ${roomId} créée par ${pseudoValidation.pseudo}`);
        } catch (e) {
            console.error("Erreur dans endGameAndNewRoom:", e);
            socket.emit('error', "Une erreur interne est survenue.");
        }
    });

    socket.on('disconnect', () => {
        console.log('❌ Déconnexion:', socket.id);

        const playerInfo = playerSockets.get(socket.id);
        if (!playerInfo) return;

        const { roomId } = playerInfo;
        const room = rooms[roomId];
        if (!room) return;

        const player = room.players.find(p => p.socketId === socket.id);
        if (player) {
            player.connected = false;
            console.log(`⚠️ Joueur ${player.pseudo} déconnecté de la salle ${roomId}`);

            const otherPlayer = room.players.find(p => p.socketId !== socket.id);
            if (otherPlayer && otherPlayer.connected) {
                io.to(otherPlayer.socketId).emit('playerDisconnected', { pseudo: player.pseudo });
            }

            setTimeout(() => {
                const currentRoom = rooms[roomId];
                if (!currentRoom) return;

                if (currentRoom.players.every(p => !p.connected)) {
                    delete rooms[roomId];
                    console.log(`🗑️ Salle ${roomId} supprimée (aucun joueur connecté)`);
                }
            }, 300000);
        }

        playerSockets.delete(socket.id);
    });

    socket.on('error', (error) => {
        console.error('Socket error:', error);
    });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Serveur démarré sur le port ${PORT}`);
});