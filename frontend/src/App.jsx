import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001');
const BackgroundShapes = () => {
    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-[-1]">
            <svg className="absolute top-20 left-1/4 w-32 h-32 opacity-15" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="1" className="text-indigo-400"/>
            </svg>
            <svg className="absolute bottom-40 right-1/3 w-24 h-24 opacity-15" viewBox="0 0 100 100">
                <polygon points="50,10 90,90 10,90" fill="none" stroke="currentColor" strokeWidth="1" className="text-pink-400"/>
            </svg>
            <svg className="absolute top-1/3 right-1/4 w-28 h-28 opacity-15" viewBox="0 0 100 100">
                <rect x="20" y="20" width="60" height="60" fill="none" stroke="currentColor" strokeWidth="1" className="text-purple-400"/>
            </svg>
            <svg className="absolute top-1/2 left-1/6 w-20 h-20 opacity-15" viewBox="0 0 100 100">
                <polygon points="50,15 85,75 15,75" fill="none" stroke="currentColor" strokeWidth="1" className="text-green-400"/>
            </svg>
            <svg className="absolute bottom-1/4 left-1/2 w-36 h-36 opacity-1" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="35" fill="none" stroke="currentColor" strokeWidth="1" className="text-yellow-400"/>
            </svg>
        </div>
    );
};

function App() {
    const [gameState, setGameState] = useState('home');
    const [pseudo, setPseudo] = useState('');
    const [roomId, setRoomId] = useState('');
    const [playerSecret, setPlayerSecret] = useState(['', '', '', '']);
    const [guess, setGuess] = useState(['', '', '', '']);
    const [history, setHistory] = useState([]);
    const [message, setMessage] = useState('Bienvenue dans Chiffrio !');
    const [players, setPlayers] = useState({ player1: '', player2: '' });
    const [myPlayerId, setMyPlayerId] = useState(null);
    const [currentPlayer, setCurrentPlayer] = useState(1);
    const [isMyTurn, setIsMyTurn] = useState(false);
    const [gameSettings, setGameSettings] = useState({
        digits: 4,
        allowDuplicates: true,
        showMisplaced: true,
        showWellPlacedDigits: true,
        showMisplacedDigits: true
    });
    const [savedSettings, setSavedSettings] = useState({
        digits: 4,
        allowDuplicates: true,
        showMisplaced: true,
        showWellPlacedDigits: true,
        showMisplacedDigits: true
    });
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [imReady, setImReady] = useState(false);
    const [notepadEntries, setNotepadEntries] = useState([]);
    const [currentNotepadEntry, setCurrentNotepadEntry] = useState(['', '', '', '']);
    const [eliminatedDigits, setEliminatedDigits] = useState(new Set());
    const [historyViewMode, setHistoryViewMode] = useState('grid');
    const [historySortMode, setHistorySortMode] = useState('recent');
    const [reconnecting, setReconnecting] = useState(false);
    const [sessionId, setSessionId] = useState(null);
    // New states for errors
    const [secretError, setSecretError] = useState('');
    const [guessError, setGuessError] = useState('');
    const [notepadError, setNotepadError] = useState('');

    const secretInputs = useRef([]);
    const guessInputs = useRef([]);
    const notepadInputs = useRef([]);

    useEffect(() => {
        const stored = localStorage.getItem('chiffrio-session');
        if (stored) {
            setSessionId(stored);
        } else {
            const newId = Date.now().toString(36) + Math.random().toString(36).substr(2);
            setSessionId(newId);
            localStorage.setItem('chiffrio-session', newId);
        }
    }, []);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const roomFromUrl = urlParams.get('room');
        if (roomFromUrl) {
            setRoomId(roomFromUrl.toUpperCase());
        }
    }, []);

    useEffect(() => {
        if (!sessionId) return;

        socket.offAny();

        socket.on('connect', () => {
            console.log('Connecté au serveur Socket.IO');
            if (reconnecting) {
                socket.emit('reconnect', { sessionId });
            }
        });

        socket.on('disconnect', () => {
            console.log('Déconnecté du serveur');
            setReconnecting(true);
            setMessage('Connexion perdue... Tentative de reconnexion...');
        });

        socket.on('reconnected', (data) => {
            console.log('Reconnecté avec succès');
            setReconnecting(false);
            if (data.gameState) {
                setGameState(data.gameState.state);
                setRoomId(data.gameState.roomId);
                setPlayers(data.gameState.players);
                setMyPlayerId(data.gameState.myPlayerId);
                setCurrentPlayer(data.gameState.currentPlayer);
                setIsMyTurn(data.gameState.isMyTurn);
                const newSettings = data.gameState.gameSettings;
                setGameSettings(newSettings);
                setSavedSettings(newSettings);
                setHistory(data.gameState.history || []);
                setPlayerSecret(data.gameState.playerSecret || Array(data.gameState.gameSettings.digits).fill(''));
                setMessage('Reconnexion réussie ! Vous pouvez reprendre la partie.');
            }
        });

        socket.on('roomCreated', (data) => {
            setRoomId(data.roomId);
            setMyPlayerId(1);
            setGameState('hosting');
            setMessage(`Salle créée ! Code: ${data.roomId}`);
            setPlayers(prev => ({ ...prev, player1: pseudo }));
            const newSettings = data.gameSettings;
            setGameSettings(newSettings);
            setSavedSettings(newSettings);
            setPlayerSecret(Array(newSettings.digits).fill(''));
            setGuess(Array(newSettings.digits).fill(''));
            setCurrentNotepadEntry(Array(newSettings.digits).fill(''));
        });

        socket.on('roomJoined', (data) => {
            setRoomId(data.roomId);
            setPlayers(data.players);
            setMyPlayerId(2);
            setGameState('setup');
            setMessage('Connexion réussie ! Choisis ton nombre secret.');
            const newSettings = data.gameSettings;
            setGameSettings(newSettings);
            setSavedSettings(newSettings);
            setPlayerSecret(Array(newSettings.digits).fill(''));
            setGuess(Array(newSettings.digits).fill(''));
            setCurrentNotepadEntry(Array(newSettings.digits).fill(''));
        });

        socket.on('error', (message) => {
            setMessage(message);
        });

        socket.on('playerJoined', (data) => {
            setPlayers(data.players);
            setMessage(`${data.players.player2} a rejoint la partie !`);
            setGameState('setup');
            const newSettings = data.gameSettings;
            setGameSettings(newSettings);
            setSavedSettings(newSettings);
            setPlayerSecret(Array(newSettings.digits).fill(''));
            setGuess(Array(newSettings.digits).fill(''));
            setCurrentNotepadEntry(Array(newSettings.digits).fill(''));
        });

        socket.on('gameStart', (data) => {
            setGameState('playing');
            setIsMyTurn(data.currentPlayer === myPlayerId);
            setCurrentPlayer(data.currentPlayer);
            setMessage(`C'est parti ! C'est à ${getPlayerName(data.currentPlayer)} de jouer.`);
            if (data.gameSettings) {
                const newSettings = data.gameSettings;
                setGameSettings(newSettings);
                setSavedSettings(newSettings);
            }
        });

        socket.on('feedback', (data) => {
            const newEntry = {
                guess: data.guess,
                player: data.player,
                wellPlaced: data.feedback.wellPlaced,
                misplaced: data.feedback.misplaced,
                wellPlacedDigits: data.feedback.wellPlacedDigits,
                misplacedDigits: data.feedback.misplacedDigits,
                timestamp: Date.now()
            };

            setHistory(prevHistory => {
                const newHistory = [...prevHistory, newEntry];
                return newHistory.slice(-100);
            });

            if (data.feedback.wellPlaced === gameSettings.digits) {
                setGameState('won');
                setMessage(`Bravo ${getPlayerName(data.player)} ! Tu as gagné !`);
            } else {
                setCurrentPlayer(data.player === 1 ? 2 : 1);
                setIsMyTurn(data.player !== myPlayerId);
                setGuess(Array(gameSettings.digits).fill(''));
                setMessage(`C'est au tour de ${getPlayerName(data.player === 1 ? 2 : 1)}.`);
            }
        });

        socket.on('gameRestarted', () => {
            setGameState('setup');
            setPlayerSecret(Array(gameSettings.digits).fill(''));
            setGuess(Array(gameSettings.digits).fill(''));
            setHistory([]);
            setCurrentNotepadEntry(Array(gameSettings.digits).fill(''));
            setNotepadEntries([]);
            setEliminatedDigits(new Set());
            setImReady(false);
            setMessage('La partie a été relancée ! Choisis ton nouveau nombre secret.');
        });

        socket.on('settingsUpdated', (newSettings) => {
            setGameSettings(newSettings);
            setSavedSettings(newSettings);
            setPlayerSecret(Array(newSettings.digits).fill(''));
            setGuess(Array(newSettings.digits).fill(''));
            setCurrentNotepadEntry(Array(newSettings.digits).fill(''));
            setImReady(false);
            setMessage('Les règles ont été mises à jour par l\'hôte.');
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('reconnected');
            socket.off('roomCreated');
            socket.off('roomJoined');
            socket.off('error');
            socket.off('playerJoined');
            socket.off('gameStart');
            socket.off('feedback');
            socket.off('gameRestarted');
            socket.off('settingsUpdated');
        };
    }, [myPlayerId, pseudo, players, gameSettings.digits, sessionId]);

    useEffect(() => {
        const isEqual = JSON.stringify(gameSettings) === JSON.stringify(savedSettings);
        setHasUnsavedChanges(!isEqual);
    }, [gameSettings, savedSettings]);

    const createRoom = () => {
        if (!pseudo.trim() || pseudo.trim().length < 2) {
            setMessage('Choisis un pseudo valide (au moins 2 caractères) !');
            return;
        }
        socket.emit('createRoom', { pseudo: pseudo.trim(), gameSettings, sessionId });
    };

    const joinRoom = () => {
        if (!pseudo.trim() || pseudo.trim().length < 2 || !roomId.trim()) {
            setMessage('Remplis tous les champs avec un pseudo valide (au moins 2 caractères) !');
            return;
        }
        socket.emit('joinRoom', { pseudo: pseudo.trim(), roomId: roomId.trim(), sessionId });
    };

    const updateGameSettings = () => {
        socket.emit('updateSettings', { roomId, gameSettings, sessionId });
    };

    const handleRestart = () => {
        socket.emit('restartGame', { roomId, sessionId });
    };

    const handleSecretInputKeyDown = (e, index) => {
        if (e.key === 'Enter') {
            handleSecretSubmit();
        }
        if (e.key === 'Backspace') {
            if (!playerSecret[index] && index > 0) {
                secretInputs.current[index - 1]?.focus();
            }
        }
    };

    const handleGuessInputKeyDown = (e, index) => {
        if (e.key === 'Enter') {
            handleGuessSubmit();
        }
        if (e.key === 'Backspace') {
            if (!guess[index] && index > 0) {
                guessInputs.current[index - 1]?.focus();
            }
        }
    };

    const handleNotepadInputKeyDown = (e, index) => {
        if (e.key === 'Enter') {
            addNotepadEntry();
        }
        if (e.key === 'Backspace') {
            if (!currentNotepadEntry[index] && index > 0) {
                notepadInputs.current[index - 1]?.focus();
            }
        }
    };

    const handleSecretInputChange = (e, index) => {
        const value = e.target.value.replace(/\D/g, '').slice(-1);
        const newSecret = [...playerSecret];
        newSecret[index] = value;
        setPlayerSecret(newSecret);
        setSecretError(''); // Clear error on change

        if (value && index < gameSettings.digits - 1) {
            secretInputs.current[index + 1]?.focus();
        }
    };

    const handleGuessInputChange = (e, index) => {
        const value = e.target.value.replace(/\D/g, '').slice(-1);
        const newGuess = [...guess];
        newGuess[index] = value;
        setGuess(newGuess);
        setGuessError(''); // Clear error on change

        if (value && index < gameSettings.digits - 1) {
            guessInputs.current[index + 1]?.focus();
        }
    };

    const handleNotepadInputChange = (e, index) => {
        const value = e.target.value.replace(/\D/g, '').slice(-1);
        const newEntry = [...currentNotepadEntry];
        newEntry[index] = value;
        setCurrentNotepadEntry(newEntry);
        setNotepadError(''); // Clear error on change

        if (value && index < gameSettings.digits - 1) {
            notepadInputs.current[index + 1]?.focus();
        }
    };

    const addNotepadEntry = () => {
        const entry = currentNotepadEntry.join('');
        if (entry.length !== gameSettings.digits) {
            setNotepadError(`Complétez avec ${gameSettings.digits} chiffres pour ajouter.`);
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
        setNotepadError('');
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

    const toggleEliminated = (d) => {
        setEliminatedDigits(prev => {
            const newSet = new Set(prev);
            if (newSet.has(d)) {
                newSet.delete(d);
            } else {
                newSet.add(d);
            }
            return newSet;
        });
    };

    const handleSecretSubmit = () => {
        const secret = playerSecret.join('');
        if (secret.length !== gameSettings.digits || !/^\d+$/.test(secret)) {
            setSecretError(`Entrez ${gameSettings.digits} chiffres valides !`);
            return;
        }

        if (!gameSettings.allowDuplicates && new Set(secret.split('')).size !== secret.length) {
            setSecretError('Les doublons de chiffres ne sont pas autorisés selon les règles !');
            return;
        }

        setImReady(true);
        socket.emit('setSecret', { secret, player: myPlayerId, sessionId });
        setMessage('Nombre secret enregistré ! En attente de l\'autre joueur...');
        setSecretError('');
    };

    const handleGuessSubmit = () => {
        if (!isMyTurn) {
            setGuessError('Ce n\'est pas votre tour de jouer.');
            return;
        }

        const guessStr = guess.join('');
        if (guessStr.length !== gameSettings.digits || !/^\d+$/.test(guessStr)) {
            setGuessError(`Entrez ${gameSettings.digits} chiffres valides !`);
            return;
        }

        if (!gameSettings.allowDuplicates && new Set(guessStr.split('')).size !== guessStr.length) {
            setGuessError('Les doublons de chiffres ne sont pas autorisés selon les règles !');
            return;
        }

        socket.emit('submitGuess', { guess: guessStr, player: myPlayerId, sessionId });
        setMessage('En attente de la réponse...');
        setGuessError('');
    };

    const copyRoomLink = () => {
        const link = `${window.location.origin}?room=${roomId}`;
        navigator.clipboard.writeText(link);
        setMessage('Lien copié ! Envoie-le à ton ami !');
        setTimeout(() => {
            if (gameState === 'hosting') {
                setMessage(`Salle créée ! Code: ${roomId}`);
            }
        }, 2000);
    };

    const inputFields = (value, onChange, onKeyDown, disabled, inputRef, size = "large", error = '') => {
        const sizeClasses = size === "small"
            ? "w-8 h-8 text-sm"
            : size === "medium"
                ? "w-10 h-10 text-lg"
                : "w-14 h-14 text-2xl";

        const disabledClasses = disabled
            ? "bg-red-50 border-red-300 text-red-500"
            : "bg-white border-purple-300 text-indigo-700";

        return (
            <>
                <div className="flex justify-center gap-1">
                    {Array.from({ length: gameSettings.digits }, (_, i) => (
                        <input
                            key={i}
                            ref={el => inputRef.current[i] = el}
                            type="text"
                            maxLength={1}
                            value={value[i] || ''}
                            onChange={(e) => onChange(e, i)}
                            onKeyDown={(e) => onKeyDown(e, i)}
                            onPaste={(e) => { e.preventDefault(); }}
                            disabled={disabled}
                            className={`${sizeClasses} border-2 rounded-xl font-bold text-center focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-pink-400 transition-all duration-200 ${disabledClasses} hover:shadow-md`}
                        />
                    ))}
                </div>
                {error && (
                    <p className="text-red-600 text-sm text-center mt-2 font-medium">{error}</p>
                )}
            </>
        );
    };

    const getPlayerName = (playerId) => {
        return playerId === 1 ? players.player1 : players.player2;
    };

    const getOpponentName = () => {
        return myPlayerId === 1 ? players.player2 : players.player1;
    };

    const getSortedHistory = (entries, sortMode) => {
        const sorted = [...entries];
        switch (sortMode) {
            case 'recent':
                return sorted.reverse();
            case 'closest':
                return sorted.sort((a, b) => {
                    const scoreA = a.wellPlaced + (a.misplaced * 0.5);
                    const scoreB = b.wellPlaced + (b.misplaced * 0.5);
                    return scoreB - scoreA;
                });
            case 'wellPlaced':
                return sorted.sort((a, b) => b.wellPlaced - a.wellPlaced);
            default:
                return sorted;
        }
    };

    const renderHistoryGrid = (entries) => {
        return (
            <div className="grid grid-cols-6 gap-2">
                {entries.map((entry, index) => (
                    <div
                        key={index}
                        className="bg-white rounded-lg p-2 text-center border border-pink-200 hover:shadow-md transition-shadow"
                    >
                        <div className="font-mono text-sm font-bold text-indigo-800 mb-1">
                            {entry.guess.split('').map((digit, i) => (
                                <span
                                    key={i}
                                    className={
                                        entry.wellPlacedDigits.includes(i)
                                            ? 'text-green-600'
                                            : entry.misplacedDigits.includes(i)
                                                ? 'text-orange-600'
                                                : ''
                                    }
                                >
                                    {digit}
                                </span>
                            ))}
                        </div>
                        <div className="flex justify-center gap-1 text-xs">
                            <span className="bg-green-200 text-green-800 px-1 py-0.5 rounded font-bold">
                                {entry.wellPlaced}
                            </span>
                            {gameSettings.showMisplaced && (
                                <span className="bg-orange-200 text-orange-800 px-1 py-0.5 rounded font-bold">
                                    {entry.misplaced}
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderHistoryList = (entries) => {
        return (
            <div className="space-y-2">
                {entries.map((entry, index) => (
                    <div
                        key={index}
                        className="bg-white p-3 rounded-xl border-l-4 border-pink-400"
                    >
                        <div className="flex justify-between items-center">
                            <span className="font-mono text-lg font-bold text-indigo-800 bg-white px-2 py-1 rounded-lg">
                                {entry.guess.split('').map((digit, i) => (
                                    <span
                                        key={i}
                                        className={
                                            entry.wellPlacedDigits.includes(i)
                                                ? 'text-green-600'
                                                : entry.misplacedDigits.includes(i)
                                                    ? 'text-orange-600'
                                                    : ''
                                        }
                                    >
                                        {digit}
                                    </span>
                                ))}
                            </span>
                            <div className="flex gap-2">
                                <span className="bg-green-200 text-green-800 px-2 py-1 rounded-lg text-sm font-bold">
                                    {entry.wellPlaced}
                                </span>
                                {gameSettings.showMisplaced && (
                                    <span className="bg-orange-200 text-orange-800 px-2 py-1 rounded-lg text-sm font-bold">
                                        {entry.misplaced}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderGameSettings = (showUpdateButton = false, isDisabled = false) => (
        <div className="bg-white rounded-2xl p-6 border border-purple-200 mt-6">
            <h3 className="font-bold text-indigo-800 mb-4 text-lg flex items-center gap-2">
                ⚙️ <span>Règles du jeu</span>
            </h3>
            <div className="space-y-6">
                <div className="space-y-4">
                    <h4 className="font-semibold text-purple-800 text-base">Paramètres principaux</h4>
                    <div className="flex items-center justify-between">
                        <span className="text-purple-700 font-medium">Nombre de chiffres dans le code secret</span>
                        <select
                            value={gameSettings.digits}
                            onChange={(e) => {
                                const digits = parseInt(e.target.value);
                                setGameSettings(prev => ({ ...prev, digits }));
                                setPlayerSecret(Array(digits).fill(''));
                                setGuess(Array(digits).fill(''));
                                setCurrentNotepadEntry(Array(digits).fill(''));
                            }}
                            className="bg-white border border-purple-300 rounded-lg px-3 py-2 text-sm font-semibold"
                            disabled={isDisabled}
                        >
                            <option value={3}>3 chiffres</option>
                            <option value={4}>4 chiffres</option>
                            <option value={5}>5 chiffres</option>
                        </select>
                    </div>
                    <label className="flex items-center justify-between bg-white rounded-lg p-3 border border-purple-200 cursor-pointer">
                        <span className="text-purple-700 font-medium">Autoriser les doublons de chiffres (même chiffre plusieurs fois)</span>
                        <input
                            type="checkbox"
                            checked={gameSettings.allowDuplicates}
                            onChange={(e) => setGameSettings(prev => ({ ...prev, allowDuplicates: e.target.checked }))}
                            className="w-5 h-5 rounded text-pink-600 focus:ring-pink-500"
                            disabled={isDisabled}
                        />
                    </label>
                </div>
                <div className="space-y-4">
                    <h4 className="font-semibold text-purple-800 text-base">Indicateurs de feedback</h4>
                    <label className="flex items-center justify-between bg-white rounded-lg p-3 border border-purple-200 cursor-pointer">
                        <span className="text-purple-700 font-medium">Afficher le nombre total de chiffres mal placés (présents mais mauvaise position)</span>
                        <input
                            type="checkbox"
                            checked={gameSettings.showMisplaced}
                            onChange={(e) => setGameSettings(prev => ({ ...prev, showMisplaced: e.target.checked }))}
                            className="w-5 h-5 rounded text-pink-600 focus:ring-pink-500"
                            disabled={isDisabled}
                        />
                    </label>
                    <label className="flex items-center justify-between bg-white rounded-lg p-3 border border-purple-200 cursor-pointer">
                        <span className="text-purple-700 font-medium">Colorer les positions exactes des chiffres bien placés dans l'historique</span>
                        <input
                            type="checkbox"
                            checked={gameSettings.showWellPlacedDigits}
                            onChange={(e) => setGameSettings(prev => ({ ...prev, showWellPlacedDigits: e.target.checked }))}
                            className="w-5 h-5 rounded text-pink-600 focus:ring-pink-500"
                            disabled={isDisabled}
                        />
                    </label>
                    <label className="flex items-center justify-between bg-white rounded-lg p-3 border border-purple-200 cursor-pointer">
                        <span className="text-purple-700 font-medium">Colorer les positions des chiffres mal placés dans l'historique</span>
                        <input
                            type="checkbox"
                            checked={gameSettings.showMisplacedDigits}
                            onChange={(e) => setGameSettings(prev => ({ ...prev, showMisplacedDigits: e.target.checked }))}
                            className="w-5 h-5 rounded text-pink-600 focus:ring-pink-500"
                            disabled={isDisabled}
                        />
                    </label>
                </div>
                {showUpdateButton && (
                    <button
                        onClick={updateGameSettings}
                        className={`w-full bg-pink-600 text-white p-3 rounded-xl text-lg font-bold hover:bg-pink-700 transition-all duration-300 shadow-lg ${hasUnsavedChanges ? 'animate-pulse' : ''}`}
                    >
                        Mettre à jour les règles
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-indigo-50 font-sans">
            <BackgroundShapes />

            {reconnecting && (
                <div className="fixed top-4 right-4 bg-yellow-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-pulse">
                    Reconnexion en cours...
                </div>
            )}

            <header className="bg-white shadow-lg border-b border-purple-200 p-4 top-0 z-10 relative">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <div className="w-10 h-10 bg-pink-600 rounded-full flex items-center justify-center">
                                <span className="text-white font-bold text-xl">🔢</span>
                            </div>
                            <h1 className="text-3xl font-bold text-indigo-600">
                                Chiffrio
                            </h1>
                        </div>
                        {roomId && (
                            <div className="bg-indigo-100 px-4 py-2 rounded-full border border-purple-200">
                                <span className="text-sm font-semibold text-purple-700">Room: {roomId}</span>
                            </div>
                        )}
                    </div>
                    {(gameState === 'playing' || gameState === 'setup') && (
                        <div className="flex items-center gap-4">
                            <div className="text-right bg-purple-50 px-3 py-2 rounded-lg border border-purple-200">
                                <div className="text-xs text-purple-500 font-medium">Ton secret</div>
                                <div className="text-lg font-mono font-bold text-indigo-800">
                                    {playerSecret.join('') || Array(gameSettings.digits).fill('-').join('')}
                                </div>
                            </div>
                            <button
                                onClick={handleRestart}
                                className="bg-orange-600 text-white px-4 py-2 rounded-xl font-bold hover:bg-orange-700 transition-all duration-300 shadow-lg"
                            >
                                🔄 Relancer
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <div className="bg-indigo-600 text-white p-4 relative z-10">
                <div className="max-w-7xl mx-auto text-center">
                    <p className="font-semibold text-lg">{message}</p>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6 relative z-10">
                {gameState === 'home' && (
                    <div className="max-w-md mx-auto mt-20 bg-white rounded-3xl p-8 shadow-xl border border-purple-200">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold text-indigo-800 mb-3">Bienvenue !</h2>
                            <p className="text-purple-600 text-lg mb-4">Chiffrio est un jeu multijoueur où vous devez deviner le code secret de votre adversaire avant qu'il ne devine le vôtre. À chaque tour, proposez une combinaison et recevez des indices : chiffres bien placés (en vert) et mal placés (en orange).</p>
                            <p className="text-purple-600 text-lg">Choisis ton pseudo pour commencer</p>
                        </div>
                        <input
                            type="text"
                            value={pseudo}
                            onChange={(e) => setPseudo(e.target.value)}
                            placeholder="Ton pseudo..."
                            className="w-full p-4 border-2 border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-pink-400 text-lg font-medium transition-all"
                        />
                        <div className="grid grid-cols-2 gap-4 mt-6">
                            <button
                                onClick={() => {
                                    if (pseudo.trim() && pseudo.trim().length >= 2) setGameState('createSettings');
                                    else setMessage('Choisis un pseudo valide (au moins 2 caractères) !');
                                }}
                                className="bg-pink-600 text-white p-4 rounded-xl text-xl font-bold hover:bg-pink-700 transition-all duration-300 shadow-lg"
                            >
                                Créer une partie
                            </button>
                            <button
                                onClick={() => {
                                    if (pseudo.trim() && pseudo.trim().length >= 2) setGameState('joinInput');
                                    else setMessage('Choisis un pseudo valide (au moins 2 caractères) !');
                                }}
                                className="bg-indigo-600 text-white p-4 rounded-xl text-xl font-bold hover:bg-indigo-700 transition-all duration-300 shadow-lg"
                            >
                                Rejoindre
                            </button>
                        </div>
                    </div>
                )}

                {gameState === 'createSettings' && (
                    <div className="max-w-md mx-auto mt-20 bg-white rounded-3xl p-8 shadow-xl border border-purple-200">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold text-indigo-800 mb-3">Configurer la partie</h2>
                            <p className="text-purple-600 text-lg">Choisis les règles du jeu</p>
                        </div>
                        {renderGameSettings(false, false)}
                        <button
                            onClick={createRoom}
                            className="w-full bg-pink-600 text-white p-4 rounded-xl text-xl font-bold hover:bg-pink-700 transition-all duration-300 shadow-lg mt-6"
                        >
                            Créer la partie
                        </button>
                    </div>
                )}

                {gameState === 'joinInput' && (
                    <div className="max-w-md mx-auto mt-20 bg-white rounded-3xl p-8 shadow-xl border border-purple-200">
                        <div className="text-center mb-8">
                            <h2 className="text-3xl font-bold text-indigo-800 mb-3">Rejoindre une partie</h2>
                            <p className="text-purple-600 text-lg">Entre le code de la salle</p>
                        </div>
                        <input
                            type="text"
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                            placeholder="Code de la salle..."
                            className="w-full p-4 border-2 border-purple-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 text-center font-mono text-xl font-bold tracking-wider transition-all"
                            maxLength={6}
                        />
                        <button
                            onClick={joinRoom}
                            className="w-full bg-indigo-600 text-white p-4 rounded-xl text-xl font-bold hover:bg-indigo-700 transition-all duration-300 shadow-lg mt-6"
                        >
                            Rejoindre
                        </button>
                    </div>
                )}

                {gameState === 'hosting' && (
                    <div className="flex justify-center mt-12">
                        <div className="bg-white rounded-3xl p-12 shadow-2xl text-center max-w-md border border-purple-200">
                            <div className="text-8xl mb-6 animate-pulse">⏳</div>
                            <h2 className="text-3xl font-bold text-indigo-800 mb-6">Salle créée !</h2>
                            <div className="bg-indigo-100 rounded-2xl p-6 mb-8 border border-purple-200">
                                <p className="text-sm text-purple-700 mb-2 font-semibold">Code de la salle</p>
                                <p className="text-4xl font-bold text-indigo-800 tracking-wider font-mono">{roomId}</p>
                            </div>
                            {renderGameSettings(true, false)}
                            <button
                                onClick={copyRoomLink}
                                className="bg-pink-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-pink-700 transition-all duration-300 shadow-lg mt-6"
                            >
                                📋 Copier le lien
                            </button>
                        </div>
                    </div>
                )}

                {gameState === 'setup' && (
                    <div className="max-w-3xl mx-auto mt-8">
                        <div className="bg-white rounded-3xl p-12 shadow-2xl text-center border border-purple-200">
                            <h2 className="text-4xl font-bold text-indigo-800 mb-4">🤫 Choisis ton nombre secret</h2>
                            <p className="text-purple-600 mb-2 text-lg">
                                {getOpponentName() ? `${getOpponentName()} attend ta décision...` : 'En attente de l\'autre joueur...'}
                            </p>

                            <div className="bg-indigo-50 rounded-2xl p-4 mb-8 border border-pink-100">
                                <div className="flex flex-wrap justify-center gap-4 text-sm">
                                    <span className="bg-white px-3 py-1 rounded-full border border-pink-200 text-pink-700 font-semibold">
                                        {gameSettings.digits} chiffres
                                    </span>
                                    <span className={`px-3 py-1 rounded-full border font-semibold ${
                                        gameSettings.allowDuplicates
                                            ? 'bg-green-100 border-green-200 text-green-700'
                                            : 'bg-red-100 border-red-200 text-red-700'
                                    }`}>
                                        {gameSettings.allowDuplicates ? '✓' : '✗'} Doublons autorisés
                                    </span>
                                    <span className={`px-3 py-1 rounded-full border font-semibold ${
                                        gameSettings.showMisplaced
                                            ? 'bg-green-100 border-green-200 text-green-700'
                                            : 'bg-red-100 border-red-200 text-red-700'
                                    }`}>
                                        {gameSettings.showMisplaced ? '✓' : '✗'} Afficher mal placés
                                    </span>
                                    <span className={`px-3 py-1 rounded-full border font-semibold ${
                                        gameSettings.showWellPlacedDigits
                                            ? 'bg-green-100 border-green-200 text-green-700'
                                            : 'bg-red-100 border-red-200 text-red-700'
                                    }`}>
                                        {gameSettings.showWellPlacedDigits ? '✓' : '✗'} Colorer bien placés
                                    </span>
                                    <span className={`px-3 py-1 rounded-full border font-semibold ${
                                        gameSettings.showMisplacedDigits
                                            ? 'bg-green-100 border-green-200 text-green-700'
                                            : 'bg-red-100 border-red-200 text-red-700'
                                    }`}>
                                        {gameSettings.showMisplacedDigits ? '✓' : '✗'} Colorer mal placés
                                    </span>
                                </div>
                            </div>

                            {myPlayerId === 1 && renderGameSettings(true, false)}
                            {myPlayerId !== 1 && renderGameSettings(false, true)}

                            <div className="mb-10 mt-10">
                                {inputFields(playerSecret, handleSecretInputChange, handleSecretInputKeyDown, false, secretInputs, 'large', secretError)}
                            </div>
                            <button
                                onClick={handleSecretSubmit}
                                disabled={imReady}
                                className={`px-12 py-4 rounded-xl text-xl font-bold transition-all duration-300 shadow-lg ${
                                    imReady
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-pink-600 text-white hover:bg-pink-700'
                                }`}
                            >
                                {imReady ? '✅ Nombre validé' : '🔒 Valider mon secret'}
                            </button>
                            {imReady && (
                                <p className="text-sm text-purple-500 mt-6 animate-pulse">
                                    En attente de {getOpponentName()}...
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {gameState === 'playing' && (
                    <div className="grid grid-cols-5 gap-6 mt-6">
                        <div className="col-span-1 bg-white rounded-3xl p-6 shadow-xl border border-indigo-200">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-lg text-indigo-800 flex items-center gap-2">
                                    📝 <span>Bloc-notes</span>
                                </h3>
                                <button
                                    onClick={clearAllNotepad}
                                    className="text-xs bg-red-100 hover:bg-red-200 text-red-600 px-2 py-1 rounded-md font-medium transition-colors"
                                >
                                    Tout effacer
                                </button>
                            </div>

                            <div className="bg-indigo-50 rounded-lg p-3 mb-4 border border-indigo-200">
                                <div className="mb-2">
                                    {inputFields(currentNotepadEntry, handleNotepadInputChange, handleNotepadInputKeyDown, false, notepadInputs, 'small', notepadError)}
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
                                        className="text-xs bg-indigo-100 hover:bg-indigo-200 text-indigo-600 px-2 py-1.5 rounded font-medium transition-colors"
                                    >
                                        Effacer
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2 max-h-[calc(100vh-500px)] overflow-y-auto">
                                {notepadEntries.length === 0 ? (
                                    <p className="text-sm text-indigo-500 italic text-center py-4">
                                        Aucune combinaison testée
                                    </p>
                                ) : (
                                    notepadEntries.map((entry) => (
                                        <div key={entry.id} className="bg-white border border-indigo-200 rounded-lg p-2 shadow-sm">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-mono text-sm font-bold text-indigo-800">
                                                    {entry.combination}
                                                </span>
                                                <button
                                                    onClick={() => deleteNotepadEntry(entry.id)}
                                                    className="text-red-500 hover:text-red-700 text-xs w-4 h-4 flex items-center justify-center"
                                                >
                                                    ×
                                                </button>
                                            </div>
                                            <input
                                                type="text"
                                                value={entry.notes}
                                                onChange={(e) => updateNotepadEntry(entry.id, e.target.value)}
                                                placeholder="Notes..."
                                                className="w-full text-xs p-1 border border-indigo-200 rounded focus:outline-none focus:ring-1 focus:ring-pink-400"
                                            />
                                        </div>
                                    ))
                                )}
                            </div>

                            <div className="mt-6 pt-4 border-t border-indigo-200">
                                <h3 className="font-bold text-lg text-indigo-800 mb-2 flex items-center gap-2">
                                    ❌ <span>Chiffres éliminés</span>
                                </h3>
                                <div className="grid grid-cols-5 gap-2">
                                    {[...Array(10).keys()].map(d => (
                                        <button
                                            key={d}
                                            onClick={() => toggleEliminated(d)}
                                            className={`w-full h-10 rounded-lg font-bold text-lg transition-colors ${
                                                eliminatedDigits.has(d)
                                                    ? 'bg-red-500 text-white line-through hover:bg-red-600'
                                                    : 'bg-white text-indigo-800 border border-indigo-300 hover:bg-indigo-50'
                                            }`}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="col-span-2 bg-white rounded-3xl p-8 shadow-xl border border-purple-200">
                            <div className="text-center mb-8">
                                <h2 className="text-2xl font-bold text-indigo-800 mb-4">
                                    {isMyTurn ? `🎯 À ton tour !` : `⏳ Tour de ${getOpponentName()}`}
                                </h2>

                                <div className="flex justify-center items-center gap-6 mb-6">
                                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                                        currentPlayer === 1
                                            ? 'bg-pink-100 border-2 border-pink-400 shadow-md'
                                            : 'bg-purple-100 border border-purple-300'
                                    }`}>
                                        <div className={`w-3 h-3 rounded-full ${
                                            currentPlayer === 1 ? 'bg-pink-500 animate-pulse' : 'bg-gray-400'
                                        }`}></div>
                                        <span className={`font-semibold ${
                                            currentPlayer === 1 ? 'text-pink-700' : 'text-purple-600'
                                        }`}>{players.player1}</span>
                                    </div>
                                    <span className="text-purple-400 font-bold">VS</span>
                                    <div className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all ${
                                        currentPlayer === 2
                                            ? 'bg-indigo-100 border-2 border-indigo-400 shadow-md'
                                            : 'bg-purple-100 border border-purple-300'
                                    }`}>
                                        <div className={`w-3 h-3 rounded-full ${
                                            currentPlayer === 2 ? 'bg-indigo-500 animate-pulse' : 'bg-gray-400'
                                        }`}></div>
                                        <span className={`font-semibold ${
                                            currentPlayer === 2 ? 'text-indigo-700' : 'text-purple-600'
                                        }`}>{players.player2}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="mb-8">
                                {inputFields(guess, handleGuessInputChange, handleGuessInputKeyDown, !isMyTurn, guessInputs, 'large', guessError)}
                            </div>

                            <button
                                onClick={handleGuessSubmit}
                                disabled={!isMyTurn}
                                className={`w-full p-4 rounded-xl text-xl font-bold transition-all duration-300 shadow-lg ${
                                    !isMyTurn
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                        : 'bg-pink-600 text-white hover:bg-pink-700'
                                }`}
                            >
                                🚀 Proposer ma combinaison
                            </button>
                        </div>

                        <div className="col-span-2 bg-white rounded-3xl p-6 shadow-xl border border-pink-200">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-xl font-bold text-pink-800 flex items-center gap-2">
                                    📊 <span>Mon historique</span>
                                </h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setHistoryViewMode(historyViewMode === 'grid' ? 'list' : 'grid')}
                                        className={`text-xs px-3 py-1 rounded font-medium transition-colors ${
                                            historyViewMode === 'grid'
                                                ? 'bg-pink-200 text-pink-800'
                                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                        }`}
                                    >
                                        {historyViewMode === 'grid' ? '📋' : '⚏'}
                                    </button>
                                    <select
                                        value={historySortMode}
                                        onChange={(e) => setHistorySortMode(e.target.value)}
                                        className="text-xs bg-white border border-pink-300 rounded px-2 py-1 font-medium"
                                    >
                                        <option value="recent">Récent</option>
                                        <option value="closest">Plus proche</option>
                                        <option value="wellPlaced">Bien placés</option>
                                    </select>
                                </div>
                            </div>

                            <div className="max-h-[calc(100vh-300px)] overflow-y-auto">
                                {history.filter(h => h.player === myPlayerId).length === 0 ? (
                                    <div className="text-center py-8">
                                        <div className="text-5xl mb-4 opacity-50">🤔</div>
                                        <p className="text-pink-500 text-lg">Aucune proposition pour l'instant...</p>
                                    </div>
                                ) : (
                                    <div>
                                        {historyViewMode === 'grid'
                                            ? renderHistoryGrid(getSortedHistory(history.filter(h => h.player === myPlayerId), historySortMode))
                                            : renderHistoryList(getSortedHistory(history.filter(h => h.player === myPlayerId), historySortMode))
                                        }
                                    </div>
                                )}
                            </div>

                            <div className="mt-6 pt-4 border-t border-gray-200">
                                <h4 className="font-bold text-green-800 mb-3 text-center flex items-center justify-center gap-2">
                                    <span className="text-sm">👁️ {getOpponentName() || 'Adversaire'}</span>
                                </h4>
                                <div className="max-h-32 overflow-y-auto">
                                    <div className="grid grid-cols-4 gap-1">
                                        {history.filter(h => h.player !== myPlayerId).slice(-16).map((entry, index) => (
                                            <div key={index} className="bg-white rounded-lg p-1 text-center border border-green-200">
                                                <div className="font-mono text-xs font-bold text-green-800">
                                                    {entry.guess.split('').map((digit, i) => (
                                                        <span
                                                            key={i}
                                                            className={
                                                                entry.wellPlacedDigits.includes(i)
                                                                    ? 'text-green-600'
                                                                    : entry.misplacedDigits.includes(i)
                                                                        ? 'text-orange-600'
                                                                        : ''
                                                            }
                                                        >
                                                            {digit}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="flex justify-center gap-1 text-xs">
                                                    <span className="bg-green-300 text-green-800 px-1 rounded text-xs font-bold">
                                                        {entry.wellPlaced}
                                                    </span>
                                                    {gameSettings.showMisplaced && (
                                                        <span className="bg-orange-300 text-orange-800 px-1 rounded text-xs font-bold">
                                                            {entry.misplaced}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {gameState === 'won' && (
                    <div className="flex justify-center mt-12">
                        <div className="bg-white rounded-3xl p-16 shadow-2xl text-center max-w-lg border border-purple-200">
                            <div className="text-9xl mb-8 animate-bounce">🏆</div>
                            <h2 className="text-4xl font-bold text-indigo-600 mb-8">
                                Partie terminée !
                            </h2>
                            <div className="bg-indigo-50 rounded-2xl p-6 mb-8 border border-pink-200">
                                <p className="text-purple-700 text-lg">Félicitations pour cette belle partie ! 🎉</p>
                            </div>
                            <div className="flex gap-4">
                                <button
                                    onClick={handleRestart}
                                    className="flex-1 bg-orange-600 text-white px-8 py-4 rounded-xl text-xl font-bold hover:bg-orange-700 transition-all duration-300 shadow-lg"
                                >
                                    🔄 Relancer
                                </button>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="flex-1 bg-pink-600 text-white px-8 py-4 rounded-xl text-xl font-bold hover:bg-pink-700 transition-all duration-300 shadow-lg"
                                >
                                    🔙 Retour au lobby
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default App;