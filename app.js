let playerId = null;
let roomCode = null;
let isHost = false;
let myRole = null;
let selectedTarget = null;
let currentScreen = 'home';
let roomState = null;
let eventSource = null;
let hostActionType = null;
let spyCustomLocationsDraft = '';
let aliasCustomWordsDraft = '';
let aliasCountdownInterval = null;
let aliasAutoEndRequested = false;

const ROLE_NAMES = {
  mafia: 'Мафия',
  don: 'Дон',
  doctor: 'Доктор',
  sheriff: 'Шериф',
  civilian: 'Мирный',
  maniac: 'Маньяк',
  prostitute: 'Путана',
  spy: 'Шпион',
  agent: 'Агент'
};

const GAME_NAMES = {
  mafia: 'Мафия',
  spy: 'Шпион',
  alias: 'Элиас',
  bunker: 'Бункер'
};

const MIN_PLAYERS = {
  mafia: 4,
  spy: 3,
  alias: 2,
  bunker: 3
};

function api(path, body) {
  return fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }).then(r => r.json());
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._timeout);
  el._timeout = setTimeout(() => el.classList.add('hidden'), 3000);
}

function getSpyCustomLocationsValue() {
  const input = document.getElementById('spy-custom-locations-input');
  if (input) {
    spyCustomLocationsDraft = String(input.value || '').slice(0, 240);
  }
  return spyCustomLocationsDraft;
}

function getAliasCustomWordsValue() {
  const input = document.getElementById('alias-custom-words-input');
  if (input) {
    aliasCustomWordsDraft = String(input.value || '').slice(0, 400);
  }
  return aliasCustomWordsDraft;
}

function clearAliasCountdown() {
  if (aliasCountdownInterval) {
    clearInterval(aliasCountdownInterval);
    aliasCountdownInterval = null;
  }
}

function formatAliasTime(msLeft) {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, '0');
  return minutes + ':' + seconds;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  currentScreen = id;
}

function connectSSE() {
  if (eventSource) eventSource.close();
  if (!roomCode) return;
  eventSource = new EventSource('/api/stream?room=' + roomCode + '&player=' + playerId);
  eventSource.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'room_closed') {
      showToast('Хост закрыл комнату');
      goHome();
      return;
    }
    if (msg.type === 'state_update') {
      roomState = msg.room;
      myRole = roomState.players[playerId]?.role ?? null;
      isHost = roomState.hostId === playerId;

      if (roomState.status === 'waiting' || roomState.phase === 'lobby') {
        clearAliasCountdown();
        hostActionType = null;
        selectedTarget = null;
        window._lobbyReturnTimer = null;
        document.getElementById('room-code-label').textContent = roomState.code;
        showScreen('screen-lobby');
        renderLobby(roomState);
      } else if (roomState.status === 'playing' || roomState.status === 'ended') {
        if (roomState.game === 'spy') {
          clearAliasCountdown();
          if (currentScreen !== 'screen-game-spy') showScreen('screen-game-spy');
          renderSpyGame(roomState);
        } else if (roomState.game === 'alias') {
          if (currentScreen !== 'screen-game-alias') showScreen('screen-game-alias');
          renderAliasGame(roomState);
        } else if (roomState.game === 'bunker') {
          clearAliasCountdown();
          if (currentScreen !== 'screen-game-bunker') showScreen('screen-game-bunker');
          renderBunkerGame(roomState);
        } else {
          clearAliasCountdown();
          if (currentScreen !== 'screen-game-mafia') showScreen('screen-game-mafia');
          renderMafiaGame(roomState);
        }
      }
    }
  };
  eventSource.onerror = () => {
    if (eventSource.readyState === EventSource.CLOSED) {
      showToast('Потеря соединения. Попробуй переподключиться');
      setTimeout(() => {
        if (localStorage.getItem('bunker_room') && localStorage.getItem('bunker_name')) {
          document.getElementById('reconnect-btn')?.classList.remove('hidden');
        }
      }, 1000);
    }
  };
}

window.reconnect = async () => {
  const code = localStorage.getItem('bunker_room');
  const name = localStorage.getItem('bunker_name');
  if (!code || !name) { showToast('Нет данных для переподключения'); return; }
  showToast('Переподключаюсь...');
  const res = await api('/api/rejoin', { code, name });
  if (res.type === 'error') { showToast(res.message); return; }
  playerId = res.playerId;
  roomCode = code;
  isHost = res.room.hostId === playerId;
  roomState = res.room;
  myRole = null;
  if (eventSource) eventSource.close();
  document.getElementById('room-code-label').textContent = code;
  if (res.room.status === 'waiting' || res.room.phase === 'lobby') {
    showScreen('screen-lobby');
    renderLobby(res.room);
  } else {
    showScreen('screen-game-mafia');
    renderMafiaGame(res.room);
  }
  connectSSE();
};

window.showCreateRoom = () => {
  document.getElementById('create-room-form').classList.remove('hidden');
  document.querySelector('.home-actions').classList.add('hidden');
};
window.hideCreateRoom = () => {
  document.getElementById('create-room-form').classList.add('hidden');
  document.querySelector('.home-actions').classList.remove('hidden');
};
window.showJoinRoom = () => {
  document.getElementById('join-room-form').classList.remove('hidden');
  document.querySelector('.home-actions').classList.add('hidden');
};
window.hideJoinRoom = () => {
  document.getElementById('join-room-form').classList.add('hidden');
  document.querySelector('.home-actions').classList.remove('hidden');
};

window.pickGame = (game) => {
  const value = game === 'spy' ? 'spy' : game === 'alias' ? 'alias' : game === 'bunker' ? 'bunker' : 'mafia';
  const input = document.getElementById('game-select');
  if (input) input.value = value;
  document.querySelectorAll('.game-pick-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.game === value);
  });
};

window.createRoom = async () => {
  const name = document.getElementById('host-name-input').value.trim();
  if (!name) { showToast('Введи имя'); return; }
  localStorage.setItem('bunker_name', name);
  const raw = document.getElementById('game-select')?.value || 'mafia';
  const game = raw === 'spy' ? 'spy' : raw === 'alias' ? 'alias' : raw === 'bunker' ? 'bunker' : 'mafia';
  const res = await api('/api/create', { name, game });
  if (res.type === 'error') { showToast(res.message); return; }
  if (res.room?.game !== game) {
    showToast('Сервер не принял режим - перезапусти node server.js');
    return;
  }
  playerId = res.playerId;
  roomCode = res.room.code;
  localStorage.setItem('bunker_room', roomCode);
  isHost = true;
  roomState = res.room;
  myRole = null;
  document.getElementById('room-code-label').textContent = res.room.code;
  showToast('Комната · ' + (GAME_NAMES[game] || game));
  showScreen('screen-lobby');
  renderLobby(res.room);
  connectSSE();
};

window.joinRoom = async () => {
  const name = document.getElementById('join-name-input').value.trim();
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (!name) { showToast('Введи имя'); return; }
  if (!code) { showToast('Введи код комнаты'); return; }
  localStorage.setItem('bunker_name', name);
  localStorage.setItem('bunker_room', code);
  const res = await api('/api/join', { name, code });
  if (res.type === 'error') { showToast(res.message); return; }
  playerId = res.playerId;
  roomCode = res.room.code;
  isHost = false;
  roomState = res.room;
  myRole = null;
  document.getElementById('room-code-label').textContent = roomCode;
  showScreen('screen-lobby');
  renderLobby(res.room);
  connectSSE();
};

window.leaveRoom = async () => {
  if (roomCode) await api('/api/leave', { room: roomCode, player: playerId });
  if (eventSource) eventSource.close();
  goHome();
};

window.goHome = () => {
  if (window._lobbyReturnTimer) {
    clearTimeout(window._lobbyReturnTimer);
    window._lobbyReturnTimer = null;
  }
  if (eventSource) eventSource.close();
  playerId = null;
  roomCode = null;
  isHost = false;
  myRole = null;
  selectedTarget = null;
  roomState = null;
  eventSource = null;
  hostActionType = null;
  spyCustomLocationsDraft = '';
  aliasCustomWordsDraft = '';
  clearAliasCountdown();
  showScreen('screen-home');
  document.querySelector('.home-actions').classList.remove('hidden');
  document.getElementById('create-room-form').classList.add('hidden');
  document.getElementById('join-room-form').classList.add('hidden');
  const savedRoom = localStorage.getItem('bunker_room');
  const savedName = localStorage.getItem('bunker_name');
  const reconnectBtn = document.getElementById('reconnect-btn');
  if (reconnectBtn) reconnectBtn.classList.toggle('hidden', !(savedRoom && savedName));
};

window.startGame = async () => {
  if (!isHost || !roomCode) return;
  const game = roomState?.game || 'mafia';
  const min = MIN_PLAYERS[game] || 4;
  const all = getPlayers(roomState || { players: {} });
  const count = game === 'spy' || game === 'alias' || game === 'bunker'
    ? all.length
    : all.filter(p => !p.isHost).length;
  if (count < min) {
    showToast(game === 'spy' || game === 'alias' || game === 'bunker'
      ? 'Нужно минимум ' + min + ' игроков'
      : 'Нужно минимум ' + min + ' игроков + ведущий');
    return;
  }

  const payload = { room: roomCode, player: playerId };
  if (game === 'mafia') {
    const raw = document.getElementById('mafia-count-input')?.value;
    payload.mafiaCount = Math.max(1, parseInt(raw, 10) || 1);
    payload.hasDon = !!document.getElementById('role-don')?.checked;
    payload.hasManiac = !!document.getElementById('role-maniac')?.checked;
    payload.hasProstitute = !!document.getElementById('role-prostitute')?.checked;
  }
  if (game === 'spy') {
    const raw = document.getElementById('spy-questions-input')?.value;
    payload.questionLimit = Math.min(5, Math.max(1, parseInt(raw, 10) || 2));
    payload.customLocations = getSpyCustomLocationsValue();
  }
  if (game === 'alias') {
    const seconds = document.getElementById('alias-round-seconds-input')?.value;
    const totalRounds = document.getElementById('alias-total-rounds-input')?.value;
    payload.roundSeconds = Math.min(180, Math.max(30, parseInt(seconds, 10) || 60));
    payload.totalRounds = Math.min(10, Math.max(1, parseInt(totalRounds, 10) || 3));
    payload.customWords = getAliasCustomWordsValue();
  }
  // Bunker: no extra payload needed

  const res = await api('/api/start', payload);
  if (res.type === 'error') { showToast(res.message); return; }
  if (res.room) roomState = res.room;
  myRole = roomState?.players?.[playerId]?.role ?? null;

  if (game === 'spy') {
    showScreen('screen-game-spy');
    renderSpyGame(roomState);
  } else if (game === 'alias') {
    showScreen('screen-game-alias');
    renderAliasGame(roomState);
  } else if (game === 'bunker') {
    showScreen('screen-game-bunker');
    renderBunkerGame(roomState);
  } else {
    if (res.room?.mafiaCount) showToast('Мафия в игре: ' + res.room.mafiaCount);
    showScreen('screen-game-mafia');
    renderMafiaGame(roomState);
  }
};

window.continueGame = () => {
  // Players wait for host; button just acknowledges
  document.getElementById('game-info').classList.add('hidden');
};

window.removeBot = async (botId) => {
  await api('/api/admin_command', { room: roomCode, player: playerId, cmd: 'remove_bot', target: botId });
};

window.updateRoleCheckboxes = () => {};

window.kickPlayer = async (pid) => {
  await api('/api/admin_command', { room: roomCode, player: playerId, cmd: 'kick', target: pid });
};

window.adminKill = async (pid) => {
  await api('/api/admin_command', { room: roomCode, player: playerId, cmd: 'kill', target: pid });
  showToast('Игрок убит');
};

window.adminRevive = async (pid) => {
  await api('/api/admin_command', { room: roomCode, player: playerId, cmd: 'revive', target: pid });
  showToast('Игрок воскрешён');
};

function getPlayers(room) {
  return Object.keys(room.players).map(id => ({ id, ...room.players[id] }));
}

function hasAliveRole(room, role) {
  return getPlayers(room).some(p => !p.isHost && p.isAlive && p.role === role);
}

function renderLobby(room) {
  const players = getPlayers(room);
  const nonHost = players.filter(p => !p.isHost);
  const game = room.game || 'mafia';
  const min = MIN_PLAYERS[game] || 4;
  const countForStart = game === 'spy' || game === 'alias' || game === 'bunker' ? players.length : nonHost.length;
  const hostBadge = game === 'spy' || game === 'alias' || game === 'bunker' ? 'Создатель' : 'Ведущий';

  const gameLabel = document.getElementById('lobby-game-label');
  if (gameLabel) {
    gameLabel.textContent = 'Игра: ' + (GAME_NAMES[game] || game);
    gameLabel.classList.toggle('is-spy', game === 'spy');
    gameLabel.classList.toggle('is-alias', game === 'alias');
  }

  document.getElementById('lobby-players').innerHTML = players.map(p =>
    `<div class="player-item ${p.isHost ? 'host' : ''}">
      <div class="player-avatar">${p.name[0].toUpperCase()}</div>
      <div class="player-name">${escapeHtml(p.name)}</div>
      ${game === 'alias' ? `<span class="player-team-badge team-${p.aliasTeam || 'red'}">${getAliasTeamName(p.aliasTeam || 'red')}</span>` : ''}
      ${p.isHost ? '<span class="player-badge">' + hostBadge + '</span>' : ''}
      ${isHost && !p.isHost ? `<button class="btn-remove-bot" onclick="kickPlayer('${p.id}')" title="Кикнуть">✕</button>` : ''}
    </div>`
  ).join('');

  if (game === 'alias') {
    const myTeam = (room.players[playerId] && room.players[playerId].aliasTeam) || 'red';
    const sel = document.getElementById('alias-team-selector');
    sel.innerHTML = '<div class="alias-team-selector">' +
      ALIAS_TEAM_ORDER.map(t => {
        const meta = ALIAS_TEAM_META[t];
        return `<button class="alias-team-btn${myTeam === t ? ' active' : ''}" style="--team-color:${meta.hex}" onclick="setAliasTeam('${t}')" title="${meta.name}">${meta.name}</button>`;
      }).join('') +
      '</div>';
    sel.classList.remove('hidden');
  } else {
    const sel = document.getElementById('alias-team-selector');
    if (sel) sel.classList.add('hidden');
  }

  document.getElementById('lobby-host-controls').classList.toggle('hidden', !isHost);

  const mafiaSettings = document.getElementById('mafia-settings');
  const spySettings = document.getElementById('spy-settings');
  const aliasSettings = document.getElementById('alias-settings');
  if (mafiaSettings) mafiaSettings.classList.toggle('hidden', game !== 'mafia');
  if (spySettings) spySettings.classList.toggle('hidden', game !== 'spy');
  if (aliasSettings) aliasSettings.classList.toggle('hidden', game !== 'alias');

  const hint = document.getElementById('lobby-player-hint');
  const startBtn = document.getElementById('start-game-btn');
  const needMore = Math.max(0, min - countForStart);
  if (hint) {
    hint.textContent = needMore > 0
      ? 'Игроков: ' + countForStart + ' / нужно ещё ' + needMore
      : 'Можно начинать';
    hint.classList.toggle('lobby-ready-hint', needMore === 0);
  }
  if (startBtn) {
    startBtn.disabled = countForStart < min;
  }

  const mafiaSelect = document.getElementById('mafia-count-input');
  if (mafiaSelect && isHost && game === 'mafia') {
    const maxMafia = Math.max(1, Math.floor((nonHost.length - 1) / 2));
    const cur = parseInt(mafiaSelect.value, 10) || 1;
    mafiaSelect.innerHTML = '';
    for (let i = 1; i <= Math.min(3, maxMafia); i++) {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = String(i);
      if (i === Math.min(cur, maxMafia)) opt.selected = true;
      mafiaSelect.appendChild(opt);
    }
  }

  const adminPanel = document.getElementById('admin-panel');
  if (game === 'spy') {
    getSpyCustomLocationsValue();
  }
  if (game === 'alias') {
    getAliasCustomWordsValue();
  }
  if (isHost) {
    adminPanel.classList.remove('hidden');
    if (game === 'spy') {
      if (!spyCustomLocationsDraft && typeof room.spyCustomLocationsText === 'string') {
        spyCustomLocationsDraft = room.spyCustomLocationsText;
      }
      adminPanel.innerHTML = `
        <div class="admin-body">
          <label>
            Свои темы:
            <input
              type="text"
              id="spy-custom-locations-input"
              class="input"
              placeholder="Бар, Бункер, Корабль"
              value="${escapeHtml(spyCustomLocationsDraft)}"
              maxlength="240"
              oninput="updateSpyCustomLocations(this.value)"
            >
          </label>
          <p class="admin-hint">Свои локации через запятую</p>
        </div>
      `;
    } else if (game === 'alias') {
      if (!aliasCustomWordsDraft && typeof room.aliasCustomWordsText === 'string') {
        aliasCustomWordsDraft = room.aliasCustomWordsText;
      }
      adminPanel.innerHTML = `
        <div class="admin-body">
          <label>
            Свои слова:
            <input
              type="text"
              id="alias-custom-words-input"
              class="input"
              placeholder="Самолёт, Дракон, Кофеварка"
              value="${escapeHtml(aliasCustomWordsDraft)}"
              maxlength="400"
              oninput="updateAliasCustomWords(this.value)"
            >
          </label>
          <p class="admin-hint">Свои слова через запятую</p>
        </div>
      `;
    } else if (game === 'mafia') {
      adminPanel.innerHTML = `
        <div class="roles-panel">
          <div class="roles-panel-title">Доп. роли</div>
          <label class="role-toggle">
            <input type="checkbox" id="role-don" onchange="updateRoleCheckboxes()">
            <span>Дон</span>
            <span class="role-toggle-desc">заменяет мафию, проверяет на шерифа</span>
          </label>
          <label class="role-toggle">
            <input type="checkbox" id="role-maniac" onchange="updateRoleCheckboxes()">
            <span>Маньяк</span>
            <span class="role-toggle-desc">сам за себя, убивает ночью</span>
          </label>
          <label class="role-toggle">
            <input type="checkbox" id="role-prostitute" onchange="updateRoleCheckboxes()">
            <span>Путана</span>
            <span class="role-toggle-desc">блокирует игрока ночью</span>
          </label>
        </div>
      `;
    } else {
      adminPanel.innerHTML = `
        <div class="admin-body">
          <p class="admin-hint">Каждый получит: профессию, биологию,</p>
          <p class="admin-hint">здоровье, хобби, багаж и факт</p>
        </div>
      `;
    }
  } else {
    adminPanel.classList.add('hidden');
  }
}

const ALIAS_TEAM_META = {
  red: { name: 'Красные', css: 'alias-red', hex: '#ff7b92' },
  blue: { name: 'Синие', css: 'alias-blue', hex: '#8bc8ff' },
  green: { name: 'Зелёные', css: 'alias-green', hex: '#7ee089' },
  yellow: { name: 'Жёлтые', css: 'alias-yellow', hex: '#f5d76e' },
  purple: { name: 'Фиолетовые', css: 'alias-purple', hex: '#c39bff' }
};
const ALIAS_TEAM_ORDER = ['red', 'blue', 'green', 'yellow', 'purple'];

function getAliasTeamName(team) {
  return ALIAS_TEAM_META[team]?.name || team;
}

function getAliasTeamClass(team) {
  return ALIAS_TEAM_META[team]?.css || 'alias-red';
}

function getAliasTeamHex(team) {
  return ALIAS_TEAM_META[team]?.hex || '#ff7b92';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMafiaGame(room) {
  const players = getPlayers(room).filter(p => !p.isHost);
  const alive = players.filter(p => p.isAlive);
  const dead = players.filter(p => !p.isAlive);

  const phaseLabel = document.getElementById('mafia-phase-label');
  const labels = {
    day0: 'День 0',
    night: 'Ночь',
    day: 'День',
    vote: 'Голосование',
    vote_result: 'Результат',
    ended: 'Игра окончена'
  };
  phaseLabel.textContent = labels[room.phase] || room.phase;
  phaseLabel.className = 'game-phase' + (
    room.phase === 'night' ? ' night' :
    room.phase === 'day' || room.phase === 'day0' || room.phase === 'vote' ? ' day' : ''
  );

  let roundText = room.phase === 'day0' ? 'Раздача ролей' : ('Раунд ' + (room.round || 1));
  if (isHost && room.mafiaCount) roundText += ' · Мафия: ' + room.mafiaCount;
  document.getElementById('mafia-round-label').textContent = roundText;

  const grid = document.getElementById('mafia-players-grid');
  grid.innerHTML = [...alive, ...dead].map(p => {
    const isMe = p.id === playerId;
    // Роль видят: ведущий (все), игрок (свою). Убитых чужим не показываем
    const showRole = (isHost && p.role) || (isMe && p.role);
    const roleText = showRole ? (ROLE_NAMES[p.role] || p.role) : '';
    const roleClass = showRole ? ' role-' + p.role : '';

    let actions = '';
    if (isHost && room.phase !== 'lobby' && room.phase !== 'ended') {
      if (p.isAlive) {
        actions += `<button class="btn-admin-kill" onclick="event.stopPropagation();adminKill('${p.id}')" title="Убить">💀</button>`;
      } else {
        actions += `<button class="btn-admin-revive" onclick="event.stopPropagation();adminRevive('${p.id}')" title="Воскресить">✨</button>`;
      }
    }

    return `<div class="game-player-card ${p.isAlive ? 'alive' : 'dead'} ${selectedTarget === p.id ? 'selected' : ''}" onclick="clickPlayer('${p.id}')">
      <div class="gpc-avatar${roleClass}">${escapeHtml(p.name[0].toUpperCase())}</div>
      <div class="gpc-name">${escapeHtml(p.name)}${isMe ? ' <span class="gpc-you">ты</span>' : ''}${p.isBot ? ' <span class="gpc-bot">бот</span>' : ''}</div>
      ${roleText ? `<div class="gpc-role${roleClass}">${escapeHtml(roleText)}</div>` : ''}
      ${room.phase === 'vote' && p.hasVoted ? '<div class="gpc-voted">голос ✓</div>' : ''}
      ${actions ? `<div class="gpc-actions">${actions}</div>` : ''}
    </div>`;
  }).join('');

  const roleLabel = document.getElementById('my-role-label');
  const roleCard = document.getElementById('my-role-card');
  roleCard.className = 'player-role-card';
  if (isHost) {
    roleLabel.textContent = 'Ведущий';
    roleCard.classList.add('role-host');
  } else {
    roleLabel.textContent = ROLE_NAMES[myRole] || '?';
    if (myRole) roleCard.classList.add('role-' + myRole);
  }

  const killedDiv = document.getElementById('night-killed-info');
  if (room.phase === 'day' || room.phase === 'vote' || room.phase === 'vote_result') {
    killedDiv.classList.remove('hidden');
    if (room.killedTonight) {
      const killedIds = String(room.killedTonight).split(',');
      const killedNames = killedIds.map(id => {
        const p = room.players[id];
        const roleStr = (isHost && p?.role) ? ' (' + (ROLE_NAMES[p.role] || p.role) + ')' : '';
        return '<strong>' + escapeHtml(p ? p.name : 'неизвестный') + '</strong>' + roleStr;
      }).join(', ');
      killedDiv.innerHTML = 'Ночью убит: ' + killedNames;
    } else {
      killedDiv.innerHTML = 'Ночью никто не погиб';
    }
  } else {
    killedDiv.classList.add('hidden');
  }

  const me = room.players[playerId];
  const canVote = !isHost && room.phase === 'vote' && me?.isAlive;

// Результат проверки шерифа - только на экране шерифа
  const sheriffCheck =
    !isHost &&
    myRole === 'sheriff' &&
    me?.isAlive &&
    room.phase === 'day' &&
    room.checkResult &&
    room.checkTargetName;

  const donCheck =
    !isHost &&
    myRole === 'don' &&
    me?.isAlive &&
    room.phase === 'day' &&
    room.donCheckResult &&
    room.donCheckTargetName;

  const wasBlocked = !isHost && me?.isAlive && room.wasBlocked && room.phase === 'day';

  document.getElementById('player-actions').classList.toggle('hidden', !canVote && !sheriffCheck && !donCheck && !wasBlocked);
  document.getElementById('host-panel').classList.toggle('hidden', !isHost);

  // Day 0 / vote result for players
  document.getElementById('game-info').classList.toggle(
    'hidden',
    isHost || (room.phase !== 'vote_result' && room.phase !== 'day0') || sheriffCheck || donCheck || wasBlocked
  );

  document.getElementById('game-result').classList.toggle('hidden', room.phase !== 'ended');

  const hasActions =
    !document.getElementById('player-actions').classList.contains('hidden') ||
    !document.getElementById('host-panel').classList.contains('hidden') ||
    !document.getElementById('game-info').classList.contains('hidden') ||
    !document.getElementById('game-result').classList.contains('hidden');
  document.getElementById('mafia-actions').classList.toggle('hidden', !hasActions);

  if (wasBlocked) {
    document.getElementById('vote-prompt').textContent = '';
    document.getElementById('vote-targets').className = 'vote-targets result-view';
    document.getElementById('vote-targets').innerHTML =
      '<div class="check-result-box prostitute-box">' +
      '<p style="font-size:1.3rem;font-weight:800;color:var(--role-prostitute)">Тебя ебали</p>' +
      '</div>';
    document.getElementById('confirm-vote-btn').classList.add('hidden');
  } else if (sheriffCheck) {
    const resultLabel = room.checkResult === 'mafia' ? 'МАФИЯ' : 'НЕ мафия';
    document.getElementById('vote-prompt').textContent = 'Результат проверки';
    document.getElementById('vote-targets').className = 'vote-targets result-view';
    document.getElementById('vote-targets').innerHTML =
      '<div class="check-result-box">' +
      '<p><strong>' + escapeHtml(room.checkTargetName) + '</strong> – ' + resultLabel + '</p>' +
      '</div>';
    document.getElementById('confirm-vote-btn').classList.add('hidden');
  } else if (donCheck) {
    const resultLabel = room.donCheckResult === 'sheriff' ? 'ШЕРИФ' : 'НЕ шериф';
    document.getElementById('vote-prompt').textContent = 'Результат проверки Дона';
    document.getElementById('vote-targets').className = 'vote-targets result-view';
    document.getElementById('vote-targets').innerHTML =
      '<div class="check-result-box">' +
      '<p><strong>' + escapeHtml(room.donCheckTargetName) + '</strong> – ' + resultLabel + '</p>' +
      '</div>';
    document.getElementById('confirm-vote-btn').classList.add('hidden');
  } else if (canVote) {
    document.getElementById('vote-targets').className = 'vote-targets';
    document.getElementById('confirm-vote-btn').classList.remove('hidden');
    document.getElementById('vote-prompt').textContent = 'Кого исключаем?';
    document.getElementById('vote-targets').innerHTML = alive
      .filter(p => p.id !== playerId)
      .map(p =>
        `<div class="game-player-card targetable ${selectedTarget === p.id ? 'selected' : ''}" onclick="selectTarget('${p.id}')">
          <div class="gpc-avatar">${escapeHtml(p.name[0].toUpperCase())}</div>
          <div class="gpc-name">${escapeHtml(p.name)}</div>
        </div>`
      ).join('');
    document.getElementById('confirm-vote-btn').disabled = !selectedTarget;
  } else if (!isHost) {
    document.getElementById('vote-targets').innerHTML = '';
    document.getElementById('confirm-vote-btn').classList.add('hidden');
  }

  if (isHost) {
    renderHostPanel(room, alive);
  }

  if (!isHost && room.phase === 'day0') {
    document.getElementById('game-info').classList.remove('hidden');
    document.getElementById('info-text').textContent =
      'Запомни свою роль и не показывай экран';
    const hint = document.querySelector('#game-info .admin-hint');
    if (hint) hint.classList.add('hidden');
  } else {
    const hint = document.querySelector('#game-info .admin-hint');
    if (hint && room.phase === 'vote_result') hint.classList.remove('hidden');
  }

  if (room.phase === 'vote_result') {
    let info = 'Ничья - никто не исключён';
    if (room.eliminatedPlayer && room.players[room.eliminatedPlayer]) {
      const ep = room.players[room.eliminatedPlayer];
      info = 'Исключён: ' + ep.name;
    }
    document.getElementById('info-text').textContent = info;
  }

  if (room.phase === 'ended') {
    let winTitle = 'Мирные победили!';
    if (room.winner === 'mafia') winTitle = 'Мафия победила!';
    else if (room.winner === 'maniac') winTitle = 'Маньяк победил!';
    document.getElementById('result-title').textContent = winTitle;
    document.getElementById('result-text').textContent = '';
    // Через пару секунд все возвращаются в то же лобби
    if (!window._lobbyReturnTimer) {
      window._lobbyReturnTimer = setTimeout(() => {
        window._lobbyReturnTimer = null;
        returnToLobby();
      }, 30000);
    }
  }
}

function renderHostPanel(room, alive) {
  const panel = document.getElementById('host-panel');
  let html = '<div class="host-controls">';

  if (room.phase === 'day0') {
    html += '<p class="action-prompt">Игроки получили роли</p>';
    html += '<button class="btn btn-primary" onclick="startFirstNight()">Начать первую ночь</button>';
  }

  if (room.phase === 'night') {
    const killTarget = room.hostKillTarget ? room.players[room.hostKillTarget]?.name : '-';
    const saveTarget = room.hostSaveTarget ? room.players[room.hostSaveTarget]?.name : '-';
    const checkTarget = room.hostCheckTarget ? room.players[room.hostCheckTarget]?.name : '-';
    const donCheckTarget = room.hostDonCheckTarget ? room.players[room.hostDonCheckTarget]?.name : '-';
    const maniacKillTarget = room.hostManiacKillTarget ? room.players[room.hostManiacKillTarget]?.name : '-';
    const prosBlockTarget = room.hostProstituteBlockTarget ? room.players[room.hostProstituteBlockTarget]?.name : '-';

    if (hasAliveRole(room, 'mafia') || hasAliveRole(room, 'don')) {
      html += '<div class="host-action-row">';
      html += '<span>Убить: <strong>' + escapeHtml(killTarget) + '</strong></span>';
      html += '<button class="btn btn-small" onclick="setHostAction(\'kill\')">Выбрать</button>';
      html += '</div>';
    }

    if (hasAliveRole(room, 'don')) {
      html += '<div class="host-action-row">';
      html += '<span>Дон проверить: <strong>' + escapeHtml(donCheckTarget) + '</strong></span>';
      html += '<button class="btn btn-small" onclick="setHostAction(\'don_check\')">Выбрать</button>';
      html += '</div>';
    }

    if (hasAliveRole(room, 'prostitute')) {
      html += '<div class="host-action-row">';
      html += '<span>Путана блок: <strong>' + escapeHtml(prosBlockTarget) + '</strong></span>';
      html += '<button class="btn btn-small" onclick="setHostAction(\'prostitute_block\')">Выбрать</button>';
      html += '</div>';
    }

    if (hasAliveRole(room, 'doctor')) {
      html += '<div class="host-action-row">';
      html += '<span>Лечить: <strong>' + escapeHtml(saveTarget) + '</strong></span>';
      html += '<span style="font-size:0.7rem;color:var(--text-muted)">' + (room.doctorSelfHealsUsed ? 'себя лечил' : 'можно себя') + '</span>';
      html += '<button class="btn btn-small" onclick="setHostAction(\'save\')">Выбрать</button>';
      html += '</div>';
    }

    if (hasAliveRole(room, 'sheriff')) {
      html += '<div class="host-action-row">';
      html += '<span>Проверить: <strong>' + escapeHtml(checkTarget) + '</strong></span>';
      html += '<button class="btn btn-small" onclick="setHostAction(\'check\')">Выбрать</button>';
      html += '</div>';
    }

    if (hasAliveRole(room, 'maniac')) {
      html += '<div class="host-action-row">';
      html += '<span>Маньяк убить: <strong>' + escapeHtml(maniacKillTarget) + '</strong></span>';
      html += '<button class="btn btn-small" onclick="setHostAction(\'maniac_kill\')">Выбрать</button>';
      html += '</div>';
    }

    if (hostActionType) {
      const labels = {
        kill: 'Кого убивает мафия? (нажми на игрока)',
        don_check: 'Кого проверяет Дон? (нажми на игрока)',
        prostitute_block: 'Кого блокирует Путана? (нажми на игрока)',
        save: 'Кого лечит доктор? (нажми на игрока)',
        check: 'Кого проверяет шериф? (нажми на игрока)',
        maniac_kill: 'Кого убивает Маньяк? (нажми на игрока)'
      };
      html += '<p class="action-prompt">' + labels[hostActionType] + '</p>';
      html += '<div class="night-targets">';

      let targets = alive;
      if (hostActionType === 'kill') {
        targets = alive.filter(p => p.role !== 'mafia' && p.role !== 'don');
      } else if (hostActionType === 'check') {
        targets = alive.filter(p => p.role !== 'sheriff');
      } else if (hostActionType === 'don_check') {
        targets = alive.filter(p => p.role !== 'don');
      }

      html += targets.map(p =>
        `<div class="game-player-card targetable ${selectedTarget === p.id ? 'selected' : ''}" onclick="selectTarget('${p.id}')">
          <div class="gpc-avatar">${escapeHtml(p.name[0].toUpperCase())}</div>
          <div class="gpc-name">${escapeHtml(p.name)}</div>
        </div>`
      ).join('');
      html += '</div>';
    }

    html += '<button class="btn btn-primary" onclick="endNight()">Завершить ночь</button>';
  }

  if (room.phase === 'day') {
    html += '<p class="action-prompt">Обсуждение</p>';

    const aliveNow = getPlayers(room).filter(p => !p.isHost && p.isAlive);
    const mafiaLeft = aliveNow.filter(p => p.role === 'mafia' || p.role === 'don').length;
    const maniacLeft = aliveNow.filter(p => p.role === 'maniac').length;
    const townLeft = aliveNow.length - mafiaLeft - maniacLeft;
    if (mafiaLeft === 0 && maniacLeft === 0) {
      html += '<p class="admin-hint">Условие победы выполнено</p>';
      html += '<button class="btn btn-primary" onclick="startVote()">Завершить игру</button>';
    } else if (mafiaLeft >= townLeft + maniacLeft) {
      html += '<p class="admin-hint">Условие победы выполнено</p>';
      html += '<button class="btn btn-primary" onclick="startVote()">Завершить игру</button>';
    } else {
      html += '<button class="btn btn-primary" onclick="startVote()">Начать голосование</button>';
    }
  }

  if (room.phase === 'vote') {
    const voters = getPlayers(room).filter(p => !p.isHost && p.isAlive);
    const votedCount = voters.filter(p => p.hasVoted).length;
    html += '<p class="action-prompt">Голоса: ' + votedCount + ' / ' + voters.length + '</p>';
    html += '<button class="btn btn-primary" onclick="endVote()">Завершить голосование</button>';
  }

  if (room.phase === 'vote_result') {
    let info = 'Ничья - никто не исключён';
    if (room.eliminatedPlayer && room.players[room.eliminatedPlayer]) {
      const ep = room.players[room.eliminatedPlayer];
      const roleStr = ep.role ? ' (' + (ROLE_NAMES[ep.role] || ep.role) + ')' : '';
      info = 'Исключён: ' + escapeHtml(ep.name) + roleStr;
    }

    const aliveNow = getPlayers(room).filter(p => !p.isHost && p.isAlive);
    const mafiaLeft = aliveNow.filter(p => p.role === 'mafia' || p.role === 'don').length;
    const maniacLeft = aliveNow.filter(p => p.role === 'maniac').length;
    const townLeft = aliveNow.length - mafiaLeft - maniacLeft;
    const gameOver = (mafiaLeft === 0 && maniacLeft === 0) || (maniacLeft === 0 && mafiaLeft >= townLeft) || (maniacLeft === 1 && mafiaLeft === 0 && townLeft === 1);

    html += '<p class="action-prompt">' + info + '</p>';
    html += '<button class="btn btn-primary" onclick="nextRound()">' +
      (gameOver ? 'Завершить игру' : 'Следующий раунд') + '</button>';
  }

  html += '</div>';
  panel.innerHTML = html;
}

window.clickPlayer = (pid) => {
  if (isHost && hostActionType) {
    selectTarget(pid);
  }
};

window.selectTarget = async (pid) => {
  selectedTarget = pid;

  // Ведущий: выбор сразу сохраняется без кнопки «Подтвердить»
  if (isHost && hostActionType) {
    const action = hostActionType;
    const res = await api('/api/host_action', {
      room: roomCode,
      player: playerId,
      action,
      target: pid
    });
    if (res.type === 'error') {
      showToast(res.message);
      return;
    }
    hostActionType = null;
    selectedTarget = null;
    return;
  }

  if (currentScreen === 'screen-game-mafia') renderMafiaGame(roomState);
};

window.setHostAction = (type) => {
  hostActionType = type;
  selectedTarget = null;
  renderMafiaGame(roomState);
};

window.confirmVote = async () => {
  if (!selectedTarget) return;
  const res = await api('/api/vote', {
    room: roomCode,
    player: playerId,
    target: selectedTarget
  });
  if (res.type === 'error') { showToast(res.message); return; }
  selectedTarget = null;
  showToast('Голос принят!');
};

window.endNight = async () => {
  hostActionType = null;
  const res = await api('/api/end_night', { room: roomCode, player: playerId });
  if (res.type === 'error') showToast(res.message);
};

window.startFirstNight = async () => {
  const res = await api('/api/start_first_night', { room: roomCode, player: playerId });
  if (res.type === 'error') showToast(res.message);
};

window.startVote = async () => {
  const res = await api('/api/start_vote', { room: roomCode, player: playerId });
  if (res.type === 'error') showToast(res.message);
};

window.endVote = async () => {
  const res = await api('/api/end_vote', { room: roomCode, player: playerId });
  if (res.type === 'error') showToast(res.message);
};

window.nextRound = async () => {
  const res = await api('/api/next_round', { room: roomCode, player: playerId });
  if (res.type === 'error') showToast(res.message);
};

function renderSpyGame(room) {
  const players = getPlayers(room);
  const iAmSpy = myRole === 'spy';
  const revealed = !!room.spyRevealed;
  const usesCustomTopics = !!room.spyUsesCustomLocations;
  const limit = room.questionLimit || 2;
  const ready = !!room.questionsComplete;
  const me = room.players[playerId];
  const myAsked = me?.questionsAsked || 0;
  const myFull = myAsked >= limit;
  const spy = players.find(p => p.role === 'spy');
  const topicLabel = usesCustomTopics ? 'Тема' : 'Локация';

  document.getElementById('spy-phase-label').textContent = revealed ? 'Раскрытие' : 'Вопросы';
  document.getElementById('spy-round-label').textContent =
    'Раунд ' + (room.round || 1) + ' · по ' + limit + ' на человека';

  const card = document.getElementById('spy-main-card');
  const label = document.getElementById('spy-card-label');
  const value = document.getElementById('spy-card-value');
  const hint = document.getElementById('spy-card-hint');

  card.classList.toggle('is-spy', iAmSpy && !revealed);
  card.classList.toggle('is-revealed', revealed);

  if (iAmSpy && !revealed) {
    label.textContent = 'Ты шпион';
    value.textContent = '???';
    hint.textContent = 'Слушай ответы и не пались';
  } else if (revealed) {
    label.textContent = topicLabel;
    value.textContent = room.location || '-';
    hint.textContent = '';
  } else {
    label.textContent = topicLabel;
    value.textContent = room.location || '-';
    hint.textContent = 'Когда тебя спросили - жми кнопку ниже';
  }

  const playerPanel = document.getElementById('spy-player-panel');
  playerPanel.classList.add('hidden');
  playerPanel.innerHTML = '';
  if (!revealed && !myFull) {
    playerPanel.innerHTML = `<button class="btn btn-primary spy-player-btn" onclick="spyAsk('${playerId}')">+1 меня спросили</button>`;
    playerPanel.classList.remove('hidden');
  }

  const grid = document.getElementById('spy-players-grid');
  grid.innerHTML = players.map(p => {
    const isMe = p.id === playerId;
    const asked = p.questionsAsked || 0;
    const full = asked >= limit;
    const showRole = revealed || (isMe && p.role);
    const roleText = showRole ? (ROLE_NAMES[p.role] || p.role) : '';
    const roleClass = showRole && p.role ? ' role-' + p.role : '';

    return `<div class="game-player-card alive${full ? ' spy-full' : ''}${isMe ? ' spy-me' : ''}">
      <div class="gpc-avatar${roleClass}">${escapeHtml(p.name[0].toUpperCase())}</div>
      <div class="gpc-name">${escapeHtml(p.name)}${isMe ? ' <span class="gpc-you">ты</span>' : ''}</div>
      <div class="spy-q-count">${asked} / ${limit}</div>
      ${roleText ? `<div class="gpc-role${roleClass}">${escapeHtml(roleText)}</div>` : ''}
    </div>`;
  }).join('');

  const panel = document.getElementById('spy-host-panel');
  panel.classList.add('hidden');
  let html = '';
  if (isHost && revealed) {
      html += `<button class="btn btn-primary" onclick="spyNextRound()">Новый раунд</button>`;
      html += `<button class="btn btn-secondary" onclick="returnToLobby()">В лобби</button>`;
  } else if (isHost && ready) {
    html += `<button class="btn btn-primary" onclick="spyReveal()">Раскрыть шпиона</button>`;
  }
  panel.innerHTML = html;
  if (html) {
    panel.classList.remove('hidden');
  }

  const revealInfo = document.getElementById('spy-reveal-info');
  revealInfo.classList.add('hidden');
  revealInfo.innerHTML = '';
  if (revealed) {
    revealInfo.innerHTML =
      `<div class="spy-reveal-banner">Шпионом был: <strong>${escapeHtml(spy ? spy.name : '?')}</strong>${iAmSpy ? ' (ты)' : ''}</div>`;
    revealInfo.classList.remove('hidden');
  }
}

function renderAliasGame(room) {
  const players = getPlayers(room);
  const activeTeam = room.aliasActiveTeam || 'red';
  const activePlayerId = room.aliasActivePlayerId || null;
  const activePlayerName = room.aliasActivePlayerName || (activePlayerId && room.players[activePlayerId]?.name) || null;
  const myPlayer = room.players[playerId];
  const myTeam = myPlayer?.aliasTeam || null;
  const iAmExplainer = !!(activePlayerId && activePlayerId === playerId);
  const phaseLabels = {
    alias_ready: 'Подготовка',
    alias_round: 'Раунд',
    alias_review: 'Проверка',
    ended: 'Игра окончена'
  };

  if (room.phase !== 'ended') window._lobbyReturnTimer = null;
  document.getElementById('alias-phase-label').textContent = phaseLabels[room.phase] || 'Элиас';
  document.getElementById('alias-round-label').textContent =
    'Круг ' + (room.aliasCurrentCycle || 1) + ' / ' + (room.aliasTotalRounds || 3);

  const teamsInPlay = [...new Set(players.map(p => p.aliasTeam).filter(t => t && ALIAS_TEAM_ORDER.includes(t)))];
  document.getElementById('alias-scoreboard').innerHTML = teamsInPlay.map(t => {
    const meta = ALIAS_TEAM_META[t];
    const score = room.aliasScores?.[t] ?? 0;
    const active = activeTeam === t && room.phase !== 'ended';
    return `<div class="alias-score-card ${meta.css}${active ? ' active' : ''}">
      <span class="alias-score-team">${meta.name}</span>
      <strong class="alias-score-value">${score}</strong>
    </div>`;
  }).join('');

  const wordCard = document.getElementById('alias-word-card');
  const wordLabel = document.getElementById('alias-word-label');
  const wordValue = document.getElementById('alias-word-value');
  const wordHint = document.getElementById('alias-word-hint');

  wordCard.classList.remove('is-hidden-word', 'is-ended');
  if (room.phase === 'ended') {
    clearAliasCountdown();
    wordCard.classList.add('is-ended');
    wordLabel.textContent = 'Победители';
    wordValue.textContent = room.winner === 'draw' ? 'Ничья' : getAliasTeamName(room.winner);
    wordHint.textContent = '';
  } else if (room.phase === 'alias_round') {
    if (room.aliasCurrentWord) {
      wordLabel.textContent = iAmExplainer ? 'Твоё слово' : 'Слово';
      wordValue.textContent = room.aliasCurrentWord;
      wordHint.textContent = '';
    } else {
      wordCard.classList.add('is-hidden-word');
      wordLabel.textContent = '';
      wordValue.textContent = '???';
      wordHint.textContent = '';
    }
  } else if (room.phase === 'alias_review') {
    clearAliasCountdown();
    wordCard.classList.add('is-hidden-word');
    wordLabel.textContent = 'Проверка';
    wordValue.textContent = '???';
    wordHint.textContent = '';
  } else {
    clearAliasCountdown();
    wordLabel.textContent = '';
    wordValue.textContent = '???';
    wordHint.textContent = iAmExplainer
      ? 'Твой ход'
      : getAliasTeamName(activeTeam);
  }

  const grid = document.getElementById('alias-players-grid');
  grid.innerHTML = players.map(p => {
    const isMe = p.id === playerId;
    const isActive = p.id === activePlayerId;
    const team = p.aliasTeam || 'red';
    const meta = ALIAS_TEAM_META[team] || ALIAS_TEAM_META.red;
    const turns = p.aliasTurnsTaken || 0;
    return `<div class="game-player-card alias-player-card" style="border-color:${meta.hex}44;${isActive ? 'background:var(--surface2);' : ''}">
      <div class="gpc-avatar">${escapeHtml(p.name[0].toUpperCase())}</div>
      <div class="gpc-name">${escapeHtml(p.name)}${isMe ? ' <span class="gpc-you">ты</span>' : ''}</div>
      <div class="alias-player-team" style="color:${meta.hex}">${meta.name}</div>
      ${isActive ? '<div class="alias-player-status">объясняет</div>' : `<div class="alias-player-turns">${turns}</div>`}
    </div>`;
  }).join('');

  const playerPanel = document.getElementById('alias-player-panel');
  playerPanel.classList.add('hidden');
  let playerHtml = '';
  if (room.phase === 'alias_ready') {
    if (iAmExplainer) {
      playerHtml = `
        <div class="alias-info-card ${getAliasTeamClass(activeTeam)}">Твой ход</div>
        <button class="btn btn-primary" style="width:100%;margin-top:6px" onclick="aliasStartRound()">Начать</button>
      `;
    } else {
      playerHtml = `<div class="alias-info-card ${getAliasTeamClass(activeTeam)}">${escapeHtml(activePlayerName || '?')} объясняет</div>`;
    }
  } else if (room.phase === 'alias_round') {
    if (iAmExplainer) {
      playerHtml = `
        <div style="font-size:1.6rem;font-weight:800;text-align:center;margin-bottom:4px;font-variant-numeric:tabular-nums" id="alias-player-timer">${formatAliasTime((room.aliasRoundEndsAt || Date.now()) - Date.now())}</div>
        <div class="alias-action-row">
          <button class="btn btn-primary" onclick="aliasNextWord()">Далее</button>
          <button class="btn btn-secondary" onclick="aliasSkip()">Пропуск</button>
        </div>
      `;
    } else {
      playerHtml = `<div class="alias-info-card ${getAliasTeamClass(activeTeam)}">${escapeHtml(activePlayerName || '?')} объясняет</div>`;
    }
  } else if (room.phase === 'alias_review') {
    const reviewWords = Array.isArray(room.aliasReviewWords) ? room.aliasReviewWords : [];
    if (iAmExplainer) {
      playerHtml = `
        <div class="alias-review-list">
          ${reviewWords.map((item, index) => item.skipped
            ? `<label class="alias-review-item is-skipped"><span>${escapeHtml(item.word)}</span><em>пропуск</em></label>`
            : `<label class="alias-review-item"><input type="checkbox" class="alias-review-checkbox" value="${index}" ${item.correct ? 'checked' : ''}><span>${escapeHtml(item.word)}</span></label>`
          ).join('')}
        </div>
        <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="aliasSubmitReview()">Подтвердить</button>
      `;
    } else {
      playerHtml = `
        <div class="alias-info-card ${getAliasTeamClass(activeTeam)}">${escapeHtml(activePlayerName || '?')} проверяет слова</div>
        <div class="alias-review-list alias-review-readonly">
          ${reviewWords.map(item => `<div class="alias-review-item${item.skipped ? ' is-skipped' : ''}"><span>${escapeHtml(item.word)}</span>${item.skipped ? '<em>пропуск</em>' : ''}</div>`).join('')}
        </div>
      `;
    }
  } else if (room.phase === 'ended') {
    const winnerText = room.winner === 'draw' ? 'Ничья' : 'Победили ' + getAliasTeamName(room.winner);
    playerHtml = `
      <div class="alias-result-card ${getAliasTeamClass(room.winner === 'draw' ? 'red' : room.winner)}">${winnerText}</div>
      <button class="btn btn-primary" style="width:100%;margin-top:8px" onclick="returnToLobby()">В лобби</button>
    `;
    if (!window._lobbyReturnTimer) {
      window._lobbyReturnTimer = setTimeout(() => {
        window._lobbyReturnTimer = null;
        returnToLobby();
      }, 30000);
    }
  }
  playerPanel.innerHTML = playerHtml;
  if (playerHtml) playerPanel.classList.remove('hidden');

  const hostPanel = document.getElementById('alias-host-panel');
  hostPanel.classList.add('hidden');
  hostPanel.innerHTML = '';

  const result = document.getElementById('alias-result');
  result.classList.add('hidden');
  result.innerHTML = '';

  clearAliasCountdown();
  if (room.phase === 'alias_round' && room.aliasRoundEndsAt) {
    aliasAutoEndRequested = false;
    const updateTimer = () => {
      const left = (room.aliasRoundEndsAt || Date.now()) - Date.now();
      const text = formatAliasTime(left);
      const playerTimer = document.getElementById('alias-player-timer');
      if (playerTimer) playerTimer.textContent = text;
      if (left <= 0 && iAmExplainer && !aliasAutoEndRequested) {
        aliasAutoEndRequested = true;
        aliasEndRound();
      }
    };
    updateTimer();
    aliasCountdownInterval = setInterval(updateTimer, 1000);
  }
}

// ========================
//   БУНКЕР v3
// ========================

const BUNKER_PHASE_LABELS = {
  catastrophe: 'Катастрофа',
  turns: 'Ходы игроков',
  discuss: 'Обсуждение',
  vote: 'Голосование',
  event: 'Событие',
  result: 'Результат'
};

const CARD_CATS = [
  { key: 'profession', label: 'Профессия' },
  { key: 'biology', label: 'Биология' },
  { key: 'health', label: 'Здоровье' },
  { key: 'hobby', label: 'Хобби' },
  { key: 'luggage', label: 'Багаж' },
  { key: 'fact', label: 'Факт' },
];

function catLabel(key) {
  const c = CARD_CATS.find(x => x.key === key);
  return c ? c.label : key;
}

function renderBunkerGame(room) {
  const allPlayers = getPlayers(room).filter(p => !p.isBot);
  const alive = allPlayers.filter(p => p.isAlive);
  const dead = allPlayers.filter(p => !p.isAlive);
  const phase = room.bunkerPhase || 'catastrophe';
  const me = room.players[playerId];
  const activePid = room.bunkerActivePlayer;
  const isMyTurn = activePid === playerId;
  const myHost = room.hostId === playerId;

  document.getElementById('bunker-phase-label').textContent = BUNKER_PHASE_LABELS[phase] || 'Бункер';
  document.getElementById('bunker-round-label').textContent = 'Раунд ' + room.bunkerRound;

  // Catastrophe + bunker card
  const catCard = document.getElementById('bunker-catastrophe-card');
  catCard.classList.remove('hidden');
  let catHtml = '';
  if (room.bunkerCatastrophe) {
    const c = room.bunkerCatastrophe;
    catHtml += '<div style="font-size:1rem;font-weight:800;color:var(--primary)">' + c.name + '</div>';
    catHtml += '<div class="cat-desc" style="margin-top:6px">' + c.lore + '</div>';
  }
  if (room.bunkerType) {
    const bt = room.bunkerType;
    catHtml += '<div class="bunker-type-info"><strong>' + bt.name + '</strong> <span style="float:right;font-weight:700;color:var(--warning)">мест: ' + (room.bunkerCapacity || '?') + '</span><br><span style="font-size:0.8rem;color:var(--text-muted)">' + bt.desc + '</span></div>';
  }
  // Extra catastrophe tags
  if (room.bunkerExtraTags && room.bunkerExtraTags.length > 0) {
    catHtml += '<div style="margin-top:6px;font-size:0.75rem;color:var(--danger)">⚠️ Условия ухудшились: ' + room.bunkerExtraTags.join(', ') + '</div>';
  }
  catCard.innerHTML = catHtml;

  // Players grid – show only revealed cards (NO tags/skills hints)
  const grid = document.getElementById('bunker-players-grid');
  grid.innerHTML = [...alive, ...dead].map(p => {
    const cards = p.bunkerCards;
    const rev = p.bunkerRevealed || [];
    const isMe = p.id === playerId;
    const isActive = p.id === activePid;
    const myTurnTag = isActive ? ' style="border-color:var(--primary)"' : '';
    let lines = '';
    CARD_CATS.forEach(cat => {
      if (!rev.includes(cat.key)) return;
      const card = cards ? cards[cat.key] : null;
      if (!card) return;
      const val = typeof card === 'string' ? card : card.name;
      lines += '<div class="bp-line"><span class="bp-lbl">' + cat.label + ':</span> ' + escapeHtml(val) + '</div>';
    });
    return '<div class="game-player-card bunker-player-card ' + (p.isAlive ? 'alive' : 'dead') + (isMe || isActive ? ' selected' : '') + '"' + myTurnTag + '>' +
      '<div class="gpc-avatar">' + escapeHtml(p.name[0].toUpperCase()) + '</div>' +
      '<div class="gpc-name">' + escapeHtml(p.name) + (isMe ? ' <span class="gpc-you">ты</span>' : '') + (isActive ? ' <span class="gpc-you">👤 ход</span>' : '') + '</div>' +
      lines +
      (!p.isAlive ? '<div class="bp-out">ВЫБЫЛ</div>' : '') +
      (p.hasVoted ? '<div class="bp-out" style="color:var(--warning)">проголосовал</div>' : '') +
    '</div>';
  }).join('');

  // Sidebar – my own cards (NO tag hints)
  const side = document.getElementById('bunker-sidebar');
  const myCard = document.getElementById('bunker-my-card');
  if (me && me.bunkerCards) {
    side.classList.remove('hidden');
    let html = '<div class="bunker-my-cards">';
    CARD_CATS.forEach(cat => {
      const card = me.bunkerCards[cat.key];
      if (!card) return;
      const val = typeof card === 'string' ? card : card.name;
      html += '<div class="bm-row"><span class="bm-lbl">' + cat.label + ':</span> ' + escapeHtml(val) + '</div>';
    });
    html += '</div>';
    myCard.innerHTML = html;
  } else {
    side.classList.add('hidden');
  }

  // Player turn panel (active player chooses what to reveal)
  const pp = document.getElementById('bunker-player-panel');
  pp.classList.add('hidden');
  if (phase === 'turns' && isMyTurn && me && me.isAlive) {
    pp.classList.remove('hidden');
    const rev = me.bunkerRevealed || [];
    const avail = CARD_CATS.filter(c => !rev.includes(c.key));
    if (room.bunkerRound === 1) {
      // Only profession in round 1
      const pCard = me.bunkerCards?.profession;
      pp.innerHTML = '<p class="action-prompt">Покажи свою профессию</p>' +
        '<div class="night-targets"><div class="game-player-card targetable" onclick="bunkerRevealMyCard(\'profession\')">' +
        '<div class="gpc-avatar">🏥</div><div class="gpc-name">' + escapeHtml(pCard?.name || 'Профессия') + '</div></div></div>';
    } else {
      pp.innerHTML = '<p class="action-prompt">Выбери что раскрыть:</p>' +
        '<div class="night-targets">' +
        avail.map(c => '<div class="game-player-card targetable" style="min-height:60px;padding:8px" onclick="bunkerRevealMyCard(\'' + c.key + '\')">' +
          '<div class="gpc-name" style="font-size:0.9rem">' + c.label + '</div></div>').join('') +
        '</div>';
    }
  } else if (phase === 'turns' && activePid && !isMyTurn) {
    pp.classList.remove('hidden');
    const aname = room.players[activePid]?.name || '–';
    pp.innerHTML = '<p class="action-prompt">Ходит: <strong>' + escapeHtml(aname) + '</strong></p>';
  } else if (phase === 'turns' && !activePid) {
    pp.classList.remove('hidden');
    pp.innerHTML = '<p class="action-prompt">Ожидаем начала ходов...</p>';
  }

  // Host panel – minimal control
  const hp = document.getElementById('bunker-host-panel');
  hp.classList.add('hidden');
  let hh = '';
  if (myHost) {
    if (phase === 'catastrophe') {
      hh += '<p class="action-prompt">Катастрофа раскрыта</p><button class="btn btn-primary" onclick="bunkerStartTurns()">Начать ходы</button>';
    } else if (phase === 'discuss') {
      hh += '<p class="action-prompt">Ходы завершены</p>';
      if (room.bunkerRound >= 2) {
        hh += '<button class="btn btn-primary" onclick="bunkerVoteStart()">Голосование</button> ';
      } else {
        hh += '<button class="btn btn-primary" onclick="bunkerNextRound()">Следующий раунд</button>';
      }
    } else if (phase === 'vote') {
      const vc = alive.filter(p => p.hasVoted).length;
      const skipMult = 1 + (room.bunkerVoteSkipCount || 0);
      const kickCount = Math.max(1, Math.ceil(alive.length / 4)) * skipMult;
      const skipWarn = room.bunkerVoteSkipCount > 0 ? ' (×2 кика)' : '';
      hh += '<p class="action-prompt">Голоса: ' + vc + ' / ' + alive.length + ' · исключить: ' + kickCount + '</p>';
      hh += '<button class="btn btn-primary" onclick="bunkerVoteEnd()">Исключить</button> ';
      hh += '<button class="btn btn-secondary" onclick="bunkerSkipVote()">Пропустить' + skipWarn + '</button>';
    } else if (phase === 'event') {
      const evt = room.bunkerEvent;
      hh += '<p class="action-prompt">📢 ' + (evt ? evt.text : 'Событие') + '</p>';
      hh += '<button class="btn btn-primary" onclick="bunkerNextRound()">Следующий раунд</button>';
    }
  }
  if (hh) { hp.innerHTML = hh; hp.classList.remove('hidden'); }

  // Voting panel for non-host players
  if (!myHost && phase === 'vote' && me?.isAlive && !me.hasVoted) {
    pp.classList.remove('hidden');
    pp.innerHTML = '<p class="action-prompt">Кого исключить?</p>' +
      '<div class="night-targets">' +
      alive.filter(p => p.id !== playerId).map(p =>
        '<div class="game-player-card targetable" onclick="bunkerVote(\'' + p.id + '\')">' +
        '<div class="gpc-avatar">' + escapeHtml(p.name[0].toUpperCase()) + '</div>' +
        '<div class="gpc-name">' + escapeHtml(p.name) + '</div></div>').join('') +
      '</div>';
  }

  // Event for non-host
  if (!myHost && phase === 'event' && room.bunkerEvent) {
    pp.classList.remove('hidden');
    pp.innerHTML = '<div class="check-result-box"><p style="font-size:1rem;font-weight:700">📢 ' + room.bunkerEvent.text + '</p></div>';
  }

  // Result
  const rp = document.getElementById('bunker-result-panel');
  rp.classList.add('hidden');
  if (phase === 'result') {
    rp.classList.remove('hidden');
    const res = room.bunkerResult;
    const surv = res?.survived;
    const names = alive.map(p => p.name);
    rp.innerHTML = '<div class="bunker-result-card">' +
      '<div class="br-title ' + (surv ? 'survived' : 'dead') + '">' + (surv ? 'ВЫЖИЛИ!' : 'НЕ ВЫЖИЛИ...') + '</div>' +
      '<div class="br-list">В бункере: <strong>' + names.join(', ') + '</strong></div>' +
      '</div><button class="btn btn-primary" onclick="returnToLobby()">В лобби</button>';
    if (!window._lobbyReturnTimer) {
      window._lobbyReturnTimer = setTimeout(() => { window._lobbyReturnTimer = null; returnToLobby(); }, 60000);
    }
  }

  document.getElementById('bunker-actions').classList.toggle('hidden',
    pp.classList.contains('hidden') && hp.classList.contains('hidden') && rp.classList.contains('hidden'));
}

window.bunkerStartTurns = async () => { await api('/api/bunker_start_turns', { room: roomCode, player: playerId }); };
window.bunkerRevealMyCard = async (cat) => { await api('/api/bunker_reveal_card', { room: roomCode, player: playerId, category: cat }); };
window.bunkerVoteStart = async () => { await api('/api/bunker_vote_start', { room: roomCode, player: playerId }); };
window.bunkerVote = async (tid) => {
  const r = await api('/api/bunker_vote', { room: roomCode, player: playerId, target: tid });
  if (r.type === 'error') showToast(r.message);
  else showToast('Голос принят!');
};
window.bunkerVoteEnd = async () => { await api('/api/bunker_vote_end', { room: roomCode, player: playerId }); };
window.bunkerSkipVote = async () => { await api('/api/bunker_skip_vote', { room: roomCode, player: playerId }); };
window.bunkerNextRound = async () => { await api('/api/bunker_next_round', { room: roomCode, player: playerId }); };

window.spyAsk = async (targetId) => {
  const res = await api('/api/spy_ask', { room: roomCode, player: playerId, target: targetId });
  if (res.type === 'error') showToast(res.message);
  if (res.room) {
    roomState = res.room;
    myRole = roomState.players[playerId]?.role ?? null;
    renderSpyGame(roomState);
  }
};

window.spyReveal = async () => {
  const res = await api('/api/spy_reveal', { room: roomCode, player: playerId });
  if (res.type === 'error') showToast(res.message);
  if (res.room) {
    roomState = res.room;
    myRole = roomState.players[playerId]?.role ?? null;
    renderSpyGame(roomState);
  }
};

window.spyNextRound = async () => {
  const res = await api('/api/spy_next', { room: roomCode, player: playerId });
  if (res.type === 'error') showToast(res.message);
  if (res.room) {
    roomState = res.room;
    myRole = roomState.players[playerId]?.role ?? null;
    renderSpyGame(roomState);
  }
};

window.updateSpyCustomLocations = (value) => {
  spyCustomLocationsDraft = String(value || '').slice(0, 240);
};

window.updateAliasCustomWords = (value) => {
  aliasCustomWordsDraft = String(value || '').slice(0, 400);
};

window.setAliasTeam = async (team) => {
  const res = await api('/api/alias_set_team', { room: roomCode, player: playerId, team });
  if (res.type === 'error') showToast(res.message);
};

window.aliasStartRound = async () => {
  const res = await api('/api/alias_start_round', { room: roomCode, player: playerId });
  if (res.type === 'error') showToast(res.message);
  if (res.room) {
    roomState = res.room;
    renderAliasGame(roomState);
  }
};

window.aliasNextWord = async () => {
  const res = await api('/api/alias_next_word', { room: roomCode, player: playerId });
  if (res.type === 'error') showToast(res.message);
  if (res.room) {
    roomState = res.room;
    renderAliasGame(roomState);
  }
};

window.aliasSkip = async () => {
  const res = await api('/api/alias_skip', { room: roomCode, player: playerId });
  if (res.type === 'error') showToast(res.message);
  if (res.room) {
    roomState = res.room;
    renderAliasGame(roomState);
  }
};

window.aliasEndRound = async () => {
  const res = await api('/api/alias_end_round', { room: roomCode, player: playerId });
  if (res.type === 'error') showToast(res.message);
  if (res.room) {
    roomState = res.room;
    renderAliasGame(roomState);
  }
};

window.aliasSubmitReview = async () => {
  const checkedIndexes = Array.from(document.querySelectorAll('.alias-review-checkbox:checked'))
    .map(el => parseInt(el.value, 10))
    .filter(Number.isFinite);
  const res = await api('/api/alias_submit_review', { room: roomCode, player: playerId, checkedIndexes });
  if (res.type === 'error') showToast(res.message);
  if (res.room) {
    roomState = res.room;
    renderAliasGame(roomState);
  }
};

window.returnToLobby = async () => {
  if (!roomCode || !playerId) return;
  const res = await api('/api/return_lobby', { room: roomCode, player: playerId });
  if (res.type === 'error') showToast(res.message);
  if (res.room) {
    clearAliasCountdown();
    window._lobbyReturnTimer = null;
    roomState = res.room;
    myRole = null;
    hostActionType = null;
    selectedTarget = null;
    spyCustomLocationsDraft = '';
    aliasCustomWordsDraft = '';
    document.getElementById('room-code-label').textContent = roomState.code;
    showScreen('screen-lobby');
    renderLobby(roomState);
  }
};
