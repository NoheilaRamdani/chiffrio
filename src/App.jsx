import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001');

function App() {
    // États du jeu
    const [gameState, setGameState] = useState('lobby');
    const [pseudo, setPseudo] = useState('');
    const [roomId, setRoomId] = useState('');
    const [playerSecret, setPlayerSecret] = useState(['', '', '', '']);
    const [guess, setGuess] = useState(['', '', '', '']);
    const [history, setHistory] = useState([]);
    const [message, setMessage] = useState('Bienvenue dans Chiffrio ! 🎉');
    const [players, setPlayers] = useState({ player1: '', player2: '' });
    const [myPlayerId, setMyPlayerId] = useState(null);
    const [currentPlayer, setCurrentPlayer] = useState(1);
    const [isMyTurn, setIsMyTurn] = useState(false);
    const [gameSettings, setGameSettings] = useState({
        digits: 4,
        allowDuplicates: true,
        showMisplaced: true
    });
    const [imReady, setImReady] = useState(false);
    const [notepadEntries, setNotepadEntries] = useState([]);
    const [showNotepad, setShowNotepad] = useState(false);
    const [currentNotepadEntry, setCurrentNotepadEntry] = useState(['', '', '', '']);

    const secretInputs = useRef([]);
    const guessInputs = useRef([]);
    const notepadInputs = useRef([]);

    useEffect(() => {
        socket.offAny();

        socket.on('connect', () => {
            console.log('Connecté au serveur Socket.IO');
        });

        socket.on('roomCreated', (data) => {
            setRoomId(data.roomId);
            setMyPlayerId(1);
            setGameState('hosting');
            setMessage(`🎉 Salle créée ! Code: ${data.roomId}`);
            setPlayers(prev => ({ ...prev, player1: pseudo }));
            if (data.gameSettings) {
                setGameSettings(data.gameSettings);
                setPlayerSecret(Array(data.gameSettings.digits).fill(''));
                setGuess(Array(data.gameSettings.digits).fill(''));
                setCurrentNotepadEntry(Array(data.gameSettings.digits).fill(''));
            }
        });

        socket.on('roomJoined', (data) => {
            setRoomId(data.roomId);
            setPlayers(data.players);
            setMyPlayerId(2);
            setGameState('setup');
            setMessage('Connexion réussie ! Choisis ton nombre secret.');
            if (data.gameSettings) {
                setGameSettings(data.gameSettings);
                setPlayerSecret(Array(data.gameSettings.digits).fill(''));
                setGuess(Array(data.gameSettings.digits).fill(''));
                setCurrentNotepadEntry(Array(data.gameSettings.digits).fill(''));
            }
        });

        socket.on('error', (message) => {
            setMessage(message);
        });

        socket.on('playerJoined', (data) => {
            setPlayers(data.players);
            setMessage(`🎉 ${data.players.player2} a rejoint la partie !`);
            setGameState('setup');
            if (data.gameSettings) {
                setGameSettings(data.gameSettings);
                setPlayerSecret(Array(data.gameSettings.digits).fill(''));
                setGuess(Array(data.gameSettings.digits).fill(''));
                setCurrentNotepadEntry(Array(data.gameSettings.digits).fill(''));
            }
        });

        socket.on('gameStart', (data) => {
            setGameState('playing');
            setIsMyTurn(data.currentPlayer === myPlayerId);
            setCurrentPlayer(data.currentPlayer);
            setMessage(`C'est parti ! 🎮 C'est à ${getPlayerName(data.currentPlayer)} de jouer.`);
            if (data.gameSettings) {
                setGameSettings(data.gameSettings);
            }
        });

        socket.on('feedback', (data) => {
            setHistory(prevHistory => [...prevHistory, {
                guess: data.guess,
                player: data.player,
                wellPlaced: data.feedback.wellPlaced,
                misplaced: data.feedback.misplaced,
            }]);

            if (data.feedback.wellPlaced === gameSettings.digits) {
                setGameState('won');
                setMessage(`🎉 Bravo ${getPlayerName(data.player)} ! Tu as gagné !`);
            } else {
                setCurrentPlayer(data.player === 1 ? 2 : 1);
                setIsMyTurn(data.player !== myPlayerId);
                setGuess(Array(gameSettings.digits).fill(''));
                setMessage(`⏳ C'est au tour de ${getPlayerName(data.player === 1 ? 2 : 1)}.`);
            }
        });

        return () => {
            socket.off('connect');
            socket.off('roomCreated');
            socket.off('roomJoined');
            socket.off('error');
            socket.off('playerJoined');
            socket.off('gameStart');
            socket.off('feedback');
        };
    }, [myPlayerId, pseudo, players, gameSettings.digits]);


    const createRoom = () => {
        if (!pseudo.trim()) {
            setMessage('❌ Choisis un pseudo d\'abord !');
            return;
        }
        socket.emit('createRoom', { pseudo: pseudo.trim(), gameSettings });
    };

    const joinRoom = () => {
        if (!pseudo.trim() || !roomId.trim()) {
            setMessage('❌ Remplis tous les champs !');
            return;
        }
        socket.emit('joinRoom', { pseudo: pseudo.trim(), roomId: roomId.trim() });
    };

    const handleSecretInputChange = (e, index) => {
        const value = e.target.value.replace(/\D/g, '').slice(-1);
        const newSecret = [...playerSecret];
        newSecret[index] = value;
        setPlayerSecret(newSecret);

        if (value && index < gameSettings.digits - 1) {
            secretInputs.current[index + 1]?.focus();
        }
    };

    const handleGuessInputChange = (e, index) => {
        const value = e.target.value.replace(/\D/g, '').slice(-1);
        const newGuess = [...guess];
        newGuess[index] = value;
        setGuess(newGuess);

        if (value && index < gameSettings.digits - 1) {
            guessInputs.current[index + 1]?.focus();
        }
    };

    const handleNotepadInputChange = (e, index) => {
        const value = e.target.value.replace(/\D/g, '').slice(-1);
        const newEntry = [...currentNotepadEntry];
        newEntry[index] = value;
        setCurrentNotepadEntry(newEntry);

        if (value && index < gameSettings.digits - 1) {
            notepadInputs.current[index + 1]?.focus();
        }
    };

    const addNotepadEntry = () => {
        const entry = currentNotepadEntry.join('');
        if (entry.length !== gameSettings.digits) {
            return;
        }

        const newEntry = {
            id: Date.now(),
            combination: entry,
            notes: ''
        };

        setNotepadEntries(prev => [...prev, newEntry]);
        setCurrentNotepadEntry(Array(gameSettings.digits).fill(''));
        notepadInputs.current[0]?.focus();
    };

    const updateNotepadEntry = (id, notes) => {
        setNotepadEntries(prev => prev.map(entry =>
            entry.id === id ? { ...entry, notes } : entry
        ));
    };

    const deleteNotepadEntry = (id) => {
        setNotepadEntries(prev => prev.filter(entry => entry.id !== id));
    };

    const clearNotepad = () => {
        setCurrentNotepadEntry(Array(gameSettings.digits).fill(''));
        notepadInputs.current[0]?.focus();
    };

    const clearAllNotepad = () => {
        setNotepadEntries([]);
        setCurrentNotepadEntry(Array(gameSettings.digits).fill(''));
    };

    const handleSecretSubmit = () => {
        const secret = playerSecret.join('');
        if (secret.length !== gameSettings.digits || !/^\d+$/.test(secret)) {
            setMessage(`❌ Entre ${gameSettings.digits} chiffres valides !`);
            return;
        }

        if (!gameSettings.allowDuplicates && new Set(secret.split('')).size !== secret.length) {
            setMessage('❌ Pas de chiffres en double autorisés !');
            return;
        }

        setImReady(true);
        socket.emit('setSecret', { secret, player: myPlayerId });
        setMessage('✅ Nombre secret enregistré ! En attente de l\'autre joueur...');
    };

    const handleGuessSubmit = () => {
        if (!isMyTurn) {
            setMessage('⏳ Pas ton tour !');
            return;
        }

        const guessStr = guess.join('');
        if (guessStr.length !== gameSettings.digits || !/^\d+$/.test(guessStr)) {
            setMessage(`❌ Entre ${gameSettings.digits} chiffres valides !`);
            return;
        }

        if (!gameSettings.allowDuplicates && new Set(guessStr.split('')).size !== guessStr.length) {
            setMessage('❌ Pas de chiffres en double autorisés !');
            return;
        }

        socket.emit('submitGuess', { guess: guessStr, player: myPlayerId });
        setMessage('⏳ En attente de la réponse...');
    };

    const handleReset = () => {
        socket.disconnect();
        window.location.reload();
    };

    const copyRoomLink = () => {
        const link = `${window.location.origin}?room=${roomId}`;
        navigator.clipboard.writeText(link);
        setMessage('📋 Lien copié ! Envoie-le à ton ami !');
        setTimeout(() => {
            if (gameState === 'hosting') {
                setMessage(`🎉 Salle créée ! Code: ${roomId}`);
            }
        }, 2000);
    };

    const inputFields = (value, onChange, disabled, inputRef, size = "large") => {
        const sizeClasses = size === "small"
            ? "w-8 h-8 text-sm"
            : size === "medium"
                ? "w-10 h-10 text-lg"
                : "w-14 h-14 text-2xl";

        return (
            <div className="flex justify-center gap-1">
                {Array.from({ length: gameSettings.digits }, (_, i) => (
                    <input
                        key={i}
                        ref={el => inputRef.current[i] = el}
                        type="text"
                        maxLength={1}
                        value={value[i] || ''}
                        onChange={(e) => onChange(e, i)}
                        onPaste={(e) => { e.preventDefault(); }}
                        disabled={disabled}
                        className={`${sizeClasses} border-2 border-slate-300 rounded-lg font-bold text-center bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 text-slate-700 transition-all duration-200 ${disabled ? 'bg-gray-100' : ''}`}
                    />
                ))}
            </div>
        );
    };

    const getPlayerName = (playerId) => {
        return playerId === 1 ? players.player1 : players.player2;
    };

    const getOpponentName = () => {
        return myPlayerId === 1 ? players.player2 : players.player1;
    };


    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-100 font-sans">
            {/* Header avec design amélioré */}
            <header className="bg-white/80 backdrop-blur-md shadow-lg border-b border-slate-200 p-4 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                                <span className="text-white font-bold text-xl">🔢</span>
                            </div>
                            <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                Chiffrio
                            </h1>
                        </div>
                        {roomId && (
                            <div className="bg-gradient-to-r from-blue-100 to-purple-100 px-4 py-2 rounded-full border border-blue-200">
                                <span className="text-sm font-semibold text-blue-700">Room: {roomId}</span>
                            </div>
                        )}
                    </div>
                    {(gameState === 'playing' || gameState === 'setup') && (
                        <div className="flex items-center gap-4">
                            <div className="text-right bg-slate-50 px-3 py-2 rounded-lg border">
                                <div className="text-xs text-slate-500 font-medium">Ton secret</div>
                                <div className="text-lg font-mono font-bold text-slate-800">
                                    {playerSecret.join('') || '----'}
                                </div>
                            </div>
                            <button
                                onClick={() => setShowNotepad(!showNotepad)}
                                className="bg-gradient-to-r from-yellow-100 to-amber-100 hover:from-yellow-200 hover:to-amber-200 text-yellow-700 px-4 py-2 rounded-xl font-semibold transition-all duration-200 border border-yellow-200 shadow-sm"
                            >
                                📝 {showNotepad ? 'Fermer' : 'Bloc-notes'}
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* Barre de message avec design amélioré */}
            <div className="bg-gradient-to-r from-blue-500 via-purple-600 to-pink-500 text-white p-4 shadow-inner">
                <div className="max-w-7xl mx-auto text-center">
                    <p className="font-semibold text-lg">{message}</p>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-4">
                {/* Bloc-notes amélioré */}
                {showNotepad && gameState === 'playing' && (
                    <div className="fixed inset-0 bg-black/50 z-50 md:relative md:bg-transparent md:z-auto md:mb-6">
                        <div className="absolute inset-y-0 right-0 w-full md:w-96 bg-white rounded-l-xl md:rounded-xl shadow-2xl border border-yellow-200 transition-transform transform translate-x-0 overflow-y-auto">
                            <div className="p-4">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2">
                                        📝 <span>Bloc-notes</span>
                                    </h3>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={clearAllNotepad}
                                            className="text-xs bg-red-100 hover:bg-red-200 text-red-600 px-2 py-1 rounded-md font-medium transition-colors"
                                        >
                                            Tout effacer
                                        </button>
                                        <button
                                            onClick={() => setShowNotepad(false)}
                                            className="md:hidden text-xl text-slate-500 hover:text-slate-800 w-6 h-6 flex items-center justify-center"
                                        >
                                            &times;
                                        </button>
                                    </div>
                                </div>

                                {/* Nouvelle entrée */}
                                <div className="bg-slate-50 rounded-lg p-3 mb-4 border border-slate-200">
                                    <div className="mb-2">
                                        {inputFields(currentNotepadEntry, handleNotepadInputChange, false, notepadInputs, 'medium')}
                                    </div>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={addNotepadEntry}
                                            disabled={currentNotepadEntry.join('').length !== gameSettings.digits}
                                            className="flex-1 text-xs bg-green-100 hover:bg-green-200 disabled:bg-gray-100 text-green-700 disabled:text-gray-400 px-2 py-1.5 rounded font-medium transition-colors"
                                        >
                                            + Ajouter
                                        </button>
                                        <button
                                            onClick={clearNotepad}
                                            className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-2 py-1.5 rounded font-medium transition-colors"
                                        >
                                            Effacer
                                        </button>
                                    </div>
                                </div>

                                {/* Liste des entrées */}
                                <div className="space-y-3 max-h-96 overflow-y-auto">
                                    {notepadEntries.length === 0 ? (
                                        <p className="text-sm text-slate-500 italic text-center py-4">
                                            Aucune combinaison testée
                                        </p>
                                    ) : (
                                        notepadEntries.map((entry) => (
                                            <div key={entry.id} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                                                <div className="flex items-center justify-between mb-2">
                                                    <span className="font-mono text-lg font-bold text-slate-800">
                                                        {entry.combination}
                                                    </span>
                                                    <button
                                                        onClick={() => deleteNotepadEntry(entry.id)}
                                                        className="text-red-500 hover:text-red-700 text-sm w-5 h-5 flex items-center justify-center"
                                                    >
                                                        &times;
                                                    </button>
                                                </div>
                                                <input
                                                    type="text"
                                                    value={entry.notes}
                                                    onChange={(e) => updateNotepadEntry(entry.id, e.target.value)}
                                                    placeholder="Notes..."
                                                    className="w-full text-xs p-2 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-400"
                                                />
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {gameState === 'lobby' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                        {/* Créer une partie - Design amélioré */}
                        <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/20 hover:shadow-2xl transition-all duration-300">
                            <div className="text-center mb-8">
                                <div className="w-20 h-20 bg-gradient-to-br from-blue-400 to-blue-600 rounded-2xl flex items-center justify-center text-3xl text-white mx-auto mb-6 shadow-lg">
                                    👑
                                </div>
                                <h2 className="text-3xl font-bold text-slate-800 mb-3">Créer une partie</h2>
                                <p className="text-slate-600 text-lg">Deviens l'hôte et invite tes amis</p>
                            </div>
                            <div className="space-y-6">
                                <input
                                    type="text"
                                    value={pseudo}
                                    onChange={(e) => setPseudo(e.target.value)}
                                    placeholder="Ton pseudo..."
                                    className="w-full p-4 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 text-lg font-medium transition-all"
                                />
                                <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl p-6 border border-slate-200">
                                    <h3 className="font-bold text-slate-800 mb-4 text-lg flex items-center gap-2">
                                        ⚙️ <span>Règles du jeu</span>
                                    </h3>
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <span className="text-slate-700 font-medium">Nombre de chiffres</span>
                                            <select
                                                value={gameSettings.digits}
                                                onChange={(e) => {
                                                    const digits = parseInt(e.target.value);
                                                    setGameSettings(prev => ({ ...prev, digits }));
                                                    setPlayerSecret(Array(digits).fill(''));
                                                    setGuess(Array(digits).fill(''));
                                                    setCurrentNotepadEntry(Array(digits).fill(''));
                                                }}
                                                className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm font-semibold"
                                            >
                                                <option value={3}>3 chiffres</option>
                                                <option value={4}>4 chiffres</option>
                                                <option value={5}>5 chiffres</option>
                                            </select>
                                        </div>
                                        <label className="flex items-center justify-between bg-white rounded-lg p-3 border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer">
                                            <span className="text-slate-700 font-medium">Chiffres en double autorisés</span>
                                            <input
                                                type="checkbox"
                                                checked={gameSettings.allowDuplicates}
                                                onChange={(e) => setGameSettings(prev => ({ ...prev, allowDuplicates: e.target.checked }))}
                                                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                                            />
                                        </label>
                                        <label className="flex items-center justify-between bg-white rounded-lg p-3 border border-slate-200 hover:bg-slate-50 transition-colors cursor-pointer">
                                            <span className="text-slate-700 font-medium">Afficher les mal placés</span>
                                            <input
                                                type="checkbox"
                                                checked={gameSettings.showMisplaced}
                                                onChange={(e) => setGameSettings(prev => ({ ...prev, showMisplaced: e.target.checked }))}
                                                className="w-5 h-5 rounded text-blue-600 focus:ring-blue-500"
                                            />
                                        </label>
                                    </div>
                                </div>
                                <button
                                    onClick={createRoom}
                                    className="w-full bg-gradient-to-r from-blue-500 to-blue-600 text-white p-4 rounded-xl text-xl font-bold hover:from-blue-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                                >
                                    🚀 Créer la partie
                                </button>
                            </div>
                        </div>

                        {/* Rejoindre une partie - Design amélioré */}
                        <div className="bg-white/70 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/20 hover:shadow-2xl transition-all duration-300">
                            <div className="text-center mb-8">
                                <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-2xl flex items-center justify-center text-3xl text-white mx-auto mb-6 shadow-lg">
                                    🎮
                                </div>
                                <h2 className="text-3xl font-bold text-slate-800 mb-3">Rejoindre une partie</h2>
                                <p className="text-slate-600 text-lg">Entre le code d'invitation</p>
                            </div>
                            <div className="space-y-6">
                                <input
                                    type="text"
                                    value={pseudo}
                                    onChange={(e) => setPseudo(e.target.value)}
                                    placeholder="Ton pseudo..."
                                    className="w-full p-4 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400 text-lg font-medium transition-all"
                                />
                                <input
                                    type="text"
                                    value={roomId}
                                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                                    placeholder="Code de la salle..."
                                    className="w-full p-4 border-2 border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-green-400 focus:border-green-400 text-center font-mono text-xl font-bold tracking-wider transition-all"
                                    maxLength={6}
                                />
                                <button
                                    onClick={joinRoom}
                                    className="w-full bg-gradient-to-r from-green-500 to-green-600 text-white p-4 rounded-xl text-xl font-bold hover:from-green-600 hover:to-green-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                                >
                                    🎯 Rejoindre
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {gameState === 'hosting' && (
                    <div className="flex justify-center mt-12">
                        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-12 shadow-2xl text-center max-w-md border border-white/20">
                            <div className="text-8xl mb-6 animate-pulse">⏳</div>
                            <h2 className="text-3xl font-bold text-slate-800 mb-6">Salle créée !</h2>
                            <div className="bg-gradient-to-br from-green-100 to-emerald-100 rounded-2xl p-6 mb-8 border border-green-200">
                                <p className="text-sm text-green-700 mb-2 font-semibold">Code de la salle</p>
                                <p className="text-4xl font-bold text-green-800 tracking-wider font-mono">{roomId}</p>
                            </div>
                            <button
                                onClick={copyRoomLink}
                                className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white px-8 py-4 rounded-xl font-bold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                            >
                                📋 Copier le lien
                            </button>
                        </div>
                    </div>
                )}

                {gameState === 'setup' && (
                    <div className="max-w-3xl mx-auto mt-8">
                        <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-12 shadow-2xl text-center border border-white/20">
                            <h2 className="text-4xl font-bold text-slate-800 mb-4">🤫 Choisis ton nombre secret</h2>
                            <p className="text-slate-600 mb-2 text-lg">
                                {getOpponentName() ? `${getOpponentName()} attend ta décision...` : 'En attente de l\'autre joueur...'}
                            </p>

                            {/* Affichage des règles du jeu */}
                            <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-4 mb-8 border border-blue-100">
                                <div className="flex flex-wrap justify-center gap-4 text-sm">
                                    <span className="bg-white px-3 py-1 rounded-full border border-blue-200 text-blue-700 font-semibold">
                                        {gameSettings.digits} chiffres
                                    </span>
                                    <span className={`px-3 py-1 rounded-full border font-semibold ${
                                        gameSettings.allowDuplicates
                                            ? 'bg-green-100 border-green-200 text-green-700'
                                            : 'bg-red-100 border-red-200 text-red-700'
                                    }`}>
                                        {gameSettings.allowDuplicates ? '✓' : '✗'} Doublons
                                    </span>
                                    <span className={`px-3 py-1 rounded-full border font-semibold ${
                                        gameSettings.showMisplaced
                                            ? 'bg-green-100 border-green-200 text-green-700'
                                            : 'bg-red-100 border-red-200 text-red-700'
                                    }`}>
                                        {gameSettings.showMisplaced ? '✓' : '✗'} Mal placés
                                    </span>
                                </div>
                            </div>

                            <div className="mb-10">
                                {inputFields(playerSecret, handleSecretInputChange, false, secretInputs)}
                            </div>
                            <button
                                onClick={handleSecretSubmit}
                                disabled={imReady}
                                className={`px-12 py-4 rounded-xl text-xl font-bold transition-all duration-200 shadow-lg ${
                                    imReady
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700 hover:shadow-xl transform hover:-translate-y-1'
                                }`}
                            >
                                {imReady ? '✅ Nombre validé' : '🔒 Valider mon secret'}
                            </button>
                            {imReady && (
                                <p className="text-sm text-slate-500 mt-6 animate-pulse">
                                    En attente de {getOpponentName()}...
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {gameState === 'playing' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
                        {/* Section principale de jeu */}
                        <div className="lg:col-span-2 order-2 lg:order-1">
                            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/20 mb-6">
                                <div className="text-center mb-8">
                                    <h2 className="text-2xl font-bold text-slate-800 mb-4">
                                        {isMyTurn ? `🎯 À ton tour !` : `⏳ Tour de ${getOpponentName()}`}
                                    </h2>

                                    {/* Indicateur des joueurs */}
                                    <div className="flex justify-center items-center gap-6 mb-6">
                                        <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                                            currentPlayer === 1
                                                ? 'bg-gradient-to-r from-blue-100 to-blue-200 border-2 border-blue-400 shadow-md'
                                                : 'bg-slate-100 border border-slate-300'
                                        }`}>
                                            <div className={`w-3 h-3 rounded-full ${
                                                currentPlayer === 1 ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'
                                            }`}></div>
                                            <span className={`font-semibold ${
                                                currentPlayer === 1 ? 'text-blue-700' : 'text-slate-600'
                                            }`}>{players.player1}</span>
                                        </div>
                                        <span className="text-slate-400 font-bold">VS</span>
                                        <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                                            currentPlayer === 2
                                                ? 'bg-gradient-to-r from-green-100 to-green-200 border-2 border-green-400 shadow-md'
                                                : 'bg-slate-100 border border-slate-300'
                                        }`}>
                                            <div className={`w-3 h-3 rounded-full ${
                                                currentPlayer === 2 ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
                                            }`}></div>
                                            <span className={`font-semibold ${
                                                currentPlayer === 2 ? 'text-green-700' : 'text-slate-600'
                                            }`}>{players.player2}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="mb-8">
                                    {inputFields(guess, handleGuessInputChange, !isMyTurn, guessInputs)}
                                </div>

                                <button
                                    onClick={handleGuessSubmit}
                                    disabled={!isMyTurn}
                                    className={`w-full p-4 rounded-xl text-xl font-bold transition-all duration-200 shadow-lg ${
                                        !isMyTurn
                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                            : 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 hover:shadow-xl transform hover:-translate-y-1'
                                    }`}
                                >
                                    {isMyTurn ? '🚀 Proposer ma combinaison' : '⏳ Pas ton tour'}
                                </button>
                            </div>

                            {/* Historique personnel */}
                            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-8 shadow-xl border border-white/20">
                                <h3 className="text-2xl font-bold text-slate-800 mb-6 text-center flex items-center justify-center gap-2">
                                    📜 <span>Mes propositions</span>
                                </h3>
                                {history.filter(h => h.player === myPlayerId).length === 0 ? (
                                    <div className="text-center py-12">
                                        <div className="text-6xl mb-4 opacity-50">🤔</div>
                                        <p className="text-slate-500 text-lg">Aucune proposition pour l'instant...</p>
                                        <p className="text-slate-400 text-sm">Lance-toi et fais ta première tentative !</p>
                                    </div>
                                ) : (
                                    <div className="space-y-4 max-h-80 overflow-y-auto">
                                        {history.filter(h => h.player === myPlayerId).map((entry, index) => (
                                            <div
                                                key={index}
                                                className="bg-gradient-to-r from-blue-50 to-indigo-50 p-6 rounded-2xl shadow-sm border-l-4 border-blue-400 hover:shadow-md transition-shadow"
                                            >
                                                <div className="flex justify-between items-center">
                                                    <div className="flex items-center gap-3">
                                                        <span className="font-semibold text-slate-700">{pseudo}</span>
                                                        <span className="font-mono text-2xl font-bold text-slate-800 bg-white px-3 py-1 rounded-lg shadow-sm">
                                                            {entry.guess}
                                                        </span>
                                                    </div>
                                                    <div className="flex gap-3">
                                                        <span className="bg-green-200 text-green-800 px-3 py-2 rounded-lg text-sm font-bold shadow-sm">
                                                            ✅ {entry.wellPlaced}
                                                        </span>
                                                        {gameSettings.showMisplaced && (
                                                            <span className="bg-orange-200 text-orange-800 px-3 py-2 rounded-lg text-sm font-bold shadow-sm">
                                                                🔄 {entry.misplaced}
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Historique de l'adversaire */}
                        <div className="order-1 lg:order-2">
                            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-xl border border-white/20 sticky top-32">
                                <h3 className="text-xl font-bold text-slate-800 mb-6 text-center flex items-center justify-center gap-2">
                                    🔍 <span>{getOpponentName() || 'Adversaire'}</span>
                                </h3>
                                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                                    {history.filter(h => h.player !== myPlayerId).length === 0 ? (
                                        <div className="text-center py-8">
                                            <div className="text-4xl mb-3 opacity-50">👻</div>
                                            <p className="text-sm text-slate-500 italic">Aucune proposition encore...</p>
                                        </div>
                                    ) : (
                                        history.filter(h => h.player !== myPlayerId).map((entry, index) => (
                                            <div key={index} className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-2xl p-4 border-l-4 border-purple-400 shadow-sm hover:shadow-md transition-shadow">
                                                <div className="flex justify-between items-center">
                                                    <span className="font-mono text-xl font-bold text-slate-800 bg-white px-3 py-1 rounded-lg shadow-sm">
                                                        {entry.guess}
                                                    </span>
                                                    <div className="flex gap-2 text-xs">
                                                        <span className="bg-green-300 text-green-800 px-2 py-1 rounded-lg font-bold">
                                                            {entry.wellPlaced}✅
                                                        </span>
                                                        {gameSettings.showMisplaced && (
                                                            <span className="bg-orange-300 text-orange-800 px-2 py-1 rounded-lg font-bold">
                                                                {entry.misplaced}🔄
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {gameState === 'won' && (
                    <div className="flex justify-center mt-12">
                        <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-16 shadow-2xl text-center max-w-lg border border-white/20">
                            <div className="text-9xl mb-8 animate-bounce">🏆</div>
                            <h2 className="text-4xl font-bold bg-gradient-to-r from-yellow-500 to-orange-500 bg-clip-text text-transparent mb-8">
                                Partie terminée !
                            </h2>
                            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-2xl p-6 mb-8 border border-yellow-200">
                                <p className="text-slate-700 text-lg">Félicitations pour cette belle partie ! 🎉</p>
                            </div>
                            <button
                                onClick={handleReset}
                                className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-12 py-4 rounded-2xl text-2xl font-bold hover:from-yellow-600 hover:to-orange-600 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-1"
                            >
                                🔄 Nouvelle partie
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;