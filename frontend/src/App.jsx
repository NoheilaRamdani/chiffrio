import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import {
    FaGamepad, FaTrophy, FaHistory, FaClock, FaCheck, FaLock,
    FaPlus, FaTrash, FaTimes, FaPencilAlt, FaLink, FaCog,
    FaThLarge, FaList, FaBullseye, FaStickyNote, FaRedo, FaPlusCircle
} from 'react-icons/fa';

const socket = io(import.meta.env.VITE_SOCKET_URL || 'http://localhost:3001', {
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionAttempts: 5
});

const DoodleMathShapes = () => (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-[-1] text-primary-color opacity-20">
        <span className="absolute top-[10%] left-[5%] text-7xl font-mono rotate-12">13</span>
        <span className="absolute top-[20%] right-[15%] text-8xl font-mono -rotate-6">+</span>
        <span className="absolute bottom-[10%] left-[20%] text-6xl font-mono rotate-6">/</span>
        <span className="absolute bottom-[15%] right-[10%] text-9xl font-mono rotate-12">=</span>
        <span className="absolute top-[50%] left-[45%] text-6xl font-mono">-</span>
        <span className="absolute top-[60%] right-[30%] text-7xl font-mono rotate-3">42</span>
        <span className="absolute bottom-[30%] left-[5%] text-8xl font-mono -rotate-12">%</span>
    </div>
);

function App() {
    const [gameState, setGameState] = useState('home');
    const [pseudo, setPseudo] = useState('');
    const [roomId, setRoomId] = useState('');
    const [playerSecret, setPlayerSecret] = useState(['', '', '', '']);
    const [guess, setGuess] = useState(['', '', '', '']);
    const [history, setHistory] = useState([]);
    const [message, setMessage] = useState('Trouve le code secret de ton adversaire !');
    const [errorMessage, setErrorMessage] = useState('');
    const [players, setPlayers] = useState({ player1: '', player2: '' });
    const [myPlayerId, setMyPlayerId] = useState(null);
    const [uuid, setUuid] = useState(null);
    const [currentPlayer, setCurrentPlayer] = useState(1);
    const [isMyTurn, setIsMyTurn] = useState(false);
    const [gameSettings, setGameSettings] = useState({
        digits: 4,
        allowDuplicates: true,
        showMisplaced: true,
        showWellPlacedDigits: true,
        showMisplacedDigits: true,
    });
    const [savedSettings, setSavedSettings] = useState({
        digits: 4,
        allowDuplicates: true,
        showMisplaced: true,
        showWellPlacedDigits: true,
        showMisplacedDigits: true,
    });
    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [imReady, setImReady] = useState(false);
    const [notepadEntries, setNotepadEntries] = useState([]);
    const [currentNotepadEntry, setCurrentNotepadEntry] = useState(['', '', '', '']);
    const [eliminatedDigits, setEliminatedDigits] = useState(new Set());
    const [historyViewMode, setHistoryViewMode] = useState('grid');
    const [historySortMode, setHistorySortMode] = useState('recent');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [mySocketId, setMySocketId] = useState(null);

    const secretInputs = useRef([]);
    const guessInputs = useRef([]);
    const notepadInputs = useRef([]);
    const submitTimeoutRef = useRef(null);

    // AJOUTÉ : Fonction pour réinitialiser proprement l'état et retourner à l'accueil
    const resetToHome = (msg) => {
        setGameState('home');
        setRoomId('');
        setPlayerSecret(Array(gameSettings.digits).fill(''));
        setGuess(Array(gameSettings.digits).fill(''));
        setHistory([]);
        setPlayers({ player1: '', player2: '' });
        setMyPlayerId(null);
        setUuid(null);
        setImReady(false);
        setIsSubmitting(false);
        setNotepadEntries([]);
        setEliminatedDigits(new Set());
        setMessage(msg || 'Prêt pour une nouvelle partie !');
        localStorage.removeItem('chiffrioState');
    };


    const resetGuessAndNotepad = (digits) => {
        setGuess(Array(digits).fill(''));
        setCurrentNotepadEntry(Array(digits).fill(''));
    };

    const resetAllInputs = (digits) => {
        setPlayerSecret(Array(digits).fill(''));
        setGuess(Array(digits).fill(''));
        setCurrentNotepadEntry(Array(digits).fill(''));
    };

    useEffect(() => {
        socket.on('connect', () => {
            console.log('✅ Connecté au serveur:', socket.id);
            setIsConnected(true);
            setMySocketId(socket.id);
            setMessage('Connecté au serveur !');

            const stored = JSON.parse(localStorage.getItem('chiffrioState'));
            if (stored && stored.roomId && stored.uuid && stored.pseudo) {
                setPseudo(stored.pseudo);
                setRoomId(stored.roomId);
                setUuid(stored.uuid);
                setMyPlayerId(stored.playerId);
                socket.emit('reconnectToRoom', { pseudo: stored.pseudo, roomId: stored.roomId, uuid: stored.uuid });
            }
        });

        socket.on('disconnect', () => {
            console.log('❌ Déconnecté du serveur');
            setIsConnected(false);
            setMessage('Connexion perdue... Reconnexion en cours...');
        });

        return () => {
            socket.off('connect');
            socket.off('disconnect');
        };
    }, []);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const roomFromUrl = urlParams.get('room');
        if (roomFromUrl) {
            setRoomId(roomFromUrl.toUpperCase());
        }
    }, []);

    useEffect(() => {
        socket.on('roomCreated', (data) => {
            console.log('🎮 Salle créée:', data);
            setRoomId(data.roomId);
            setMyPlayerId(1);
            setUuid(data.uuid);
            setGameState('hosting');
            setMessage(`Salle créée ! Code: ${data.roomId}`);
            setPlayers((prev) => ({ ...prev, player1: pseudo }));
            const newSettings = data.gameSettings;
            setGameSettings(newSettings);
            setSavedSettings(newSettings);
            resetAllInputs(newSettings.digits);
            localStorage.setItem('chiffrioState', JSON.stringify({
                pseudo,
                roomId: data.roomId,
                playerId: 1,
                uuid: data.uuid
            }));
            localStorage.setItem('chiffrioLastSettings', JSON.stringify(newSettings));
        });

        socket.on('roomJoined', (data) => {
            console.log('✅ Salle rejointe:', data);
            setRoomId(data.roomId);
            setPlayers(data.players);
            setMyPlayerId(2);
            setUuid(data.uuid);
            setGameState('setup');
            setMessage('Connexion réussie ! Choisis ton nombre secret.');
            const newSettings = data.gameSettings;
            setGameSettings(newSettings);
            setSavedSettings(newSettings);
            resetAllInputs(newSettings.digits);
            localStorage.setItem('chiffrioState', JSON.stringify({
                pseudo,
                roomId: data.roomId,
                playerId: 2,
                uuid: data.uuid
            }));
            localStorage.setItem('chiffrioLastSettings', JSON.stringify(newSettings));
        });

        socket.on('reconnected', (data) => {
            console.log('✅ Reconnecté:', data);
            setRoomId(data.roomId);
            setPlayers(data.players);
            setMyPlayerId(data.myPlayerId);
            setGameState(data.gameState);
            setGameSettings(data.gameSettings);
            setSavedSettings(data.gameSettings);
            setHistory(data.history || []);
            setMessage('Reconnecté à la partie !');
            if (data.mySecret) {
                setPlayerSecret(data.mySecret.split(''));
                setImReady(true);
            } else {
                resetAllInputs(data.gameSettings.digits);
                setImReady(false);
            }
            if (data.gameState === 'playing') {
                resetGuessAndNotepad(data.gameSettings.digits);
            }
        });

        socket.on('error', (errorMessage) => {
            console.error('❌ Erreur:', errorMessage);
            setMessage(errorMessage);
            setIsSubmitting(false);
            if (submitTimeoutRef.current) {
                clearTimeout(submitTimeoutRef.current);
            }
        });

        socket.on('validationError', (errorMessage) => {
            console.error('❌ Validation Error:', errorMessage);
            setErrorMessage(errorMessage);
            setIsSubmitting(false);
            if (submitTimeoutRef.current) {
                clearTimeout(submitTimeoutRef.current);
            }
            setTimeout(() => setErrorMessage(''), 3000);
        });

        socket.on('playerJoined', (data) => {
            console.log('👤 Joueur rejoint:', data);
            setPlayers(data.players);
            setMessage(`${data.players.player2} a rejoint la partie !`);
            setGameState('setup');
            const newSettings = data.gameSettings;
            setGameSettings(newSettings);
            setSavedSettings(newSettings);
            resetAllInputs(newSettings.digits);
        });

        socket.on('playerReconnected', ({ pseudo }) => {
            console.log('👤 Joueur reconnecté:', pseudo);
            setMessage(`${pseudo} est de retour !`);
        });

        socket.on('secretSet', ({ player }) => {
            console.log('🔒 Secret défini pour joueur', player);
            setMessage(`Joueur ${player} a défini son code secret.`);
        });

        socket.on('gameStart', (data) => {
            console.log('🎮 Jeu démarré:', data);
            setGameState('playing');
            setIsMyTurn(data.currentPlayer === myPlayerId);
            setCurrentPlayer(data.currentPlayer);
            setMessage(`C'est parti ! C'est à ${getPlayerName(data.currentPlayer)} de jouer.`);
            if (data.gameSettings) {
                const newSettings = data.gameSettings;
                setGameSettings(newSettings);
                setSavedSettings(newSettings);
                resetGuessAndNotepad(newSettings.digits);
            }
        });

        socket.on('feedback', (data) => {
            console.log('📊 Feedback reçu:', data);
            setIsSubmitting(false);
            if (submitTimeoutRef.current) {
                clearTimeout(submitTimeoutRef.current);
            }

            const newEntry = {
                guess: data.guess,
                player: data.player,
                wellPlaced: data.feedback.wellPlaced,
                misplaced: data.feedback.misplaced,
                wellPlacedDigits: data.feedback.wellPlacedDigits || [],
                misplacedDigits: data.feedback.misplacedDigits || [],
                timestamp: Date.now(),
            };

            setHistory((prevHistory) => {
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
            console.log('🔄 Jeu relancé');
            setGameState('setup');
            resetAllInputs(gameSettings.digits);
            setHistory([]);
            setNotepadEntries([]);
            setEliminatedDigits(new Set());
            setImReady(false);
            setIsSubmitting(false);
            setMessage('La partie a été relancée ! Choisis ton nouveau nombre secret.');
        });

        socket.on('settingsUpdated', (newSettings) => {
            console.log('⚙️ Paramètres mis à jour:', newSettings);
            setGameSettings(newSettings);
            setSavedSettings(newSettings);
            resetAllInputs(newSettings.digits);
            setImReady(false);
            setMessage("Les règles ont été mises à jour par l'hôte.");
        });

        socket.on('playerDisconnected', ({ pseudo: disconnectedPseudo }) => {
            console.log('⚠️ Joueur déconnecté:', disconnectedPseudo);
            setMessage(`${disconnectedPseudo} s'est déconnecté.`);
        });

        // AJOUTÉ: Gestionnaire pour la fin de partie initiée par l'autre joueur
        socket.on('gameEndedByHost', () => {
            console.log("🎬 L'adversaire a mis fin à la partie.");
            resetToHome("Ton adversaire a lancé une nouvelle partie. Tu as été renvoyé à l'accueil.");
        });

        socket.on('newRoomCreatedAfterEnd', (data) => {
            console.log('🎮 Nouvelle salle créée après fin de partie:', data);
            setRoomId(data.roomId);
            setMyPlayerId(1);
            setUuid(data.uuid);
            setGameState('hosting');
            setMessage(`Nouvelle partie créée ! Code: ${data.roomId}`);
            setPlayers({ player1: pseudo, player2: '' }); // CHANGÉ : On réinitialise player2
            const newSettings = data.gameSettings;
            setGameSettings(newSettings);
            setSavedSettings(newSettings);
            resetAllInputs(newSettings.digits);
            setHistory([]); // AJOUTÉ : Vider l'historique
            setNotepadEntries([]); // AJOUTÉ : Vider le bloc-notes
            setEliminatedDigits(new Set()); // AJOUTÉ : Vider les chiffres éliminés

            localStorage.setItem('chiffrioState', JSON.stringify({
                pseudo,
                roomId: data.roomId,
                playerId: 1,
                uuid: data.uuid
            }));
            localStorage.setItem('chiffrioLastSettings', JSON.stringify(newSettings));
        });

        return () => {
            socket.off('roomCreated');
            socket.off('roomJoined');
            socket.off('reconnected');
            socket.off('error');
            socket.off('validationError');
            socket.off('playerJoined');
            socket.off('playerReconnected');
            socket.off('secretSet');
            socket.off('gameStart');
            socket.off('feedback');
            socket.off('gameRestarted');
            socket.off('settingsUpdated');
            socket.off('playerDisconnected');
            socket.off('newRoomCreatedAfterEnd');
            socket.off('gameEndedByHost'); // AJOUTÉ : Nettoyage de l'écouteur
        };
    }, [myPlayerId, pseudo, players, gameSettings.digits]);

    // ... (le reste du composant reste identique)
    // ... (all other functions: createRoom, joinRoom, handleGuessSubmit, etc. remain the same)

    useEffect(() => {
        const isEqual = JSON.stringify(gameSettings) === JSON.stringify(savedSettings);
        setHasUnsavedChanges(!isEqual);
    }, [gameSettings, savedSettings]);

    const createRoom = () => {
        if (!pseudo.trim() || pseudo.trim().length < 2) {
            setMessage('Choisis un pseudo valide (au moins 2 caractères) !');
            return;
        }
        if (!isConnected) {
            setMessage('Connexion au serveur en cours...');
            return;
        }
        console.log('📤 Création de salle:', { pseudo: pseudo.trim(), gameSettings });
        socket.emit('createRoom', { pseudo: pseudo.trim(), gameSettings });
    };

    const joinRoom = () => {
        if (!pseudo.trim() || pseudo.trim().length < 2 || !roomId.trim()) {
            setMessage('Remplis tous les champs avec un pseudo valide (au moins 2 caractères) !');
            return;
        }
        if (!isConnected) {
            setMessage('Connexion au serveur en cours...');
            return;
        }
        console.log('📤 Rejoindre salle:', { pseudo: pseudo.trim(), roomId: roomId.trim() });
        socket.emit('joinRoom', { pseudo: pseudo.trim(), roomId: roomId.trim() });
    };

    const endGameAndNewRoom = () => {
        if (!isConnected) {
            setMessage('Connexion au serveur en cours...');
            return;
        }
        const lastSettings = JSON.parse(localStorage.getItem('chiffrioLastSettings') || '{}');
        console.log('📤 Fin de partie et nouvelle salle:', { pseudo: pseudo.trim(), gameSettings: lastSettings });
        socket.emit('endGameAndNewRoom', { pseudo: pseudo.trim(), gameSettings: lastSettings });
        setMessage('Création d\'une nouvelle partie...');
    };

    const updateGameSettings = () => {
        if (!hasUnsavedChanges) {
            setMessage('Aucune modification à enregistrer.');
            return;
        }
        console.log('📤 Mise à jour des paramètres:', { roomId, gameSettings });
        socket.emit('updateSettings', { roomId, gameSettings });
        setMessage('Mise à jour des règles...');
    };

    const handleRestart = () => {
        console.log('📤 Relancer la partie:', roomId);
        socket.emit('restartGame', { roomId });
    };

    const handleInputKeyDown = (e, index, inputsArray, setterFunction, handleSubmit, refArray) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            e.preventDefault();
            const allFilled = inputsArray.every(val => val !== '');
            if (allFilled) {
                handleSubmit();
            }
        } else if (e.key === 'Backspace') {
            e.preventDefault();
            const newValues = [...inputsArray];
            if (inputsArray[index] === '' && index > 0) {
                newValues[index - 1] = '';
                setterFunction(newValues);
                refArray.current[index - 1]?.focus();
            } else if (inputsArray[index] !== '') {
                newValues[index] = '';
                setterFunction(newValues);
            }
        }
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
            setMessage(`Entre ${gameSettings.digits} chiffres pour le bloc-notes !`);
            return;
        }
        const newEntry = { id: Date.now(), combination: entry, notes: '' };
        setNotepadEntries((prev) => [...prev, newEntry].slice(-50));
        setCurrentNotepadEntry(Array(gameSettings.digits).fill(''));
        notepadInputs.current[0]?.focus();
    };

    const updateNotepadEntry = (id, notes) => {
        setNotepadEntries((prev) => prev.map((entry) => (entry.id === id ? { ...entry, notes } : entry)));
    };

    const deleteNotepadEntry = (id) => {
        setNotepadEntries((prev) => prev.filter((entry) => entry.id !== id));
    };

    const clearNotepad = () => {
        setCurrentNotepadEntry(Array(gameSettings.digits).fill(''));
        notepadInputs.current[0]?.focus();
    };

    const clearAllNotepad = () => {
        setNotepadEntries([]);
        setCurrentNotepadEntry(Array(gameSettings.digits).fill(''));
        notepadInputs.current[0]?.focus();
    };

    const toggleEliminated = (d) => {
        setEliminatedDigits((prev) => {
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
            setErrorMessage(`Entre ${gameSettings.digits} chiffres valides !`);
            setTimeout(() => setErrorMessage(''), 3000);
            return;
        }
        if (!gameSettings.allowDuplicates && new Set(secret.split('')).size !== secret.length) {
            setErrorMessage('Pas de chiffres en double autorisés !');
            setTimeout(() => setErrorMessage(''), 3000);
            return;
        }
        setImReady(true);
        console.log('📤 Envoi du secret:', { player: myPlayerId });
        socket.emit('setSecret', { secret, player: myPlayerId });
        setMessage("En attente de l'autre joueur...");
    };

    const handleGuessSubmit = () => {
        if (!isMyTurn) {
            setMessage('Pas ton tour !');
            return;
        }
        if (isSubmitting) {
            console.log('⚠️ Soumission déjà en cours');
            return;
        }

        const guessStr = guess.join('');
        if (guessStr.length !== gameSettings.digits || !/^\d+$/.test(guessStr)) {
            setErrorMessage(`Entre ${gameSettings.digits} chiffres valides !`);
            setTimeout(() => setErrorMessage(''), 3000);
            return;
        }
        if (!gameSettings.allowDuplicates && new Set(guessStr.split('')).size !== guessStr.length) {
            setErrorMessage('Pas de chiffres en double autorisés !');
            setTimeout(() => setErrorMessage(''), 3000);
            return;
        }

        setIsSubmitting(true);
        console.log('📤 Soumission de la proposition:', { guess: guessStr, player: myPlayerId });
        socket.emit('submitGuess', { guess: guessStr, player: myPlayerId });
        setMessage('En attente de la réponse...');

        submitTimeoutRef.current = setTimeout(() => {
            setIsSubmitting(false);
            setMessage('Timeout - Réessaie ta proposition');
            console.error('⏱️ Timeout de soumission');
        }, 10000);
    };

    const copyRoomLink = () => {
        const link = `${window.location.origin}?room=${roomId}`;
        navigator.clipboard.writeText(link);
        setMessage('Lien copié !');
        setTimeout(() => {
            if (gameState === 'hosting') {
                setMessage(`Salle créée ! Code: ${roomId}`);
            }
        }, 2000);
    };

    const inputFields = (value, onChange, disabled, inputRef, handleSubmit, size = 'large') => {
        const sizeClasses = size === 'small' ? 'w-10 h-10 text-lg' : 'w-12 h-12 text-3xl';
        return (
            <div>
                <div className="flex justify-center gap-2">
                    {Array.from({ length: gameSettings.digits }, (_, i) => (
                        <input
                            key={i}
                            ref={(el) => (inputRef.current[i] = el)}
                            type="text"
                            maxLength={1}
                            value={value[i] || ''}
                            onChange={(e) => onChange(e, i)}
                            onKeyDown={(e) => handleInputKeyDown(e, i, value,
                                (newVal) => {
                                    if (inputRef === secretInputs) setPlayerSecret(newVal);
                                    else if (inputRef === guessInputs) setGuess(newVal);
                                    else setCurrentNotepadEntry(newVal);
                                },
                                handleSubmit,
                                inputRef
                            )}
                            onPaste={(e) => e.preventDefault()}
                            disabled={disabled}
                            className={`${sizeClasses} font-black text-center text-text-color transition-all duration-200 rounded-lg border-3 border-text-color ${disabled ? 'bg-gray-200 cursor-not-allowed' : 'bg-white hover:shadow-sketchy-sm focus:shadow-sketchy focus:-translate-x-[2px] focus:-translate-y-[2px]'}`}
                            aria-label={`Chiffre ${i + 1}`}
                        />
                    ))}
                </div>
                {errorMessage && (inputRef === secretInputs || inputRef === guessInputs) && (
                    <p className="text-red-500 font-bold text-center mt-2 animate-pulse">{errorMessage}</p>
                )}
            </div>
        );
    };

    const getPlayerName = (playerId) => (playerId === 1 ? players.player1 : players.player2);

    const getOpponentName = () => (myPlayerId === 1 ? players.player2 : players.player1);

    const getSortedHistory = (entries, sortMode) => {
        const sorted = [...entries];
        switch (sortMode) {
            case 'recent':
                return sorted.reverse();
            case 'closest':
                return sorted.sort((a, b) => (b.wellPlaced + b.misplaced * 0.5) - (a.wellPlaced + a.misplaced * 0.5));
            case 'wellPlaced':
                return sorted.sort((a, b) => b.wellPlaced - a.wellPlaced);
            default:
                return sorted;
        }
    };

    const renderHistoryGrid = (entries) => (
        <div className="grid grid-cols-4 gap-3">
            {entries.map((entry) => (
                <div key={`${entry.player}-${entry.guess}-${entry.timestamp}`} className="bg-white rounded-lg p-2 text-center border-2 border-text-color shadow-sketchy-sm">
                    <div className="font-mono text-xl font-bold text-text-color mb-1">
                        {entry.guess.split('').map((digit, i) => (
                            <span key={i} className={(entry.wellPlacedDigits || []).includes(i) ? 'text-[var(--green-color)]' : (entry.misplacedDigits || []).includes(i) ? 'text-[var(--accent-color)]' : ''}>
                                {digit}
                            </span>
                        ))}
                    </div>
                    <div className="flex justify-center gap-1 text-xs">
                        <span className="bg-green-200 text-green-800 px-2 py-0.5 rounded font-bold border-2 border-[var(--green-color)]">{entry.wellPlaced}</span>
                        {gameSettings.showMisplaced && (
                            <span className="bg-yellow-200 text-accent-color px-2 py-0.5 rounded font-bold border-2 border-[var(--accent-color)]">{entry.misplaced}</span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );

    const renderHistoryList = (entries) => (
        <div className="space-y-3">
            {entries.map((entry) => (
                <div key={`${entry.player}-${entry.guess}-${entry.timestamp}`} className="bg-white p-3 rounded-xl border-4 border-text-color shadow-sketchy-sm">
                    <div className="flex justify-between items-center">
                        <span className="font-mono text-2xl font-bold text-text-color bg-white px-2 py-1 rounded-lg">
                            {entry.guess.split('').map((digit, i) => (
                                <span key={i} className={(entry.wellPlacedDigits || []).includes(i) ? 'text-[var(--green-color)]' : (entry.misplacedDigits || []).includes(i) ? 'text-[var(--accent-color)]' : ''}>
                                    {digit}
                                </span>
                            ))}
                        </span>
                        <div className="flex gap-2">
                            <span className="bg-green-200 text-green-800 px-3 py-1 rounded-lg text-sm font-bold border-2 border-[var(--green-color)]">{entry.wellPlaced}</span>
                            {gameSettings.showMisplaced && (
                                <span className="bg-yellow-200 text-accent-color px-3 py-1 rounded-lg text-sm font-bold border-2 border-[var(--accent-color)]">{entry.misplaced}</span>
                            )}
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );

    const renderGameSettings = (showUpdateButton = false, isDisabled = false) => (
        <div className="bg-white rounded-2xl p-6 border-4 border-text-color shadow-sketchy mt-6">
            <h3 className="font-black text-2xl mb-4 flex items-center gap-2">
                <FaCog />
                <span>Règles du jeu</span>
            </h3>
            <div className="space-y-4">
                <div className="flex items-center justify-between p-3 border-2 border-text-color rounded-lg">
                    <span className="font-bold text-lg">Nombre de chiffres</span>
                    <select
                        value={gameSettings.digits}
                        onChange={(e) => {
                            const d = parseInt(e.target.value);
                            setGameSettings((prev) => ({ ...prev, digits: d }));
                            resetAllInputs(d);
                        }}
                        disabled={isDisabled}
                        className="font-bold p-2 bg-white border-2 border-text-color rounded-lg focus:shadow-sketchy focus:-translate-x-[2px] focus:-translate-y-[2px]"
                    >
                        <option value={3}>3</option>
                        <option value={4}>4</option>
                        <option value={5}>5</option>
                    </select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {['allowDuplicates', 'showMisplaced', 'showWellPlacedDigits', 'showMisplacedDigits'].map((key) => (
                        <label key={key} className="flex items-center justify-between bg-white rounded-lg p-3 border-2 border-text-color cursor-pointer h-full">
                            <span className="font-bold">
                                {{
                                    allowDuplicates: 'Doublons autorisés',
                                    showMisplaced: 'Afficher mal placés',
                                    showWellPlacedDigits: 'Indices positions (Bien)',
                                    showMisplacedDigits: 'Indices positions (Mal)',
                                }[key]}
                            </span>
                            <input
                                type="checkbox"
                                checked={gameSettings[key]}
                                onChange={(e) => setGameSettings((prev) => ({ ...prev, [key]: e.target.checked }))}
                                disabled={isDisabled}
                                className="w-6 h-6"
                            />
                        </label>
                    ))}
                </div>
                {showUpdateButton && (
                    <button
                        onClick={updateGameSettings}
                        disabled={!hasUnsavedChanges}
                        className={`btn-sketchy w-full p-4 rounded-xl text-xl font-bold transition-all duration-300 ${hasUnsavedChanges ? 'bg-[var(--green-color)] text-white animate-pulse' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                    >
                        Mettre à jour les règles
                    </button>
                )}
            </div>
        </div>
    );
    // ... (le JSX de retour reste identique jusqu'à la fin)

    return (
        <div className="min-h-screen">
            <DoodleMathShapes />

            {!isConnected && (
                <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded-lg border-4 border-text-color shadow-sketchy z-50 font-bold animate-pulse flex items-center gap-2">
                    <FaClock />
                    Connexion...
                </div>
            )}

            <header className="bg-white p-4 top-0 z-10 relative border-b-4 border-text-color shadow-sketchy">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <img src="/logo_mastermind.png" alt="Logo Chiffrio"
                             className="h-16 w-16 object-cover border-2 border-text-color rounded-md" />
                        <h1 className="text-5xl font-black text-text-color">Chiffrio</h1>
                        {roomId && (
                            <div className="bg-[var(--accent-color)] px-4 py-2 rounded-lg border-2 border-text-color">
                                <span className="text-sm font-bold">SALLE: {roomId}</span>
                            </div>
                        )}
                    </div>
                    {(gameState === 'playing' || gameState === 'setup' || gameState === 'won') && (
                        <div className="flex items-center gap-4">
                            <div className="text-right bg-white px-3 py-2 rounded-lg border-2 border-text-color">
                                <div className="text-xs font-bold -mb-1">TON SECRET</div>
                                <div className="text-2xl font-mono font-black">{playerSecret.join('') || Array(gameSettings.digits).fill('?').join('')}</div>
                            </div>
                            <button onClick={handleRestart} className="btn-sketchy bg-[var(--red-color)] text-white px-4 py-2 rounded-xl text-lg flex items-center gap-2">
                                <FaRedo /> Relancer
                            </button>
                        </div>
                    )}
                </div>
            </header>

            <div className="bg-[var(--primary-color)] text-white p-3 relative z-10 border-b-4 border-text-color shadow-sketchy">
                <div className="max-w-7xl mx-auto text-center">
                    <p className="font-bold text-lg text-white">{message}</p>
                </div>
            </div>

            <main className="max-w-7xl mx-auto p-6 relative z-10">
                {gameState === 'home' && (
                    <div className="max-w-md mx-auto mt-12 bg-white rounded-2xl p-8 border-4 border-text-color shadow-sketchy">
                        <h2 className="text-5xl font-black text-center mb-4">Bienvenue !</h2>
                        <div className="text-center bg-[var(--accent-color)]/20 border-2 border-text-color rounded-lg p-4 mb-6">
                            <h3 className="font-bold text-lg mb-1">But du jeu :</h3>
                            <p>Devinez le code secret de votre adversaire avant qu'il ne trouve le vôtre. À chaque tour, faites une proposition et utilisez les indices (chiffres bien ou mal placés) pour déduire la bonne combinaison.</p>
                        </div>
                        <input
                            type="text"
                            value={pseudo}
                            onChange={(e) => setPseudo(e.target.value)}
                            placeholder="Ton pseudo..."
                            maxLength={20}
                            className="w-full p-4 text-center text-xl font-bold rounded-lg border-3 border-text-color focus:shadow-sketchy focus:-translate-x-[2px] focus:-translate-y-[2px]"
                            aria-label="Pseudo"
                        />
                        <div className="grid grid-cols-2 gap-4 mt-6">
                            <button
                                onClick={() => {
                                    if (pseudo.trim()?.length >= 2) setGameState('createSettings');
                                    else setMessage('Choisis un pseudo valide !');
                                }}
                                disabled={!isConnected}
                                className="btn-sketchy bg-[var(--primary-color)] text-white p-4 rounded-xl text-xl disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                                Créer une partie
                            </button>
                            <button
                                onClick={() => {
                                    if (pseudo.trim()?.length >= 2) setGameState('joinInput');
                                    else setMessage('Choisis un pseudo valide !');
                                }}
                                disabled={!isConnected}
                                className="btn-sketchy bg-[var(--accent-color)] text-text-color p-4 rounded-xl text-xl disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                                Rejoindre
                            </button>
                        </div>
                    </div>
                )}

                {gameState === 'createSettings' && (
                    <div className="max-w-xl mx-auto mt-10 bg-white rounded-2xl p-8 border-4 border-text-color shadow-sketchy">
                        <h2 className="text-4xl font-black text-center mb-6">Configurer la partie</h2>
                        {renderGameSettings(false, false)}
                        <button onClick={createRoom} className="btn-sketchy w-full bg-[var(--green-color)] text-white p-4 rounded-xl text-xl mt-6">
                            C'est parti !
                        </button>
                    </div>
                )}

                {gameState === 'joinInput' && (
                    <div className="max-w-md mx-auto mt-20 bg-white rounded-2xl p-8 border-4 border-text-color shadow-sketchy">
                        <h2 className="text-4xl font-black text-center mb-4">Rejoindre une partie</h2>
                        <input
                            type="text"
                            value={roomId}
                            onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                            placeholder="CODE DE LA SALLE"
                            className="w-full p-4 text-center font-mono text-3xl font-black tracking-widest rounded-lg border-3 border-text-color focus:shadow-sketchy focus:-translate-x-[2px] focus:-translate-y-[2px]"
                            maxLength={6}
                            aria-label="Code de la salle"
                        />
                        <button onClick={joinRoom} className="btn-sketchy w-full bg-[var(--accent-color)] text-text-color p-4 rounded-xl text-xl mt-6">
                            Rejoindre
                        </button>
                    </div>
                )}

                {gameState === 'hosting' && (
                    <div className="max-w-md mx-auto mt-10 bg-white rounded-2xl p-8 border-4 border-text-color shadow-sketchy text-center">
                        <div className="text-8xl mb-4 animate-pulse flex justify-center">
                            <FaClock />
                        </div>
                        <h2 className="text-4xl font-black mb-4">En attente...</h2>
                        <div className="bg-[var(--accent-color)]/20 rounded-lg p-4 mb-6 border-2 border-text-color">
                            <p className="text-sm font-bold mb-1">Code de la salle</p>
                            <p className="text-5xl font-black tracking-wider font-mono">{roomId}</p>
                        </div>
                        {renderGameSettings(true, false)}
                        <button
                            onClick={copyRoomLink}
                            className="btn-sketchy bg-[var(--primary-color)] text-white px-8 py-4 rounded-xl text-lg mt-2 flex items-center justify-center gap-2 mx-auto"
                        >
                            <FaLink /> Copier le lien
                        </button>
                    </div>
                )}

                {gameState === 'setup' && (
                    <div className="max-w-3xl mx-auto mt-8 bg-white rounded-2xl p-8 border-4 border-text-color shadow-sketchy text-center">
                        <h2 className="text-5xl font-black mb-4">🤫 Ton code secret !</h2>
                        <p className="font-bold mb-6">{getOpponentName() ? `${getOpponentName()} attend...` : "En attente de l'autre joueur..."}</p>
                        {myPlayerId === 1 && renderGameSettings(true, false)}
                        {myPlayerId !== 1 && renderGameSettings(false, true)}
                        <div className="mb-8 mt-8">{inputFields(playerSecret, handleSecretInputChange, imReady, secretInputs, handleSecretSubmit)}</div>
                        <button
                            onClick={handleSecretSubmit}
                            disabled={imReady}
                            className={`btn-sketchy px-12 py-4 rounded-xl text-2xl flex items-center justify-center gap-2 mx-auto ${imReady ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-[var(--green-color)] text-white'}`}
                        >
                            {imReady ? (
                                <>
                                    <FaCheck /> VALIDÉ
                                </>
                            ) : (
                                <>
                                    <FaLock /> Valider
                                </>
                            )}
                        </button>
                        {imReady && (
                            <p className="font-bold mt-4 animate-pulse">
                                En attente de {getOpponentName()}...
                            </p>
                        )}
                    </div>
                )}

                {gameState === 'playing' && (
                    <div className="grid grid-cols-5 gap-6 mt-6">
                        <div className="col-span-1 bg-white rounded-2xl p-4 border-4 border-text-color shadow-sketchy">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="font-black text-2xl flex items-center gap-2">
                                    <FaStickyNote />
                                    <span>Bloc-notes</span>
                                </h3>
                                <button
                                    onClick={clearAllNotepad}
                                    className="btn-sketchy text-xs bg-[var(--red-color)] text-white rounded-lg p-1.5 flex items-center gap-1"
                                >
                                    <FaTrash /> Tout Vider
                                </button>
                            </div>
                            <div className="mb-2">{inputFields(currentNotepadEntry, handleNotepadInputChange, false, notepadInputs, addNotepadEntry, 'small')}</div>
                            <div className="flex gap-2 mb-4">
                                <button
                                    onClick={addNotepadEntry}
                                    disabled={currentNotepadEntry.join('').length !== gameSettings.digits}
                                    className="btn-sketchy flex-1 text-xs bg-[var(--green-color)] text-white rounded-lg p-1.5 disabled:bg-gray-300 disabled:text-gray-500 flex items-center justify-center gap-1"
                                >
                                    <FaPlus /> Ajouter
                                </button>
                                <button
                                    onClick={clearNotepad}
                                    className="btn-sketchy text-xs bg-[var(--primary-color)] text-white rounded-lg p-1.5 flex items-center justify-center gap-1"
                                >
                                    <FaTrash /> Effacer
                                </button>
                            </div>
                            <div className="space-y-2 max-h-[calc(100vh-500px)] overflow-y-auto pr-2">
                                {notepadEntries.length === 0 ? (
                                    <div className="text-center py-4">
                                        <div className="text-5xl mb-2 opacity-50 flex justify-center">
                                            <FaPencilAlt />
                                        </div>
                                        <p className="font-bold text-sm">Aucune combinaison testée</p>
                                    </div>
                                ) : (
                                    notepadEntries.map((entry) => (
                                        <div key={entry.id} className="bg-white border-2 border-text-color rounded-lg p-2">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="font-mono text-lg font-bold">{entry.combination}</span>
                                                <button
                                                    onClick={() => deleteNotepadEntry(entry.id)}
                                                    className="text-red-500 font-black flex items-center gap-1"
                                                >
                                                    <FaTimes />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <FaPencilAlt className="w-4 h-4 text-primary-color" />
                                                <input
                                                    type="text"
                                                    value={entry.notes}
                                                    onChange={(e) => updateNotepadEntry(entry.id, e.target.value)}
                                                    placeholder="Notes..."
                                                    className="w-full text-xs p-1 border-2 border-text-color rounded-lg focus:shadow-sketchy focus:-translate-x-[2px] focus:-translate-y-[2px]"
                                                    aria-label="Notes pour la combinaison"
                                                />
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                            <div className="mt-4 pt-4 border-t-4 border-dashed border-text-color">
                                <h3 className="font-black text-lg mb-2">Chiffres éliminés</h3>
                                <div className="grid grid-cols-5 gap-1">
                                    {[...Array(10).keys()].map((d) => (
                                        <button
                                            key={d}
                                            onClick={() => toggleEliminated(d)}
                                            className={`w-full h-10 rounded-lg font-black text-xl border-2 border-text-color ${eliminatedDigits.has(d) ? 'bg-[var(--red-color)] text-white line-through' : 'bg-white'}`}
                                            aria-label={`Chiffre ${d} éliminé`}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="col-span-2 bg-white rounded-2xl p-8 border-4 border-text-color shadow-sketchy text-center">
                            <h2 className="text-4xl font-black mb-4 flex items-center justify-center gap-2">
                                {isMyTurn ? (
                                    <>
                                        <FaBullseye /> À TOI !
                                    </>
                                ) : (
                                    <>
                                        <FaClock /> TOUR DE {getOpponentName()?.toUpperCase()}
                                    </>
                                )}
                            </h2>
                            <div className="flex justify-center items-center gap-4 mb-8">
                                <div className={`px-4 py-2 rounded-lg border-2 border-text-color transition-all ${currentPlayer === 1 ? 'bg-[var(--accent-color)] shadow-sketchy-sm' : ''}`}>
                                    <span className="font-bold">{players.player1}</span>
                                </div>
                                <span className="font-black text-2xl">VS</span>
                                <div className={`px-4 py-2 rounded-lg border-2 border-text-color transition-all ${currentPlayer === 2 ? 'bg-[var(--accent-color)] shadow-sketchy-sm' : ''}`}>
                                    <span className="font-bold">{players.player2}</span>
                                </div>
                            </div>
                            <div className="mb-8">{inputFields(guess, handleGuessInputChange, !isMyTurn || isSubmitting, guessInputs, handleGuessSubmit)}</div>
                            <button
                                onClick={handleGuessSubmit}
                                disabled={!isMyTurn || isSubmitting}
                                className={`btn-sketchy w-full p-4 rounded-xl text-2xl ${!isMyTurn || isSubmitting ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-[var(--primary-color)] text-white'}`}
                            >
                                🚀 PROPOSER
                            </button>
                        </div>

                        <div className="col-span-2 bg-white rounded-2xl p-6 border-4 border-text-color shadow-sketchy">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-3xl font-black flex items-center gap-2">
                                    <FaHistory />
                                    <span>Ton Historique</span>
                                </h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setHistoryViewMode((v) => (v === 'grid' ? 'list' : 'grid'))}
                                        className="btn-sketchy bg-white p-2 rounded-lg border-2 border-text-color"
                                        aria-label="Changer le mode d'affichage de l'historique"
                                    >
                                        {historyViewMode === 'grid' ? <FaList /> : <FaThLarge />}
                                    </button>
                                    <select
                                        value={historySortMode}
                                        onChange={(e) => setHistorySortMode(e.target.value)}
                                        className="font-bold p-2 bg-white border-2 border-text-color rounded-lg focus:shadow-sketchy focus:-translate-x-[2px] focus:-translate-y-[2px]"
                                        aria-label="Trier l'historique"
                                    >
                                        <option value="recent">Récent</option>
                                        <option value="closest">Plus proche</option>
                                        <option value="wellPlaced">Bien placés</option>
                                    </select>
                                </div>
                            </div>
                            <div className="max-h-[calc(100vh-450px)] overflow-y-auto pr-2">
                                {history.filter((h) => h.player === myPlayerId).length === 0 ? (
                                    <div className="text-center py-8">
                                        <div className="text-5xl mb-2 opacity-50 flex justify-center">
                                            <FaPencilAlt />
                                        </div>
                                        <p className="font-bold">Aucune proposition...</p>
                                    </div>
                                ) : (
                                    historyViewMode === 'grid' ? (
                                        renderHistoryGrid(getSortedHistory(history.filter((h) => h.player === myPlayerId), historySortMode))
                                    ) : (
                                        renderHistoryList(getSortedHistory(history.filter((h) => h.player === myPlayerId), historySortMode))
                                    )
                                )}
                            </div>
                            <div className="mt-4 pt-4 border-t-4 border-dashed border-text-color">
                                <h4 className="font-bold text-primary-color mb-2 text-center">
                                    👁️ Vues chez {getOpponentName() || 'l\'adversaire'}
                                </h4>
                                <div className="grid grid-cols-4 gap-2">
                                    {history
                                        .filter((h) => h.player !== myPlayerId)
                                        .slice(-12)
                                        .map((entry) => (
                                            <div key={`${entry.player}-${entry.guess}-${entry.timestamp}`} className="bg-white rounded-lg p-1 text-center border-2 border-text-color">
                                                <div className="font-mono text-sm font-bold">
                                                    {entry.guess.split('').map((digit, i) => (
                                                        <span
                                                            key={i}
                                                            className={(entry.wellPlacedDigits || []).includes(i) ? 'text-[var(--green-color)]' : (entry.misplacedDigits || []).includes(i) ? 'text-[var(--accent-color)]' : ''}
                                                        >
                                                            {digit}
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="flex justify-center gap-1 text-xs">
                                                    <span className="bg-green-200 text-green-800 px-1 rounded font-bold">{entry.wellPlaced}</span>
                                                    {gameSettings.showMisplaced && (
                                                        <span className="bg-yellow-200 text-accent-color px-1 rounded font-bold">{entry.misplaced}</span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {gameState === 'won' && (
                    <div className="max-w-lg mx-auto mt-12 bg-white rounded-2xl p-12 border-4 border-text-color shadow-sketchy text-center">
                        <div className="text-8xl mb-4 text-[var(--accent-color)] flex justify-center">
                            <FaTrophy />
                        </div>
                        <h2 className="text-6xl font-black mb-6">GAGNÉ !</h2>
                        <p className="font-bold text-lg mb-8">{message}</p>
                        <div className="flex gap-4">
                            <button onClick={handleRestart} className="btn-sketchy flex-1 bg-[var(--accent-color)] text-text-color p-4 rounded-xl text-xl">
                                Relancer
                            </button>
                            <button
                                onClick={endGameAndNewRoom}
                                className="btn-sketchy flex-1 bg-[var(--primary-color)] text-white p-4 rounded-xl text-xl"
                            >
                                Nouvelle Partie
                            </button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;