import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

function App() {
  // États du jeu
  const [gameState, setGameState] = useState('lobby'); // lobby, hosting, joining, setup, playing, won
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
  const [opponentReady, setOpponentReady] = useState(false);
  const [imReady, setImReady] = useState(false);

  // Socket réel avec ton backend
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // Connexion socket réelle
    const newSocket = io('http://localhost:3001');
    setSocket(newSocket);

    // ✅ Gestion directe des événements sans passer par handleSocketEvent
    newSocket.on('roomCreated', (data) => {
      console.log('Room created:', data);
      setRoomId(data.roomId);
      setGameState('hosting');
      setMessage(`🎉 Salle créée ! Code: ${data.roomId}`);
      setPlayers({ player1: pseudo, player2: '' });
      setMyPlayerId(1);
    });

    newSocket.on('roomJoined', (data) => {
      console.log('Room joined:', data);
      setRoomId(data.roomId);
      setGameState('setup');
      setPlayers(data.players);
      setMessage('✨ Connecté ! Choisis ton nombre secret.');
      setMyPlayerId(2);
    });

    newSocket.on('playerJoined', (data) => {
      console.log('Player joined:', data);
      setPlayers(data.players);
      setMessage('🚀 Joueur 2 connecté ! Choisissez vos nombres secrets.');
      setGameState('setup');
    });

    newSocket.on('secretSet', (data) => {
      console.log('Secret set:', data);
      setOpponentReady(true);
      if (imReady) {
        newSocket.emit('checkGameStart', { roomId });
      }
    });

    newSocket.on('gameStart', () => {
      console.log('Game started');
      setGameState('playing');
      setCurrentPlayer(1); // ✅ Le joueur 1 commence toujours
      setMessage(`🎮 C'est parti ! Au tour du Joueur 1`);
    });

    newSocket.on('feedback', (data) => {
      console.log('Feedback received:', data);
      const newEntry = {
        guess: data.guess,
        player: data.player,
        wellPlaced: data.feedback.wellPlaced,
        misplaced: data.feedback.misplaced
      };
      setHistory(prev => [...prev, newEntry]);

      if (data.feedback.wellPlaced === gameSettings.digits) {
        setGameState('won');
        setMessage(`🏆 Joueur ${data.player} a gagné ! Félicitations !`);
      } else {
        const nextPlayer = data.player === 1 ? 2 : 1;
        setCurrentPlayer(nextPlayer);
        setMessage(`🎯 Au tour du Joueur ${nextPlayer}`);
        setGuess(['', '', '', '']);
      }
    });

    newSocket.on('error', (error) => {
      console.log('Socket error:', error);
      setMessage(`❌ ${error}`);
    });

    return () => newSocket.close();
  }, [pseudo]); // ✅ Ne dépend que de pseudo

  // ✅ Effet séparé pour gérer roomId dans secretSet
  useEffect(() => {
    if (socket && imReady && opponentReady && roomId) {
      socket.emit('checkGameStart', { roomId });
    }
  }, [socket, imReady, opponentReady, roomId]);

  // ✅ Calcul automatique de isMyTurn quand currentPlayer ou myPlayerId changent
  useEffect(() => {
    const newIsMyTurn = myPlayerId === currentPlayer;
    setIsMyTurn(newIsMyTurn);
    console.log(`Player ${myPlayerId}: currentPlayer=${currentPlayer}, isMyTurn=${newIsMyTurn}`);
  }, [currentPlayer, myPlayerId]);

  const createRoom = () => {
    if (!pseudo.trim()) {
      setMessage('❌ Choisis un pseudo d\'abord !');
      return;
    }
    socket?.emit('createRoom', { pseudo: pseudo.trim() });
  };

  const joinRoom = () => {
    if (!pseudo.trim() || !roomId.trim()) {
      setMessage('❌ Remplis tous les champs !');
      return;
    }
    socket?.emit('joinRoom', { pseudo: pseudo.trim(), roomId: roomId.trim() });
  };

  const handleSecretInputChange = (e, index) => {
    const value = e.target.value.replace(/\D/g, '').slice(-1);
    const newSecret = [...playerSecret];
    newSecret[index] = value;
    setPlayerSecret(newSecret);

    // Focus automatique sur le champ suivant
    if (value && index < gameSettings.digits - 1) {
      const nextInput = document.querySelector(`input[data-index="${index + 1}"]`);
      nextInput?.focus();
    }
  };

  const handleGuessInputChange = (e, index) => {
    const value = e.target.value.replace(/\D/g, '').slice(-1);
    const newGuess = [...guess];
    newGuess[index] = value;
    setGuess(newGuess);

    // Focus automatique sur le champ suivant
    if (value && index < gameSettings.digits - 1) {
      const nextInput = document.querySelector(`input[data-guess-index="${index + 1}"]`);
      nextInput?.focus();
    }
  };

  const handleSecretSubmit = () => {
    const secret = playerSecret.join('');
    if (secret.length !== gameSettings.digits || !/^\d+$/.test(secret)) {
      setMessage(`❌ Entre ${gameSettings.digits} chiffres valides !`);
      return;
    }

    // Vérification des doublons si pas autorisés
    if (!gameSettings.allowDuplicates && new Set(secret.split('')).size !== secret.length) {
      setMessage('❌ Pas de chiffres en double autorisés !');
      return;
    }

    setImReady(true);
    socket?.emit('setSecret', { secret, player: myPlayerId });
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

    socket?.emit('submitGuess', { guess: guessStr, player: myPlayerId });
    setMessage('⏳ En attente de la réponse...');
  };

  const handleReset = () => {
    setGameState('lobby');
    setPseudo('');
    setRoomId('');
    setPlayers({ player1: '', player2: '' });
    setHistory([]);
    setMessage('Bienvenue dans Chiffrio ! 🎉');
    setPlayerSecret(['', '', '', '']);
    setGuess(['', '', '', '']);
    setCurrentPlayer(1);
    setIsMyTurn(false);
    setOpponentReady(false);
    setImReady(false);
  };

  const copyRoomLink = () => {
    const link = `${window.location.origin}?room=${roomId}`;
    navigator.clipboard.writeText(link);
    // ✅ Ne pas changer le message, ça empêche le changement d'état
    // setMessage('📋 Lien copié ! Envoie-le à ton ami !');

    // ✅ Afficher un message temporaire sans changer l'état
    const originalMessage = message;
    setMessage('📋 Lien copié ! Envoie-le à ton ami !');
    setTimeout(() => {
      if (gameState === 'hosting') {
        setMessage(`🎉 Salle créée ! Code: ${roomId}`);
      }
    }, 2000);
  };

  const inputFields = (value, onChange, disabled, dataPrefix = '') => (
      <div className="flex justify-center space-x-3 mb-6">
        {Array.from({ length: gameSettings.digits }, (_, i) => (
            <input
                key={i}
                type="text"
                maxLength={1}
                value={value[i] || ''}
                onChange={(e) => onChange(e, i)}
                disabled={disabled}
                data-index={dataPrefix ? undefined : i}
                data-guess-index={dataPrefix ? i : undefined}
                className="w-16 h-16 border-4 border-purple-300 rounded-2xl text-3xl font-bold text-center bg-white focus:outline-none focus:ring-4 focus:ring-yellow-400 focus:border-yellow-400 text-purple-700 transition-all duration-200 transform focus:scale-105"
            />
        ))}
      </div>
  );

  return (
      <div className="min-h-screen bg-gradient-to-br from-pink-200 via-purple-200 to-indigo-200 p-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 mb-4 drop-shadow-lg">
              CHIFFRIO 🎯
            </h1>
            <div className="bg-white/80 backdrop-blur-sm rounded-3xl p-6 shadow-xl border-4 border-purple-300">
              <p className="text-2xl font-bold text-purple-700 flex items-center justify-center gap-2">
                <span className="text-3xl">💬</span>
                {message}
              </p>
            </div>
          </div>

          {/* Lobby */}
          {gameState === 'lobby' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Créer une partie */}
                <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border-4 border-purple-300 transform hover:scale-105 transition-transform duration-200">
                  <div className="text-center mb-6">
                    <div className="text-6xl mb-4">👑</div>
                    <h2 className="text-3xl font-black text-purple-700 mb-2">CRÉER UNE PARTIE</h2>
                    <p className="text-purple-600 font-semibold">Deviens l'hôte et invite tes amis !</p>
                  </div>

                  <div className="space-y-4">
                    <input
                        type="text"
                        value={pseudo}
                        onChange={(e) => setPseudo(e.target.value)}
                        placeholder="Ton pseudo... 🎭"
                        className="w-full p-4 border-3 border-purple-300 rounded-2xl text-xl font-semibold bg-white focus:outline-none focus:ring-4 focus:ring-yellow-400 focus:border-yellow-400 text-purple-700"
                    />

                    {/* Options de jeu */}
                    <div className="bg-purple-50 rounded-2xl p-4 border-2 border-purple-200">
                      <h3 className="font-bold text-purple-700 mb-3">⚙️ Options</h3>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2">
                          <input
                              type="checkbox"
                              checked={gameSettings.allowDuplicates}
                              onChange={(e) => setGameSettings(prev => ({ ...prev, allowDuplicates: e.target.checked }))}
                              className="w-5 h-5 rounded"
                          />
                          <span className="text-purple-600 font-semibold">Chiffres en double autorisés</span>
                        </label>
                        <label className="flex items-center gap-2">
                          <input
                              type="checkbox"
                              checked={gameSettings.showMisplaced}
                              onChange={(e) => setGameSettings(prev => ({ ...prev, showMisplaced: e.target.checked }))}
                              className="w-5 h-5 rounded"
                          />
                          <span className="text-purple-600 font-semibold">Montrer les mal placés</span>
                        </label>
                      </div>
                    </div>

                    <button
                        onClick={createRoom}
                        className="w-full bg-gradient-to-r from-purple-500 to-purple-600 text-white p-4 rounded-2xl text-xl font-black hover:from-purple-600 hover:to-purple-700 transition-all duration-200 transform hover:scale-105 shadow-lg cursor-pointer"
                    >
                      🚀 CRÉER LA PARTIE
                    </button>
                  </div>
                </div>

                {/* Rejoindre une partie */}
                <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border-4 border-yellow-300 transform hover:scale-105 transition-transform duration-200">
                  <div className="text-center mb-6">
                    <div className="text-6xl mb-4">🎮</div>
                    <h2 className="text-3xl font-black text-yellow-700 mb-2">REJOINDRE UNE PARTIE</h2>
                    <p className="text-yellow-600 font-semibold">Entre le code d'invitation !</p>
                  </div>

                  <div className="space-y-4">
                    <input
                        type="text"
                        value={pseudo}
                        onChange={(e) => setPseudo(e.target.value)}
                        placeholder="Ton pseudo... 🎭"
                        className="w-full p-4 border-3 border-yellow-300 rounded-2xl text-xl font-semibold bg-white focus:outline-none focus:ring-4 focus:ring-orange-400 focus:border-orange-400 text-yellow-700"
                    />
                    <input
                        type="text"
                        value={roomId}
                        onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                        placeholder="Code de la salle... 🔑"
                        className="w-full p-4 border-3 border-yellow-300 rounded-2xl text-xl font-semibold bg-white focus:outline-none focus:ring-4 focus:ring-orange-400 focus:border-orange-400 text-yellow-700 text-center"
                        maxLength={6}
                    />
                    <button
                        onClick={joinRoom}
                        className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-white p-4 rounded-2xl text-xl font-black hover:from-yellow-600 hover:to-orange-600 transition-all duration-200 transform hover:scale-105 shadow-lg cursor-pointer"
                    >
                      🎯 REJOINDRE
                    </button>
                  </div>
                </div>
              </div>
          )}

          {/* En attente */}
          {gameState === 'hosting' && (
              <div className="text-center">
                <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border-4 border-green-300 inline-block">
                  <div className="text-6xl mb-4">⏳</div>
                  <h2 className="text-3xl font-black text-green-700 mb-4">SALLE CRÉÉE !</h2>
                  <p className="text-lg font-semibold text-green-600 mb-6">Code: <span className="text-3xl font-black text-green-800">{roomId}</span></p>
                  <button
                      onClick={copyRoomLink}
                      className="bg-gradient-to-r from-green-500 to-green-600 text-white px-6 py-3 rounded-2xl font-black hover:from-green-600 hover:to-green-700 transition-all duration-200 transform hover:scale-105 cursor-pointer"
                  >
                    📋 COPIER LE LIEN
                  </button>
                </div>
              </div>
          )}

          {gameState === 'joining' && (
              <div className="text-center">
                <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border-4 border-blue-300 inline-block">
                  <div className="text-6xl mb-4">🤝</div>
                  <h2 className="text-3xl font-black text-blue-700 mb-4">CONNEXION RÉUSSIE !</h2>
                  <div className="space-y-2">
                    <p className="text-xl font-bold text-blue-600">Joueur 1: {players.player1}</p>
                    <p className="text-xl font-bold text-blue-600">Joueur 2: {players.player2}</p>
                  </div>
                </div>
              </div>
          )}

          {/* Configuration des nombres secrets */}
          {gameState === 'setup' && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border-4 border-indigo-300">
                  <div className="text-center mb-6">
                    <div className="text-6xl mb-4">🤫</div>
                    <h2 className="text-3xl font-black text-indigo-700 mb-4">TON NOMBRE SECRET</h2>
                    {playerSecret.join('') && (
                        <div className="text-4xl font-black text-indigo-600 bg-indigo-50 rounded-2xl p-4 border-2 border-indigo-200">
                          {playerSecret.join('') || '****'}
                        </div>
                    )}
                  </div>
                </div>

                <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border-4 border-pink-300">
                  <div className="text-center">
                    <div className="text-6xl mb-4">🎯</div>
                    <h2 className="text-3xl font-black text-pink-700 mb-6">CHOISIS TON NOMBRE</h2>
                    {inputFields(playerSecret, handleSecretInputChange, false)}
                    <button
                        onClick={handleSecretSubmit}
                        disabled={imReady}
                        className={`w-full p-4 rounded-2xl text-xl font-black transition-all duration-200 transform hover:scale-105 shadow-lg ${
                            imReady
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-gradient-to-r from-pink-500 to-pink-600 text-white hover:from-pink-600 hover:to-pink-700 cursor-pointer'
                        }`}
                    >
                      {imReady ? '✅ NOMBRE VALIDÉ' : '🔒 VALIDER'}
                    </button>
                  </div>
                </div>
              </div>
          )}

          {/* Jeu en cours */}
          {gameState === 'playing' && (
              <div className="space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Mon nombre secret */}
                  <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-6 shadow-2xl border-4 border-indigo-300">
                    <div className="text-center">
                      <h3 className="text-2xl font-black text-indigo-700 mb-4">🤫 MON SECRET</h3>
                      <div className="text-4xl font-black text-indigo-600 bg-indigo-50 rounded-2xl p-4 border-2 border-indigo-200">
                        {playerSecret.join('')}
                      </div>
                    </div>
                  </div>

                  {/* Proposition */}
                  <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-6 shadow-2xl border-4 border-green-300">
                    <div className="text-center">
                      <h3 className="text-2xl font-black text-green-700 mb-4">
                        {isMyTurn ? '🎯 TON TOUR' : '⏳ ATTENDS...'}
                      </h3>
                      {inputFields(guess, handleGuessInputChange, !isMyTurn, 'guess')}
                      <button
                          onClick={handleGuessSubmit}
                          disabled={!isMyTurn}
                          className={`w-full p-4 rounded-2xl text-xl font-black transition-all duration-200 transform hover:scale-105 shadow-lg ${
                              !isMyTurn
                                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                  : 'bg-gradient-to-r from-green-500 to-green-600 text-white hover:from-green-600 hover:to-green-700 cursor-pointer'
                          }`}
                      >
                        {isMyTurn ? '🚀 PROPOSER' : '⏳ PAS TON TOUR'}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Historique */}
                <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-8 shadow-2xl border-4 border-purple-300">
                  <h3 className="text-3xl font-black text-purple-700 mb-6 text-center">📜 HISTORIQUE</h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {history.length === 0 ? (
                        <p className="text-center text-purple-600 font-semibold text-xl">Aucune proposition pour l'instant...</p>
                    ) : (
                        history.map((entry, index) => (
                            <div
                                key={index}
                                className={`p-4 rounded-2xl shadow-lg border-3 transform hover:scale-102 transition-all duration-200 ${
                                    entry.player === 1
                                        ? 'bg-blue-50 border-blue-300 text-blue-800'
                                        : 'bg-pink-50 border-pink-300 text-pink-800'
                                }`}
                            >
                              <div className="flex justify-between items-center">
                        <span className="text-xl font-black">
                          Joueur {entry.player}: {entry.guess}
                        </span>
                                <div className="flex gap-4">
                          <span className="bg-green-200 text-green-800 px-3 py-1 rounded-full font-bold">
                            ✅ {entry.wellPlaced} bien
                          </span>
                                  {gameSettings.showMisplaced && (
                                      <span className="bg-orange-200 text-orange-800 px-3 py-1 rounded-full font-bold">
                              🔄 {entry.misplaced} mal
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
          )}

          {/* Victoire */}
          {gameState === 'won' && (
              <div className="text-center">
                <div className="bg-white/90 backdrop-blur-sm rounded-3xl p-12 shadow-2xl border-4 border-yellow-400 inline-block">
                  <div className="text-8xl mb-6">🏆</div>
                  <h2 className="text-4xl font-black text-yellow-600 mb-6">PARTIE TERMINÉE !</h2>
                  <button
                      onClick={handleReset}
                      className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white px-8 py-4 rounded-2xl text-2xl font-black hover:from-yellow-600 hover:to-orange-600 transition-all duration-200 transform hover:scale-105 shadow-lg cursor-pointer"
                  >
                    🔄 REJOUER
                  </button>
                </div>
              </div>
          )}
        </div>
      </div>
  );
}

export default App;