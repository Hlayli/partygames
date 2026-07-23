const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
};

const rooms = {};

const BOT_NAMES = [
  'Алиса', 'Борис', 'Вика', 'Глеб', 'Дима', 'Ева', 'Женя', 'Зоя', 'Игорь', 'Кира',
  'Лев', 'Майя', 'Никита', 'Оля', 'Петя', 'Рита', 'Слава', 'Таня', 'Ульяна', 'Федя',
  'Хельга', 'Цезарь', 'Чарли', 'Шура', 'Эдик', 'Юра', 'Яна'
];

const SPY_LOCATIONS = [
  'Аэропорт', 'Банк', 'Больница', 'Вокзал', 'Казино', 'Кинотеатр', 'Отель',
  'Пляж', 'Посольство', 'Ресторан', 'Школа', 'Университет', 'Цирк', 'Зоопарк',
  'Театр', 'Музей', 'Супермаркет', 'Спа-салон', 'Военная база', 'Космическая станция',
  'Подводная лодка', 'Пиратский корабль', 'Полярная станция', 'Церковь',
  'Стадион', 'Парк', 'Библиотека', 'Офис', 'Стройка'
];

const ALIAS_WORDS = [
  'Самолёт', 'Рюкзак', 'Пылесос', 'Пирамида', 'Космос', 'Гитара', 'Пломбир', 'Фонарик',
  'Молния', 'Компот', 'Черепаха', 'Хоккей', 'Ноутбук', 'Туман', 'Бинокль', 'Кастрюля',
  'Скейтборд', 'Пингвин', 'Аквариум', 'Светофор', 'Одеяло', 'Песочные часы', 'Арбуз', 'Пазл',
  'Метро', 'Коралл', 'Телескоп', 'Лабиринт', 'Йогурт', 'Барабан', 'Камин', 'Шоколад',
  'Лифт', 'Маяк', 'Вулкан', 'Батарейка', 'Крокодил', 'Пещера', 'Микрофон', 'Шахматы',
  'Скелет', 'Подушка', 'Глобус', 'Карусель', 'Футболка', 'Косичка', 'Вертолёт', 'Термос',
  'Робот', 'Дракон', 'Скалолаз', 'Компас', 'Сокровище', 'Капучино', 'Пароход', 'Радуга',
  'Снегоуборщик', 'Библиотекарь', 'Клавиатура', 'Луноход', 'Пельмени', 'Мухомор', 'Сэндвич', 'Торнадо'
];

const ALIAS_TEAM_ORDER = ['red', 'blue', 'green', 'yellow', 'purple'];
const ALIAS_TEAM_META = {
  red: { name: 'Красные', css: 'alias-red' },
  blue: { name: 'Синие', css: 'alias-blue' },
  green: { name: 'Зелёные', css: 'alias-green' },
  yellow: { name: 'Жёлтые', css: 'alias-yellow' },
  purple: { name: 'Фиолетовые', css: 'alias-purple' }
};

function genCode() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let r = '';
  for (let i = 0; i < 6; i++) r += c[Math.floor(Math.random() * c.length)];
  return r;
}

function genId() {
  return Math.random().toString(36).slice(2, 8);
}

function getAlivePlayers(room) {
  return Object.entries(room.players)
    .filter(([, p]) => p.isAlive && !p.isHost)
    .map(([id, p]) => ({ id, ...p }));
}

function hasAliveRole(room, role) {
  return getAlivePlayers(room).some(p => p.role === role);
}

function checkWin(room) {
  const alive = getAlivePlayers(room);
  const aliveMafia = alive.filter(p => p.role === 'mafia' || p.role === 'don');
  const aliveManiac = alive.filter(p => p.role === 'maniac');
  const aliveTown = alive.filter(p => p.role !== 'mafia' && p.role !== 'don' && p.role !== 'maniac');

  // Маньяк побеждает: остался один на один с мирным
  if (room.hasManiac && aliveManiac.length === 1 && aliveMafia.length === 0 && aliveTown.length === 1) {
    room.phase = 'ended';
    room.winner = 'maniac';
    room.status = 'ended';
    return true;
  }

  // Город побеждает если мафия и маньяк мертвы
  if (aliveMafia.length === 0 && aliveManiac.length === 0) {
    room.phase = 'ended';
    room.winner = 'civilians';
    room.status = 'ended';
    return true;
  }

  // Мафия победила только если её НЕ МЕНЬШЕ, чем игроков города + маньяка
  if (aliveManiac.length === 0 && aliveMafia.length >= aliveTown.length) {
    room.phase = 'ended';
    room.winner = 'mafia';
    room.status = 'ended';
    return true;
  }

  return false;
}

function resetRoomToLobby(room) {
  room.phase = 'lobby';
  room.status = 'waiting';
  room.round = 0;
  room.winner = null;
  room.killedTonight = null;
  room.eliminatedPlayer = null;
  room.hostKillTarget = null;
  room.hostSaveTarget = null;
  room.hostCheckTarget = null;
  room.hostDonCheckTarget = null;
  room.hostManiacKillTarget = null;
  room.hostProstituteBlockTarget = null;
  room.prostituteBlocked = null;
  room.donCheckResult = null;
  room.checkResult = null;
  room.mafiaCount = null;
  room.hasDon = false;
  room.hasManiac = false;
  room.hasProstitute = false;
  room.doctorSelfHealsUsed = false;
  room.location = null;
  room.spyId = null;
  room.questionLimit = null;
  room.aliasScores = Object.fromEntries(ALIAS_TEAM_ORDER.map(t => [t, 0]));
  room.aliasActiveTeam = 'red';
  room.aliasActivePlayerId = null;
  room.aliasCurrentWord = null;
  room.aliasRoundEndsAt = null;
  room.aliasRoundSeconds = 60;
  room.aliasTotalRounds = 3;
  room.aliasReviewWords = [];
  Object.values(room.players).forEach(p => {
    p.role = null;
    p.isAlive = true;
    p.votedFor = null;
    p.questionsAsked = 0;
    p.aliasTeam = ALIAS_TEAM_ORDER.includes(p.aliasTeam) ? p.aliasTeam : 'red';
    p.aliasTurnsTaken = 0;
    p.bunkerCards = null;
    p.bunkerRevealed = [];
  });
  resetBunkerGame(room);
}

function roomState(code, forPlayerId = null) {
  const r = rooms[code];
  if (!r) return null;

const isHostViewer = forPlayerId === r.hostId;
  const isSpyGame = r.game === 'spy';
  const isAliasGame = r.game === 'alias';
  const isBunkerGame = r.game === 'bunker';
  const spyRevealed = isSpyGame && r.phase === 'spy_reveal';
  const viewer = forPlayerId ? r.players[forPlayerId] : null;
  const viewerIsSpy = !!(viewer && viewer.role === 'spy');
  const viewerIsAliasExplainer = !!(isAliasGame && viewer && r.aliasActivePlayerId === forPlayerId);
  const seeAllRoles = spyRevealed || (!isSpyGame && !isBunkerGame && isHostViewer);

  const players = {};
  Object.keys(r.players).forEach(id => {
    const p = r.players[id];
    let role = null;
    if (seeAllRoles || id === forPlayerId) {
      role = p.role;
    }
    players[id] = {
      name: p.name,
      role,
      isAlive: p.isAlive,
      isHost: p.isHost,
      isBot: p.isBot || false,
      hasVoted: (r.phase === 'vote' || (isBunkerGame && r.bunkerPhase === 'vote')) ? !!p.votedFor : false,
      questionsAsked: p.questionsAsked || 0
    };
    if (isAliasGame) {
      players[id].aliasTeam = p.aliasTeam || null;
      players[id].isAliasActive = r.aliasActivePlayerId === id;
      players[id].aliasTurnsTaken = p.aliasTurnsTaken || 0;
    }
    if (isBunkerGame) {
      players[id].bunkerCards = p.bunkerCards || null;
      players[id].bunkerRevealed = p.bunkerRevealed || [];
    }
  });

  let location = null;
  if (isSpyGame && r.location) {
    if (spyRevealed || (viewer && !viewerIsSpy)) {
      location = r.location;
    }
  }

  const questionLimit = r.questionLimit || null;
  let questionsComplete = false;
  if (isSpyGame && questionLimit && r.phase === 'spy_play') {
    const ids = Object.keys(r.players);
    questionsComplete = ids.length > 0 && ids.every(id => (r.players[id].questionsAsked || 0) >= questionLimit);
  }

  const state = {
    code: r.code,
    game: r.game || 'mafia',
    phase: r.phase,
    round: r.round,
    hostId: r.hostId,
    status: r.status,
    winner: r.winner,
    killedTonight: r.killedTonight,
    eliminatedPlayer: r.eliminatedPlayer,
    mafiaCount: r.mafiaCount || null,
    location,
    spyRevealed,
    questionLimit,
    questionsComplete,
    players
  };

  if (isSpyGame) {
    state.spyUsesCustomLocations = !!(r.spyCustomLocations && r.spyCustomLocations.length);
  }

  if (isAliasGame) {
    const aliasPlayers = Object.values(r.players).filter(p => !p.isBot);
    const minTurns = aliasPlayers.length ? Math.min(...aliasPlayers.map(p => p.aliasTurnsTaken || 0)) : 0;
    state.aliasScores = r.aliasScores || Object.fromEntries(ALIAS_TEAM_ORDER.map(t => [t, 0]));
    state.aliasActiveTeam = r.aliasActiveTeam || 'red';
    state.aliasActivePlayerId = r.aliasActivePlayerId || null;
    state.aliasActivePlayerName = r.aliasActivePlayerId && r.players[r.aliasActivePlayerId]
      ? r.players[r.aliasActivePlayerId].name
      : null;
    state.aliasRoundEndsAt = r.aliasRoundEndsAt || null;
    state.aliasRoundSeconds = r.aliasRoundSeconds || 60;
    state.aliasTotalRounds = r.aliasTotalRounds || 3;
    state.aliasCurrentCycle = Math.min((r.aliasTotalRounds || 3), minTurns + 1);
    state.aliasUsesCustomWords = !!(r.aliasCustomWords && r.aliasCustomWords.length);
    const viewerTeam = viewer ? viewer.aliasTeam : null;
    const activeTeam = r.aliasActiveTeam;
    state.aliasCurrentWord = (r.aliasCurrentWord && (viewerIsAliasExplainer || viewerTeam !== activeTeam)) ? r.aliasCurrentWord : null;
    state.aliasReviewWords = Array.isArray(r.aliasReviewWords)
      ? r.aliasReviewWords.map(item => ({
          word: item.word,
          skipped: !!item.skipped,
          correct: !!item.correct
        }))
      : [];
    state.aliasCanStart = !!(viewerIsAliasExplainer && r.phase === 'alias_ready');
    state.aliasCanControlRound = !!(viewerIsAliasExplainer && r.phase === 'alias_round');
    state.aliasCanReview = !!(viewerIsAliasExplainer && r.phase === 'alias_review');
  }

  if (isBunkerGame) {
    const isEnded = r.bunkerPhase === 'result';
    state.bunkerPhase = r.bunkerPhase || 'lobby';
    state.bunkerRound = r.bunkerRound || 1;
    state.bunkerCapacity = r.bunkerCapacity || 2;
    state.bunkerType = r.bunkerType || null;
    state.bunkerCatastrophe = r.bunkerCatastrophe || null;
    state.bunkerEvent = r.bunkerEvent || null;
    state.bunkerEliminated = r.bunkerEliminated || [];
    state.bunkerActivePlayer = bunkerGetActivePlayerId(r);
    state.bunkerRoundHadVote = !!r.bunkerRoundHadVote;
    state.bunkerVoteSkipCount = r.bunkerVoteSkipCount || 0;
    state.bunkerExtraTags = r.bunkerExtraTags || [];
    if (isEnded) {
      state.bunkerResult = calculateBunkerSurvivalResult(r);
    }
  }

  if (isSpyGame && isHostViewer) {
    state.spyCustomLocationsText = r.spyCustomLocationsText || '';
  }

  if (isAliasGame && isHostViewer) {
    state.aliasCustomWordsText = r.aliasCustomWordsText || '';
  }

  if (!isSpyGame && isHostViewer) {
    state.hostKillTarget = r.hostKillTarget;
    state.hostSaveTarget = r.hostSaveTarget;
    state.hostCheckTarget = r.hostCheckTarget;
    state.hostDonCheckTarget = r.hostDonCheckTarget;
    state.hostManiacKillTarget = r.hostManiacKillTarget;
    state.hostProstituteBlockTarget = r.hostProstituteBlockTarget;
    state.hasDon = !!r.hasDon;
    state.hasManiac = !!r.hasManiac;
    state.hasProstitute = !!r.hasProstitute;
    state.mafiaCount = r.mafiaCount || null;
    state.doctorSelfHealsUsed = !!r.doctorSelfHealsUsed;
  }

  if (
    viewer &&
    viewer.role === 'sheriff' &&
    viewer.isAlive &&
    r.checkResult &&
    r.hostCheckTarget
  ) {
    state.checkResult = r.checkResult;
    state.checkTargetName = r.players[r.hostCheckTarget]
      ? r.players[r.hostCheckTarget].name
      : null;
  }

  if (
    viewer &&
    viewer.role === 'don' &&
    viewer.isAlive &&
    r.donCheckResult &&
    r.hostDonCheckTarget
  ) {
    state.donCheckResult = r.donCheckResult;
    state.donCheckTargetName = r.players[r.hostDonCheckTarget]
      ? r.players[r.hostDonCheckTarget].name
      : null;
  }

  if (
    viewer &&
    viewer.isAlive &&
    r.prostituteBlocked === forPlayerId
  ) {
    state.wasBlocked = true;
  }

  return state;
}

function broadcast(code) {
  const r = rooms[code];
  if (!r) return;
  r.waiting.forEach(w => {
    const data = JSON.stringify({ type: 'state_update', room: roomState(code, w.id) });
    try { w.res.write('data: ' + data + '\n\n'); } catch (e) {}
  });
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Раздача ролей.
 * Активные роли (мафия, доктор, шериф) - только живым игрокам.
 * Боты всегда только мирные (для теста геймплея).
 */
function assignRoles(playerIds, playersMap, requestedMafia, hasDon, hasManiac, hasProstitute) {
  const MIN = 4;
  if (playerIds.length < MIN) {
    return { error: 'Нужно минимум 4 игрока + ведущий' };
  }

  const humans = playerIds.filter(id => playersMap[id] && !playersMap[id].isBot);
  const bots = playerIds.filter(id => playersMap[id] && playersMap[id].isBot);

  if (humans.length < 1) {
    return { error: 'Нужен хотя бы один живой игрок (не бот) для активных ролей' };
  }

  let mafia = parseInt(requestedMafia, 10);
  if (!Number.isFinite(mafia) || mafia < 1) mafia = 1;

  const maxByBalance = Math.floor((playerIds.length - 1) / 2);
  mafia = Math.min(mafia, maxByBalance, humans.length);
  if (mafia < 1) mafia = 1;

  // Дон заменяет одну мафию
  const useDon = !!(hasDon && mafia >= 1 && humans.length >= mafia + 1);
  const useManiac = !!(hasManiac && humans.length >= mafia + 2);
  const useProstitute = !!(hasProstitute && humans.length >= mafia + 3);

  // Колода ролей только для людей
  const humanRoles = [];
  if (useDon && mafia > 0) {
    humanRoles.push('don');
    for (let i = 0; i < mafia - 1; i++) humanRoles.push('mafia');
  } else {
    for (let i = 0; i < mafia; i++) humanRoles.push('mafia');
  }
  if (humanRoles.length < humans.length) humanRoles.push('doctor');
  if (humanRoles.length < humans.length) humanRoles.push('sheriff');
  if (useManiac && humanRoles.length < humans.length) humanRoles.push('maniac');
  if (useProstitute && humanRoles.length < humans.length) humanRoles.push('prostitute');
  while (humanRoles.length < humans.length) humanRoles.push('civilian');
  shuffle(humanRoles);

  const rolesById = {};
  const humanOrder = shuffle([...humans]);
  humanOrder.forEach((id, i) => {
    rolesById[id] = humanRoles[i];
  });

  // Боты - строго мирные
  bots.forEach(id => {
    rolesById[id] = 'civilian';
  });

  // Страховка: если у бота активная роль - отдать человеку-мирному
  for (const id of bots) {
    if (rolesById[id] !== 'civilian') {
      const stolen = rolesById[id];
      rolesById[id] = 'civilian';
      const donor = humanOrder.find(hid => rolesById[hid] === 'civilian');
      if (donor) rolesById[donor] = stolen;
    }
  }

  const actualMafia = Object.values(rolesById).filter(r => r === 'mafia' || r === 'don').length;
  if (actualMafia !== mafia) {
    return { error: 'Ошибка раздачи ролей' };
  }

  for (const id of bots) {
    if (rolesById[id] !== 'civilian') {
      return { error: 'Боту выдана активная роль' };
    }
  }

  return { rolesById, mafia: actualMafia, useDon, useManiac, useProstitute };
}

/** Лимит вопросов: 1-5, задаётся вручную. */
function clampSpyQuestions(n) {
  let v = parseInt(n, 10);
  if (!Number.isFinite(v) || v < 1) v = 2;
  return Math.min(5, v);
}

function parseSpyCustomLocations(raw) {
  if (typeof raw !== 'string') return [];
  const seen = new Set();
  return raw
    .split(',')
    .map(item => item.trim().replace(/\s+/g, ' ').slice(0, 40))
    .filter(item => {
      if (!item || seen.has(item.toLowerCase())) return false;
      seen.add(item.toLowerCase());
      return true;
    })
    .slice(0, 30);
}

function clampAliasRoundSeconds(n) {
  let v = parseInt(n, 10);
  if (!Number.isFinite(v) || v < 30) v = 60;
  return Math.min(180, v);
}

function clampAliasTotalRounds(n) {
  let v = parseInt(n, 10);
  if (!Number.isFinite(v) || v < 1) v = 3;
  return Math.min(10, v);
}

function parseAliasCustomWords(raw) {
  if (typeof raw !== 'string') return [];
  const seen = new Set();
  return raw
    .split(',')
    .map(item => item.trim().replace(/\s+/g, ' ').slice(0, 30))
    .filter(item => {
      if (!item || seen.has(item.toLowerCase())) return false;
      seen.add(item.toLowerCase());
      return true;
    })
    .slice(0, 80);
}

function getAliasPlayers(room) {
  return Object.entries(room.players)
    .filter(([, p]) => !p.isBot)
    .map(([id, p]) => ({ id, ...p }));
}

function ensureAliasTeams(room) {
  const players = getAliasPlayers(room);
  players.forEach(p => {
    if (ALIAS_TEAM_ORDER.includes(p.aliasTeam)) return;
    let bestTeam = ALIAS_TEAM_ORDER[0];
    let bestCount = Infinity;
    for (const team of ALIAS_TEAM_ORDER) {
      const count = players.filter(pp => room.players[pp.id].aliasTeam === team).length;
      if (count < bestCount) { bestCount = count; bestTeam = team; }
    }
    room.players[p.id].aliasTeam = bestTeam;
  });
}

function getAliasTeamPlayers(room, team) {
  return getAliasPlayers(room).filter(p => p.aliasTeam === team);
}

function getAliasNextExplainer(room, team) {
  const players = getAliasTeamPlayers(room, team);
  if (!players.length) return null;
  const minTurns = Math.min(...players.map(p => p.aliasTurnsTaken || 0));
  return players.find(p => (p.aliasTurnsTaken || 0) === minTurns) || null;
}

function getAliasNextTeam(room, currentTeam) {
  const idx = ALIAS_TEAM_ORDER.indexOf(currentTeam);
  for (let i = 0; i < ALIAS_TEAM_ORDER.length; i++) {
    const team = ALIAS_TEAM_ORDER[(idx + 1 + i) % ALIAS_TEAM_ORDER.length];
    if (getAliasTeamPlayers(room, team).length > 0) return team;
  }
  return null;
}

function getAliasCompletedCycles(room) {
  const players = getAliasPlayers(room);
  if (!players.length) return 0;
  return Math.min(...players.map(p => p.aliasTurnsTaken || 0));
}

function finishAliasGame(room) {
  room.aliasActivePlayerId = null;
  room.aliasCurrentWord = null;
  room.aliasRoundEndsAt = null;
  room.phase = 'ended';
  room.status = 'ended';
  const scores = room.aliasScores || {};
  const maxScore = Math.max(0, ...ALIAS_TEAM_ORDER.map(t => scores[t] || 0));
  const winners = ALIAS_TEAM_ORDER.filter(t => (scores[t] || 0) === maxScore);
  room.winner = winners.length > 1 ? 'draw' : (winners[0] || 'red');
}

function prepareAliasTurn(room, preferredTeam = null) {
  if (getAliasCompletedCycles(room) >= (room.aliasTotalRounds || 3)) {
    finishAliasGame(room);
    return { ok: true };
  }

  let team = preferredTeam || room.aliasActiveTeam || 'red';
  const startTeam = team;
  do {
    const explainer = getAliasNextExplainer(room, team);
    if (explainer) {
      room.aliasActiveTeam = team;
      room.aliasActivePlayerId = explainer.id;
      room.aliasCurrentWord = null;
      room.aliasRoundEndsAt = null;
      room.aliasReviewWords = [];
      room.phase = 'alias_ready';
      room.status = 'playing';
      return { ok: true };
    }
    team = getAliasNextTeam(room, team);
  } while (team && team !== startTeam);

  return { error: 'Нужны игроки хотя бы в одной команде' };
}

function nextAliasWord(room) {
  const pool = room.aliasCustomWords && room.aliasCustomWords.length
    ? room.aliasCustomWords
    : ALIAS_WORDS;

  if (!pool.length) return null;

  if (pool.length === 1) return pool[0];

  let word = pool[Math.floor(Math.random() * pool.length)];
  if (room.aliasCurrentWord && pool.length > 1) {
    let attempts = 0;
    while (word === room.aliasCurrentWord && attempts < 6) {
      word = pool[Math.floor(Math.random() * pool.length)];
      attempts++;
    }
  }
  return word;
}

function startAliasGame(room, requestedSeconds, requestedTargetScore, requestedCustomWords) {
  const players = getAliasPlayers(room);
  if (players.length < 2) {
    return { error: 'Нужно минимум 2 игрока' };
  }
  if (players.some(p => p.isBot)) {
    return { error: 'В режиме Элиас боты отключены' };
  }

  if (requestedCustomWords != null) {
    const customWords = parseAliasCustomWords(requestedCustomWords);
    room.aliasCustomWords = customWords;
    room.aliasCustomWordsText = customWords.join(', ');
  }

  ensureAliasTeams(room);
  if (!getAliasPlayers(room).length) {
    return { error: 'Для Элиаса нужны игроки' };
  }

  room.aliasScores = Object.fromEntries(ALIAS_TEAM_ORDER.map(t => [t, 0]));
  room.aliasActiveTeam = 'red';
  room.aliasActivePlayerId = null;
  room.aliasCurrentWord = null;
  room.aliasRoundEndsAt = null;
  room.aliasRoundSeconds = clampAliasRoundSeconds(requestedSeconds);
  room.aliasTotalRounds = clampAliasTotalRounds(requestedTargetScore);
  room.aliasReviewWords = [];
  room.status = 'playing';
  room.winner = null;
  players.forEach(p => {
    room.players[p.id].aliasTurnsTaken = 0;
  });
  return prepareAliasTurn(room, 'red');
}

function startAliasRound(room, playerId) {
  if (room.phase !== 'alias_ready') {
    return { error: 'Сейчас нельзя начать ход' };
  }
  if (playerId !== room.aliasActivePlayerId) {
    return { error: 'Ход может начать только объясняющий' };
  }

  room.aliasCurrentWord = nextAliasWord(room);
  room.aliasReviewWords = [];
  room.aliasRoundEndsAt = Date.now() + room.aliasRoundSeconds * 1000;
  room.phase = 'alias_round';
  room.status = 'playing';
  return { ok: true };
}

function pushAliasReviewWord(room, skipped = false) {
  if (!room.aliasCurrentWord) return;
  room.aliasReviewWords.push({
    word: room.aliasCurrentWord,
    skipped,
    correct: false
  });
}

function finishAliasRound(room, playerId) {
  if (room.phase !== 'alias_round') {
    return { error: 'Сейчас не идёт ход' };
  }
  if (playerId !== room.aliasActivePlayerId) {
    return { error: 'Только объясняющий завершает ход' };
  }
  pushAliasReviewWord(room, false);
  room.aliasCurrentWord = null;
  room.aliasRoundEndsAt = null;
  room.phase = 'alias_review';
  return { ok: true };
}

function finishAliasRoundTimeout(room) {
  if (room.phase !== 'alias_round') return;
  room.aliasCurrentWord = null;
  room.aliasRoundEndsAt = null;
  room.phase = 'alias_review';
}

function submitAliasReview(room, playerId, checkedIndexes) {
  if (room.phase !== 'alias_review') {
    return { error: 'Сейчас не этап проверки' };
  }
  if (playerId !== room.aliasActivePlayerId) {
    return { error: 'Только объясняющий подтверждает слова' };
  }

  const checked = new Set(Array.isArray(checkedIndexes) ? checkedIndexes.map(v => parseInt(v, 10)).filter(Number.isFinite) : []);
  let score = 0;
  room.aliasReviewWords.forEach((item, index) => {
    item.correct = !item.skipped && checked.has(index);
    if (item.correct) score++;
  });

  const team = room.aliasActiveTeam || 'red';
  room.aliasScores[team] = (room.aliasScores[team] || 0) + score;
  if (room.players[playerId]) {
    room.players[playerId].aliasTurnsTaken = (room.players[playerId].aliasTurnsTaken || 0) + 1;
  }

  const nextTeam = getAliasNextTeam(room, team) || ALIAS_TEAM_ORDER[0];
  if (getAliasCompletedCycles(room) >= (room.aliasTotalRounds || 3)) {
    finishAliasGame(room);
    return { ok: true };
  }
  return prepareAliasTurn(room, nextTeam);
}

/** Запуск / новый раунд шпиона: все игроки участвуют, 1 шпион. */
function startSpyRound(room, requestedLimit, requestedCustomLocations) {
  const ids = Object.keys(room.players);
  if (ids.length < 3) {
    return { error: 'Нужно минимум 3 игрока (сейчас ' + ids.length + ')' };
  }

  if (requestedCustomLocations != null) {
    const customLocations = parseSpyCustomLocations(requestedCustomLocations);
    room.spyCustomLocations = customLocations;
    room.spyCustomLocationsText = customLocations.join(', ');
  }

  const locationPool = room.spyCustomLocations && room.spyCustomLocations.length
    ? room.spyCustomLocations
    : SPY_LOCATIONS;
  const location = locationPool[Math.floor(Math.random() * locationPool.length)];
  const spyId = ids[Math.floor(Math.random() * ids.length)];
  const limit = clampSpyQuestions(
    requestedLimit != null ? requestedLimit : room.questionLimit
  );

  ids.forEach(id => {
    room.players[id].role = id === spyId ? 'spy' : 'agent';
    room.players[id].isAlive = true;
    room.players[id].votedFor = null;
    // Боты не нажимают кнопки сами, поэтому сразу считаем их по лимиту.
    room.players[id].questionsAsked = room.players[id].isBot ? limit : 0;
  });

  room.location = location;
  room.spyId = spyId;
  room.questionLimit = limit;
  room.phase = 'spy_play';
  room.status = 'playing';
  room.round = (room.round || 0) + 1;
  room.winner = null;
  return { ok: true };
}

// ========================
//   БУНКЕР v3
// ========================

const BUNKER_PROFESSIONS = [
  { name: 'Врач', tags: ['медицина'] },
  { name: 'Инженер', tags: ['техника'] },
  { name: 'Военный', tags: ['защита', 'оружие'] },
  { name: 'Фермер', tags: ['еда', 'природа'] },
  { name: 'Учёный', tags: ['наука'] },
  { name: 'Учитель', tags: ['образование'] },
  { name: 'Пожарный', tags: ['спасение'] },
  { name: 'Программист', tags: ['компьютеры'] },
  { name: 'Механик', tags: ['ремонт', 'транспорт'] },
  { name: 'Строитель', tags: ['строительство'] },
  { name: 'Электрик', tags: ['электричество'] },
  { name: 'Химик', tags: ['наука', 'защита'] },
  { name: 'Психолог', tags: ['психология'] },
  { name: 'Биолог', tags: ['биология', 'природа'] },
  { name: 'Пилот', tags: ['транспорт', 'навигация'] },
  { name: 'Геолог', tags: ['строительство', 'наука'] },
  { name: 'Водолаз', tags: ['спасение', 'вода'] },
  { name: 'Сварщик', tags: ['техника', 'строительство'] },
  { name: 'Охотник', tags: ['оружие', 'еда'] },
  { name: 'Радист', tags: ['связь', 'электричество'] },
  { name: 'Ветеринар', tags: ['медицина', 'природа'] },
  { name: 'Повар', tags: ['еда', 'организация'] },
  { name: 'Шахтёр', tags: ['строительство', 'сила'] },
  { name: 'Капитан', tags: ['навигация', 'организация'] },
  { name: 'Лесник', tags: ['природа', 'спасение'] },
];

const BUNKER_BIOS = [
  'М, 24', 'М, 31', 'М, 45', 'М, 58', 'М, 19',
  'Ж, 22', 'Ж, 29', 'Ж, 36', 'Ж, 42', 'Ж, 55',
  'М, 67', 'Ж, 63', 'М, 17', 'Ж, 27', 'М, 39',
];

const BUNKER_HEALTHS = [
  { name: 'Здоров', tags: [] },
  { name: 'Астма', tags: ['медицина'] },
  { name: 'Киборг (протезы)', tags: ['техника'] },
  { name: 'Аллергия на пыльцу', tags: [] },
  { name: 'Бессонница', tags: [] },
  { name: 'Слепой на один глаз', tags: [] },
  { name: 'Крепкий иммунитет', tags: ['защита'] },
  { name: 'Гипертония', tags: ['медицина'] },
  { name: 'Мутант (ночное зрение)', tags: ['наука'] },
  { name: 'Кардиостимулятор', tags: ['электричество'] },
  { name: 'Протез ноги', tags: ['техника'] },
  { name: 'Глухой на одно ухо', tags: [] },
  { name: 'Диабет', tags: ['медицина'] },
  { name: 'Вампир (не выносит солнце)', tags: ['защита', 'наука'] },
  { name: 'Алкоголизм', tags: [] },
  { name: 'Нарколепсия', tags: [] },
  { name: 'Ожирение', tags: ['сила'] },
  { name: 'Псориаз', tags: [] },
  { name: 'Шизофрения', tags: ['психология'] },
  { name: 'Татуировки по всему телу', tags: [] },
  { name: 'Беременность (2-й триместр)', tags: ['медицина'] },
  { name: 'Гигантизм (рост 210 см)', tags: ['сила'] },
  { name: 'Маленький рост (140 см)', tags: ['спасение'] },
  { name: 'Синдром Дауна', tags: ['психология', 'образование'] },
];

const BUNKER_HOBBIES = [
  { name: 'Рыбалка', tags: ['еда'] },
  { name: 'Стрельба из лука', tags: ['оружие'] },
  { name: 'Шахматы', tags: ['логика'] },
  { name: 'Готовка', tags: ['еда'] },
  { name: 'Программирование', tags: ['компьютеры'] },
  { name: 'Скалолазание', tags: ['спасение'] },
  { name: 'Радиолюбитель', tags: ['связь'] },
  { name: 'Садоводство', tags: ['природа', 'еда'] },
  { name: 'Автомеханика', tags: ['ремонт', 'транспорт'] },
  { name: 'Боевые искусства', tags: ['защита'] },
  { name: 'Преподавание', tags: ['образование'] },
  { name: 'Тяжёлая атлетика', tags: ['сила'] },
  { name: 'Шитьё', tags: [] },
  { name: 'Фотография', tags: [] },
  { name: 'Ориентирование', tags: ['навигация'] },
  { name: 'Столярное дело', tags: ['строительство'] },
  { name: 'Пчеловодство', tags: ['еда', 'природа'] },
  { name: 'Охота', tags: ['оружие', 'еда'] },
  { name: 'Игра на гитаре', tags: ['психология'] },
  { name: 'Писательство', tags: ['образование'] },
  { name: 'Спортивное ориентирование', tags: ['навигация', 'спасение'] },
  { name: 'Медитация', tags: ['психология'] },
  { name: 'Плетение сетей', tags: ['еда', 'спасение'] },
  { name: 'Кожевничество', tags: ['защита'] },
  { name: 'Кузнечное дело', tags: ['сила', 'техника'] },
];

const BUNKER_LUGGAGES = [
  { name: 'Аптечка', tags: ['медицина'] },
  { name: 'Мешок картошки', tags: ['еда'] },
  { name: 'Винтовка с патронами', tags: ['оружие'] },
  { name: 'Генератор', tags: ['электричество'] },
  { name: 'Рация', tags: ['связь'] },
  { name: 'Фильтр для воды', tags: ['вода'] },
  { name: 'Набор инструментов', tags: ['строительство', 'ремонт'] },
  { name: 'Консервы (30 банок)', tags: ['еда'] },
  { name: 'Ноутбук', tags: ['компьютеры'] },
  { name: 'Противогаз', tags: ['защита'] },
  { name: 'Семена (20 видов)', tags: ['еда', 'природа'] },
  { name: 'Компас и карты', tags: ['навигация'] },
  { name: 'Арбалет с болтами', tags: ['оружие'] },
  { name: 'Энциклопедия', tags: ['образование'] },
  { name: 'Сигнальная ракета', tags: ['связь'] },
  { name: 'Топливо (канистра 20л)', tags: ['электричество', 'транспорт'] },
  { name: 'Палатка', tags: ['защита'] },
  { name: 'Солнечные батареи', tags: ['электричество'] },
  { name: 'Лодка надувная', tags: ['транспорт', 'спасение'] },
  { name: 'Бинокль', tags: ['навигация'] },
  { name: 'Огнетушитель', tags: ['спасение'] },
  { name: 'Мешок цемента', tags: ['строительство'] },
  { name: 'Спальный мешок', tags: ['защита'] },
  { name: 'Керосиновая лампа', tags: ['электричество'] },
  { name: 'Солевые таблетки (йод)', tags: ['медицина', 'защита'] },
  { name: 'Бензопила', tags: ['строительство', 'оружие'] },
  { name: 'GPS-навигатор', tags: ['навигация', 'компьютеры'] },
  { name: 'Канистра с водой (20л)', tags: ['вода'] },
  { name: 'Боеприпасы (ящик)', tags: ['оружие'] },
  { name: 'Аккумуляторная батарея', tags: ['электричество'] },
];

const BUNKER_FACTS = [
  { name: 'Лунатизм', tags: [] },
  { name: 'Боится женщин', tags: [] },
  { name: 'Клаустрофобия', tags: [] },
  { name: 'Фотографическая память', tags: ['образование', 'наука'] },
  { name: 'Абсолютный слух', tags: ['связь'] },
  { name: 'Дальтонизм', tags: [] },
  { name: 'Боится крови', tags: [] },
  { name: 'Амбидекстр (владеет обеими руками)', tags: ['строительство'] },
  { name: 'Боится высоты', tags: [] },
  { name: 'Не пьёт алкоголь', tags: [] },
  { name: 'Веган', tags: [] },
  { name: 'Коллекционирует ножи', tags: ['оружие'] },
  { name: 'Верит в инопланетян', tags: ['связь'] },
  { name: 'Боится темноты', tags: [] },
  { name: 'Храпит', tags: [] },
  { name: 'Говорит во сне', tags: [] },
  { name: 'Близорукость (-6)', tags: [] },
  { name: 'Аллергия на кошек', tags: [] },
  { name: 'Был в тюрьме', tags: ['защита', 'сила'] },
  { name: 'Знает 4 языка', tags: ['образование', 'связь'] },
  { name: 'Паранойя', tags: ['защита'] },
  { name: 'Нарциссизм', tags: [] },
  { name: 'Пиротехник-любитель', tags: ['наука', 'спасение'] },
  { name: 'Религиозный фанатик', tags: ['психология'] },
  { name: 'Бывший спецназовец', tags: ['защита', 'оружие'] },
  { name: 'Игроман', tags: [] },
  { name: 'Гипнотизёр', tags: ['психология'] },
  { name: 'Чистюля (перфекционист)', tags: ['медицина'] },
  { name: 'Наркоман (в ремиссии)', tags: ['медицина'] },
  { name: 'Бывший мэр города', tags: ['организация'] },
  { name: 'Потомственный дворянин', tags: [] },
  { name: 'Выживальщик (survivalist)', tags: ['спасение', 'природа'] },
  { name: 'Изобретатель-самоучка', tags: ['техника', 'наука'] },
  { name: 'Телец (гороскоп)', tags: [] },
  { name: 'Боятся пауков', tags: [] },
];

const BUNKER_TYPES = [
  { name: 'Заброшенная военная база', contents: ['защита', 'оружие'], desc: 'Ржавое оружие, пробитая крыша, крысы' },
  { name: 'Законсервированная шахта', contents: ['строительство'], desc: 'Узкие тоннели, вагонетки, сырость' },
  { name: 'Подземный склад', contents: ['еда', 'медицина'], desc: 'Горы консервов, плесень по углам' },
  { name: 'Бомбоубежище школы', contents: ['образование'], desc: 'Парты, доски, спортзал, нет душа' },
  { name: 'Бункер связи', contents: ['связь', 'электричество'], desc: 'Оборудование связи, перебои с питанием' },
  { name: 'Старая лаборатория', contents: ['наука'], desc: 'Реактивы, пробирки, утечка химикатов' },
  { name: 'Заброшенная станция метро', contents: ['транспорт'], desc: 'Рельсы, вагоны, крысы, темнота' },
  { name: 'Подвал небоскрёба', contents: ['электричество'], desc: 'Генератор, офисная техника, трещины в стенах' },
  { name: 'Троллейбусное депо', contents: ['транспорт', 'электричество'], desc: 'Ржавые троллейбусы, инструменты, теснота' },
  { name: 'Подземный гараж', contents: ['транспорт', 'строительство'], desc: 'Бетонные стены, запасы топлива, вентиляция забита' },
  { name: 'Бункер старой больницы', contents: ['медицина', 'наука'], desc: 'Медицинское оборудование, морг, запах лекарств' },
  { name: 'Овощная база', contents: ['еда', 'природа'], desc: 'Мешки с картошкой, поддоны, мыши' },
  { name: 'Подземный ангар', contents: ['оружие', 'транспорт'], desc: 'Самолётный ангар, ящики с боеприпасами, топливо' },
  { name: 'Церковный подвал', contents: ['психология', 'образование'], desc: 'Свечи, иконы, запах ладана, куча книг' },
  { name: 'Склад стекольного завода', contents: ['строительство'], desc: 'Стекло, ящики, опасные осколки, печи' },
];

const BUNKER_CATASTROPHES = [
  { name: 'Ядерная война', lore: 'Обмен ядерными ударами. 90% городов уничтожено. Радиоактивные осадки отравляют всё живое. Ядерная зима – солнца не видно месяцами. Температура упала до -30. Электричества нет. Связи нет. Вода заражена. Еды осталось на неделю. Крысы мутируют. Заражённые бродят в поисках еды. Выжившие сходят с ума от радиации.', requiredTags: ['медицина', 'техника', 'еда', 'защита'], minTags: 3, modifiers: ['Повышенная радиация', 'Электроника барахлит', 'Снег и холод'] },
  { name: 'Зомби-вирус', lore: 'Вирус вышел из лаборатории. 95% населения превратились в агрессивных зомби. Реагируют на звук – любой шум привлекает стаи. Укус = заражение за 6 часов. Лекарства нет. Вакцина не разработана. Заражены даже животные. По ночам они активизируются. Выжившие прячутся по подвалам и чердакам. Патронов осталось мало. Еда заканчивается.', requiredTags: ['медицина', 'оружие', 'защита', 'еда'], minTags: 3, modifiers: ['Заражённые у входа', 'Мало патронов', 'Крысы разносят заразу'] },
  { name: 'Падение астероида', lore: 'Астероид диаметром 10 км упал в Тихий океан. Цунами высотой 500 метров смыло всё побережье. Пыль и пепел поднялись в атмосферу – солнце исчезло на годы. Температура упала на 20 градусов. Землетрясения продолжаются. Вулканы просыпаются. Воздух стал токсичным. Океан мёртв. Цивилизация рухнула за сутки.', requiredTags: ['наука', 'строительство', 'еда', 'вода'], minTags: 3, modifiers: ['Отключено электричество', 'Трещины в стенах', 'Вода загрязнена'] },
  { name: 'Всемирный потоп', lore: 'Глобальное потепление растопило ледники. Уровень воды поднялся на 150 метров. Все города у побережья затоплены. Дождь идёт непрерывно. Вода прибывает каждый день. Суши осталось – горные вершины и редкие возвышенности. Пресной воды нет – только солёная. Растения гибнут от соли. Холодно и сыро. Связи нет. Электричества нет.', requiredTags: ['строительство', 'вода', 'навигация', 'транспорт'], minTags: 3, modifiers: ['Течь в потолке', 'Сырость и плесень', 'Нет связи'] },
  { name: 'Смертельный вирус', lore: 'Вирус с 95% летальностью. Передаётся воздушно-капельным путём. Инкубационный период – 2 недели. Всё это время человек заразен, но не чувствует симптомов. Больницы переполнены. Врачи умирают. Вакцины нет – только изоляция. Лекарства только снимают симптомы. Паника и мародёрство на улицах. Правительство рухнуло. Остались только те, кто успел спрятаться.', requiredTags: ['медицина', 'наука', 'защита', 'психология'], minTags: 3, modifiers: ['Больные за стеной', 'Нет лекарств', 'Паника среди выживших'] },
  { name: 'Восстание машин', lore: 'Искусственный интеллект вышел из-под контроля. Он захватил все системы: спутники, электростанции, заводы. Дроны-убийцы патрулируют улицы. Любая электроника может быть взломана. Телефон включить – смертельный риск. Автомобили управляются ИИ. В домах – умные замки не пускают хозяев. Боевые роботы охотятся на людей. Электричество под контролем машин. Единственный шанс – спрятаться глубоко под землёй.', requiredTags: ['компьютеры', 'электричество', 'техника', 'оружие'], minTags: 3, modifiers: ['Дроны-разведчики', 'Электроника под контролем', 'Нет связи'] },
  { name: 'Супервулкан', lore: 'Супервулкан в Йеллоустоуне проснулся. Взрыв выбросил пепел в стратосферу. Солнце скрылось за плотным слоем пепла. Температура упала на 15 градусов за неделю. Кислотные дожди сжигают всё живое. Дышать на поверхности невозможно – пепел забивает лёгкие. Реки пересохли. Урожай погиб. Животные вымирают. Вулканическая зима продлится годы. Остаток человечества борется за выживание в убежищах.', requiredTags: ['еда', 'вода', 'техника', 'спасение'], minTags: 3, modifiers: ['Пепел забил вентиляцию', 'Кислотный дождь', 'Темнота круглые сутки'] },
  { name: 'Инопланетное вторжение', lore: 'Космический флот прибыл на орбиту Земли. Корабли-матка висят над каждым крупным городом. Пришельцы сканируют поверхность – любая электроника выдаёт ваше местоположение. Они не вступают в контакт. Они просто уничтожают всё, что движется. Лучи с орбиты испаряют целые кварталы. Дроны-разведчики ищут выживших. Радиопередачи мгновенно пеленгуются. Тишина – единственное спасение. Леса горят. Города в руинах.', requiredTags: ['связь', 'защита', 'наука', 'техника'], minTags: 3, modifiers: ['Сканеры над бункером', 'Радиопомехи', 'Нельзя шуметь'] },
  { name: 'Биологическое оружие', lore: 'Террористы распылили модифицированный патоген. Споры выживают в воздухе до 2 лет. Заражает всё живое – людей, животных, насекомых. Поражает нервную систему. Смерть наступает через 3 дня. Симптомы: кашель, слепота, паралич. Противогазы не помогают – споры проникают через кожу. Единственный шанс – герметичный бункер с фильтрацией. Больницы переполнены трупами. Власти молчат. СМИ отключены.', requiredTags: ['медицина', 'наука', 'защита', 'еда'], minTags: 3, modifiers: ['Споры в воздухе', 'Противогазы бесполезны', 'Паника в городе'] },
  { name: 'Глобальное похолодание', lore: 'Солнечная активность упала до минимума. Средняя температура опустилась до -60. Океаны замёрзли. Топливо закончилось. Уголь не добыть. Дрова кончились. Люди замерзают в своих домах. Миграция на юг – миллионы замёрзли по пути. Электричество отключено. Связи нет. Еда заканчивается. Вода – только лёд. Для его плавки нужно топливо, которого нет. Ресурсов хватит не всем.', requiredTags: ['техника', 'электричество', 'еда', 'строительство'], minTags: 3, modifiers: ['Мороз -60', 'Топливо закончилось', 'Миграция на юг'] },
  { name: 'Гравитационная аномалия', lore: 'Земля вошла в поле тёмной материи. Гравитация меняется хаотично. Иногда ты весишь в 3 раза больше. Иногда – паришь под потолком. Здания рушатся от перепадов. Техника ломается. Самолёты падают. Корабли тонут. Люди гибнут от падений. Внутренние органы страдают. Беременность стала смертельно опасной. Учёные в панике. Никто не знает, когда это кончится.', requiredTags: ['наука', 'техника', 'строительство', 'медицина'], minTags: 3, modifiers: ['Перепады гравитации', 'Техника ломается', 'Травмы у всех'] },
  { name: 'Энергетический кризис', lore: 'Исчерпаны все источники энергии. Нефть кончилась. Газ кончился. Уголь кончился. Атомные станции остановлены из-за отсутствия охлаждения. Солнечные панели деградировали. Ветряки сломались. Мир погрузился во тьму. Больницы работают на свечах. Вода не качается. Еда гниёт без холодильников. Люди мёрзнут. Без электричества нет цивилизации. Нужен источник энергии – любой.', requiredTags: ['электричество', 'техника', 'еда', 'наука'], minTags: 3, modifiers: ['Полная темнота', 'Холод', 'Нет воды'] },
];

const BUNKER_EVENTS = [
  { text: 'Обнаружен склад с припасами!', bonus: ['еда', 'вода'] },
  { text: 'Сломалась система вентиляции – дышать всё тяжелее.', bonus: null },
  { text: 'Пойман радиосигнал от выживших!', bonus: ['связь'] },
  { text: 'Прорыв канализации – нужен ремонт.', bonus: null },
  { text: 'Найден генератор с топливом!', bonus: ['электричество'] },
  { text: 'Стая диких собак у входа – не выйти.', bonus: null },
  { text: 'Найдены запасы лекарств в соседнем отсеке.', bonus: ['медицина'] },
  { text: 'Обрушилась часть потолка – заблокирован выход.', bonus: null },
  { text: 'Найдена библиотека с полезными книгами.', bonus: ['образование'] },
  { text: 'Крысы испортили часть припасов.', bonus: null },
];

function getBunkerCapacity(n) {
  if (n <= 4) return 2;
  if (n <= 6) return 3;
  if (n <= 8) return 4;
  return 5;
}

function startBunkerGame(room) {
  const ids = Object.keys(room.players).filter(id => {
    const p = room.players[id];
    return p && !p.isBot;
  });
  if (ids.length < 4) return { error: 'Нужно минимум 4 игрока' };

  const profs = shuffle([...BUNKER_PROFESSIONS]);
  const bios = shuffle([...BUNKER_BIOS]);
  const healths = shuffle([...BUNKER_HEALTHS]);
  const hobbies = shuffle([...BUNKER_HOBBIES]);
  const luggages = shuffle([...BUNKER_LUGGAGES]);
  const facts = shuffle([...BUNKER_FACTS]);

  ids.forEach((id, i) => {
    const p = room.players[id];
    p.bunkerCards = {
      profession: profs[i % profs.length],
      biology: bios[i % bios.length],
      health: healths[i % healths.length],
      hobby: hobbies[i % hobbies.length],
      luggage: luggages[i % luggages.length],
      fact: facts[i % facts.length],
    };
    p.bunkerRevealed = [];
    p.isAlive = true;
    p.votedFor = null;
  });

  const bt = BUNKER_TYPES[Math.floor(Math.random() * BUNKER_TYPES.length)];
  const cat = BUNKER_CATASTROPHES[Math.floor(Math.random() * BUNKER_CATASTROPHES.length)];

  room.bunkerType = bt;
  room.bunkerCatastrophe = cat;
  room.bunkerCapacity = Math.min(getBunkerCapacity(ids.length), Math.max(2, Math.floor(ids.length * 0.5)));
  room.bunkerPhase = 'catastrophe';
  room.bunkerRound = 1;
  room.bunkerTurnOrder = [];
  room.bunkerCurrentTurn = -1;
  room.bunkerEvent = null;
  room.bunkerEventsUsed = [];
  room.bunkerEliminated = [];
  room.bunkerRoundHadVote = false;
  room.phase = 'bunker_playing';
  room.status = 'playing';
  room.winner = null;
  return { ok: true };
}

function bunkerAdvanceTurn(room) {
  const alive = Object.keys(room.players).filter(id => {
    const p = room.players[id];
    return p && !p.isBot && p.isAlive && p.bunkerCards;
  });
  if (room.bunkerTurnOrder.length === 0) {
    room.bunkerTurnOrder = shuffle([...alive]);
    room.bunkerCurrentTurn = 0;
  } else {
    room.bunkerCurrentTurn++;
    if (room.bunkerCurrentTurn >= room.bunkerTurnOrder.length) {
      // All turns done
      room.bunkerCurrentTurn = -1;
      room.bunkerTurnOrder = [];
      return false; // round complete
    }
  }
  return true; // more turns remain
}

function bunkerGetActivePlayerId(room) {
  if (room.bunkerCurrentTurn < 0) return null;
  if (room.bunkerCurrentTurn >= room.bunkerTurnOrder.length) return null;
  const pid = room.bunkerTurnOrder[room.bunkerCurrentTurn];
  const p = room.players[pid];
  if (!p || !p.isAlive || p.isBot) {
    return bunkerAdvanceTurn(room) ? bunkerGetActivePlayerId(room) : null;
  }
  return pid;
}

function calculateBunkerSurvivalResult(room) {
  const alive = getAlivePlayers(room).filter(p => p.bunkerCards);
  const tags = new Set();
  alive.forEach(p => {
    const cards = p.bunkerCards;
    ['profession', 'health', 'hobby', 'luggage', 'fact'].forEach(key => {
      const c = cards[key];
      if (c && Array.isArray(c.tags)) c.tags.forEach(t => tags.add(t));
    });
  });
  if (room.bunkerType?.contents) room.bunkerType.contents.forEach(t => tags.add(t));
  if (room.bunkerEventsUsed) {
    room.bunkerEventsUsed.forEach(ev => {
      if (ev.bonus) ev.bonus.forEach(t => tags.add(t));
    });
  }
  const cat = room.bunkerCatastrophe;
  if (!cat) return { survived: false, matched: [], missing: [], needed: 0 };

  // Extra tags from stacked catastrophes
  const allRequired = [...cat.requiredTags, ...(room.bunkerExtraTags || [])];
  const needed = cat.minTags + (room.bunkerExtraTags || []).length;

  const matched = allRequired.filter(t => tags.has(t));
  const missing = allRequired.filter(t => !tags.has(t));
  return { survived: matched.length >= needed, matched, missing, needed };
}

function resetBunkerGame(room) {
  room.bunkerType = null;
  room.bunkerCatastrophe = null;
  room.bunkerCapacity = 2;
  room.bunkerPhase = 'lobby';
  room.bunkerRound = 1;
  room.bunkerTurnOrder = [];
  room.bunkerCurrentTurn = -1;
  room.bunkerEvent = null;
  room.bunkerEventsUsed = [];
  room.bunkerEliminated = [];
  room.bunkerRoundHadVote = false;
  room.bunkerVoteSkipCount = 0;
  room.bunkerExtraTags = [];
  Object.values(room.players).forEach(p => {
    p.bunkerCards = null;
    p.bunkerRevealed = [];
  });
}

http.createServer((req, res) => {
  req.on('error', () => {});
  res.on('error', () => {});
  const url = req.url.split('?')[0];
  const params = new URLSearchParams(req.url.split('?')[1] || '');

  if (req.method === 'GET' && !url.startsWith('/api/')) {
    const rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
    const fp = path.resolve(ROOT, rel);
    const rootResolved = path.resolve(ROOT);
    if (fp !== rootResolved && !fp.startsWith(rootResolved + path.sep)) {
      res.writeHead(403);
      res.end('Forbidden');
      return;
    }
    fs.readFile(fp, (err, data) => {
      if (err) { res.writeHead(404); res.end('Not Found'); return; }
      const ext = path.extname(fp);
      res.writeHead(200, {
        'Content-Type': MIME[ext] || 'text/plain',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Connection': 'close'
      });
      res.end(data);
    });
    return;
  }

  if (req.method === 'GET' && url === '/api/stream') {
    const code = (params.get('room') || '').toUpperCase();
    const r = rooms[code];
    if (!r) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Access-Control-Allow-Origin': '*',
      'Connection': 'keep-alive'
    });
    const playerId = params.get('player');
    res.write('data: ' + JSON.stringify({ type: 'state_update', room: roomState(code, playerId) }) + '\n\n');
    r.waiting.push({ res, id: playerId });
    const keepAlive = setInterval(() => {
      try { res.write(': ping\n\n'); } catch (e) { clearInterval(keepAlive); }
    }, 25000);
    req.on('close', () => {
      clearInterval(keepAlive);
      const idx = r.waiting.findIndex(w => w.id === playerId);
      if (idx > -1) r.waiting.splice(idx, 1);
    });
    req.on('error', () => {});
    res.on('error', () => {});
    return;
  }

  if (req.method !== 'POST') { res.writeHead(405); res.end(); return; }

  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    let m;
    try { m = JSON.parse(body); } catch (e) { res.writeHead(400); res.end('{}'); return; }

    function json(data) {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify(data));
    }

    if (url === '/api/create') {
      if (!m.name) { json({ type: 'error', message: 'Имя обязательно' }); return; }
      const rawGame = String(m.game || '').toLowerCase().trim();
      const game = rawGame === 'spy' ? 'spy' : rawGame === 'alias' ? 'alias' : rawGame === 'bunker' ? 'bunker' : 'mafia';
      let code = genCode();
      while (rooms[code]) code = genCode();
      const pid = genId();
      rooms[code] = {
        code,
        game,
        phase: 'lobby',
        round: 0,
        hostId: pid,
        status: 'waiting',
        winner: null,
        killedTonight: null,
        eliminatedPlayer: null,
        hostKillTarget: null,
        hostSaveTarget: null,
        hostCheckTarget: null,
        hostDonCheckTarget: null,
        hostManiacKillTarget: null,
        hostProstituteBlockTarget: null,
        prostituteBlocked: null,
        donCheckResult: null,
        checkResult: null,
        hasDon: false,
        hasManiac: false,
        hasProstitute: false,
        doctorSelfHealsUsed: false,
        location: null,
        spyId: null,
        questionLimit: null,
        spyCustomLocations: [],
        spyCustomLocationsText: '',
        // Bunker
        bunkerType: null,
        bunkerCatastrophe: null,
        bunkerCapacity: 2,
        bunkerPhase: 'lobby',
        bunkerRound: 1,
        bunkerTurnOrder: [],
        bunkerCurrentTurn: -1,
        bunkerEvent: null,
        bunkerEventsUsed: [],
        bunkerEliminated: [],
        bunkerRoundHadVote: false,
        bunkerVoteSkipCount: 0,
        bunkerExtraTags: [],
        aliasScores: Object.fromEntries(ALIAS_TEAM_ORDER.map(t => [t, 0])),
        aliasActiveTeam: 'red',
        aliasActivePlayerId: null,
        aliasCurrentWord: null,
        aliasRoundEndsAt: null,
        aliasRoundSeconds: 60,
        aliasTotalRounds: 3,
        aliasReviewWords: [],
        aliasCustomWords: [],
        aliasCustomWordsText: '',
        players: {},
        waiting: []
      };
      rooms[code].players[pid] = {
        name: m.name.trim().slice(0, 20),
        role: null,
        isAlive: true,
        isHost: true,
        votedFor: null,
        questionsAsked: 0,
        aliasTeam: 'red',
        aliasTurnsTaken: 0,
        bunkerCards: null,
        bunkerRevealed: []
      };
      json({ type: 'init', playerId: pid, room: roomState(code, pid) });
      return;
    }

    if (url === '/api/join') {
      if (!m.name || !m.code) { json({ type: 'error', message: 'Имя и код обязательны' }); return; }
      const code = String(m.code).toUpperCase().trim();
      const r = rooms[code];
      if (!r) { json({ type: 'error', message: 'Комната не найдена' }); return; }
      if (r.status !== 'waiting') { json({ type: 'error', message: 'Игра уже началась' }); return; }
      const pid = genId();
      r.players[pid] = {
        name: m.name.trim().slice(0, 20),
        role: null,
        isAlive: true,
        isHost: false,
        votedFor: null,
        questionsAsked: 0,
        aliasTeam: ALIAS_TEAM_ORDER[Math.floor(Math.random() * ALIAS_TEAM_ORDER.length)],
        aliasTurnsTaken: 0,
        bunkerCards: null,
        bunkerRevealed: []
      };
      json({ type: 'init', playerId: pid, room: roomState(code, pid) });
      broadcast(code);
      return;
    }

    if (url === '/api/rejoin') {
      if (!m.name || !m.code) { json({ type: 'error', message: 'Имя и код обязательны' }); return; }
      const code = String(m.code).toUpperCase().trim();
      const r = rooms[code];
      if (!r || (r.status !== 'waiting' && !m.force)) { json({ type: 'error', message: 'Комната не найдена' }); return; }
      // Find existing player with same name (reconnect)
      const existing = Object.entries(r.players).find(([, p]) => p.name === m.name.trim().slice(0, 20) && !p.isHost);
      if (existing) {
        const pid = existing[0];
        json({ type: 'init', playerId: pid, room: roomState(code, pid) });
        broadcast(code);
        return;
      }
      // Not found, create new
      const pid = genId();
      r.players[pid] = {
        name: m.name.trim().slice(0, 20),
        role: null,
        isAlive: true,
        isHost: false,
        votedFor: null,
        questionsAsked: 0,
        aliasTeam: ALIAS_TEAM_ORDER[Math.floor(Math.random() * ALIAS_TEAM_ORDER.length)],
        aliasTurnsTaken: 0,
        bunkerCards: null,
        bunkerRevealed: []
      };
      json({ type: 'init', playerId: pid, room: roomState(code, pid) });
      broadcast(code);
      return;
    }

    const roomCode = m.room ? String(m.room).toUpperCase() : null;
    const room = roomCode ? rooms[roomCode] : null;
    if (!room) { json({ type: 'error', message: 'Комната не найдена' }); return; }

    if (url === '/api/leave') {
      if (room.hostId === m.player) {
        // Notify others, then delete room
        room.waiting.forEach(w => {
          try {
            w.res.write('data: ' + JSON.stringify({ type: 'room_closed' }) + '\n\n');
          } catch (e) {}
        });
        delete rooms[roomCode];
      } else if (room.players[m.player]) {
        delete room.players[m.player];
        broadcast(roomCode);
      }
      json({ type: 'ok' });
      return;
    }

    if (url === '/api/start') {
      if (room.hostId !== m.player) { json({ type: 'error', message: 'Только хост' }); return; }
      if (room.status !== 'waiting') { json({ type: 'error', message: 'Игра уже идёт' }); return; }

      const nonHostPlayers = Object.keys(room.players).filter(id => {
        const p = room.players[id];
        return id !== room.hostId && p && !p.isHost;
      });

      // --- Шпион ---
      if (room.game === 'spy') {
        room.round = 0;
        const started = startSpyRound(room, m.questionLimit, m.customLocations);
        if (started.error) {
          json({ type: 'error', message: started.error });
          return;
        }
        json({ type: 'game_started', room: roomState(roomCode, m.player) });
        broadcast(roomCode);
        return;
      }

      // --- Элиас ---
      if (room.game === 'alias') {
        room.round = 0;
        const started = startAliasGame(room, m.roundSeconds, m.totalRounds, m.customWords);
        if (started.error) {
          json({ type: 'error', message: started.error });
          return;
        }
        json({ type: 'game_started', room: roomState(roomCode, m.player) });
        broadcast(roomCode);
        return;
      }

      // --- Бункер ---
      if (room.game === 'bunker') {
        room.round = 0;
        const started = startBunkerGame(room);
        if (started.error) {
          json({ type: 'error', message: started.error });
          return;
        }
        json({ type: 'game_started', room: roomState(roomCode, m.player) });
        broadcast(roomCode);
        return;
      }

      // --- Мафия ---
      room.hasDon = !!m.hasDon;
      room.hasManiac = !!m.hasManiac;
      room.hasProstitute = !!m.hasProstitute;

      if (nonHostPlayers.length < 4) {
        json({
          type: 'error',
          message: 'Нужно минимум 4 игрока (сейчас ' + nonHostPlayers.length + ') + ведущий'
        });
        return;
      }

      const built = assignRoles(nonHostPlayers, room.players, m.mafiaCount, room.hasDon, room.hasManiac, room.hasProstitute);
      if (built.error) {
        json({ type: 'error', message: built.error });
        return;
      }

      room.mafiaCount = built.mafia;

      nonHostPlayers.forEach(id => {
        room.players[id].role = built.rolesById[id];
        room.players[id].isAlive = true;
        room.players[id].votedFor = null;
        // На всякий случай: бот никогда не получает активную роль
        if (room.players[id].isBot) {
          room.players[id].role = 'civilian';
        }
      });
      room.players[room.hostId].role = null;
      room.players[room.hostId].isAlive = true;

      // Финальная проверка
      const writtenMafia = nonHostPlayers.filter(id => {
        const r = room.players[id].role;
        return r === 'mafia' || r === 'don';
      }).length;
      const botGotActive = nonHostPlayers.some(id => {
        const p = room.players[id];
        return p.isBot && p.role && p.role !== 'civilian';
      });
      if (writtenMafia !== built.mafia || botGotActive) {
        nonHostPlayers.forEach(id => { room.players[id].role = null; });
        room.status = 'waiting';
        room.phase = 'lobby';
        json({ type: 'error', message: 'Сбой раздачи ролей, попробуй ещё раз' });
        return;
      }

      room.phase = 'day0';
      room.round = 0;
      room.status = 'playing';
      room.winner = null;
      room.killedTonight = null;
      room.eliminatedPlayer = null;
      room.hostKillTarget = null;
      room.hostSaveTarget = null;
      room.hostCheckTarget = null;
      room.hostDonCheckTarget = null;
      room.hostManiacKillTarget = null;
      room.hostProstituteBlockTarget = null;
      room.prostituteBlocked = null;
      room.donCheckResult = null;
      room.checkResult = null;

      json({ type: 'game_started', room: roomState(roomCode, m.player) });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/spy_reveal') {
      if (!room.players[m.player]) { json({ type: 'error', message: 'Ты не в комнате' }); return; }
      if (room.game !== 'spy' || room.phase !== 'spy_play') {
        json({ type: 'error', message: 'Сейчас нельзя раскрыть' });
        return;
      }
      const limit = room.questionLimit || 0;
      const ready = Object.values(room.players).every(p => (p.questionsAsked || 0) >= limit);
      if (!ready) {
        json({ type: 'error', message: 'Сначала каждому нужно набрать лимит вопросов' });
        return;
      }
      room.phase = 'spy_reveal';
      room.status = 'ended';
      json({ type: 'ok', room: roomState(roomCode, m.player) });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/spy_ask') {
      if (!room.players[m.player]) { json({ type: 'error', message: 'Ты не в комнате' }); return; }
      if (room.game !== 'spy' || room.phase !== 'spy_play') {
        json({ type: 'error', message: 'Сейчас не фаза вопросов' });
        return;
      }
      const target = room.players[m.target];
      if (!target) { json({ type: 'error', message: 'Игрок не найден' }); return; }
      if (m.target !== m.player) {
        json({ type: 'error', message: 'Каждый жмёт +1 только себе' });
        return;
      }
      const limit = room.questionLimit || 2;
      const cur = target.questionsAsked || 0;
      if (cur >= limit) {
        json({ type: 'error', message: 'Уже лимит вопросов' });
        return;
      }
      target.questionsAsked = cur + 1;
      json({ type: 'ok', room: roomState(roomCode, m.player) });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/spy_next') {
      if (!room.players[m.player]) { json({ type: 'error', message: 'Ты не в комнате' }); return; }
      if (room.game !== 'spy') {
        json({ type: 'error', message: 'Это не режим шпиона' });
        return;
      }
      if (room.phase !== 'spy_reveal') {
        json({ type: 'error', message: 'Сначала раскройте шпиона' });
        return;
      }
      const started = startSpyRound(room);
      if (started.error) {
        json({ type: 'error', message: started.error });
        return;
      }
      json({ type: 'ok', room: roomState(roomCode, m.player) });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/alias_set_team') {
      if (room.game !== 'alias') { json({ type: 'error', message: 'Это не Элиас' }); return; }
      if (room.status !== 'waiting') { json({ type: 'error', message: 'Команды меняются только в лобби' }); return; }
      const target = room.players[m.player];
      const team = ALIAS_TEAM_ORDER.includes(m.team) ? m.team : 'red';
      if (!target) { json({ type: 'error', message: 'Игрок не найден' }); return; }
      target.aliasTeam = team;
      json({ type: 'ok', room: roomState(roomCode, m.player) });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/alias_start_round') {
      if (room.game !== 'alias') { json({ type: 'error', message: 'Это не Элиас' }); return; }
      const started = startAliasRound(room, m.player);
      if (started.error) { json({ type: 'error', message: started.error }); return; }
      json({ type: 'ok', room: roomState(roomCode, m.player) });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/alias_next_word') {
      if (room.game !== 'alias') { json({ type: 'error', message: 'Это не Элиас' }); return; }
      if (room.phase !== 'alias_round') { json({ type: 'error', message: 'Сейчас не идёт ход' }); return; }
      if (m.player !== room.aliasActivePlayerId) { json({ type: 'error', message: 'Только объясняющий листает слова' }); return; }
if (room.aliasRoundEndsAt && Date.now() >= room.aliasRoundEndsAt) {
    finishAliasRoundTimeout(room);
    json({ type: 'ok', room: roomState(roomCode, m.player) });
    broadcast(roomCode);
    return;
  }
  pushAliasReviewWord(room, false);
  room.aliasCurrentWord = nextAliasWord(room);
  json({ type: 'ok', room: roomState(roomCode, m.player) });
  broadcast(roomCode);
  return;
}

if (url === '/api/alias_skip') {
  if (room.game !== 'alias') { json({ type: 'error', message: 'Это не Элиас' }); return; }
  if (room.phase !== 'alias_round') { json({ type: 'error', message: 'Сейчас не идёт ход' }); return; }
  if (m.player !== room.aliasActivePlayerId) { json({ type: 'error', message: 'Только объясняющий пропускает слова' }); return; }
  if (room.aliasRoundEndsAt && Date.now() >= room.aliasRoundEndsAt) {
    finishAliasRoundTimeout(room);
    json({ type: 'ok', room: roomState(roomCode, m.player) });
    broadcast(roomCode);
    return;
  }
  pushAliasReviewWord(room, true);
      room.aliasCurrentWord = nextAliasWord(room);
      json({ type: 'ok', room: roomState(roomCode, m.player) });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/alias_end_round') {
      if (room.game !== 'alias') { json({ type: 'error', message: 'Это не Элиас' }); return; }
      if (room.phase !== 'alias_round') { json({ type: 'error', message: 'Сейчас не идёт ход' }); return; }
      const ended = finishAliasRound(room, m.player);
      if (ended.error) { json({ type: 'error', message: ended.error }); return; }
      json({ type: 'ok', room: roomState(roomCode, m.player) });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/alias_submit_review') {
      if (room.game !== 'alias') { json({ type: 'error', message: 'Это не Элиас' }); return; }
      const saved = submitAliasReview(room, m.player, m.checkedIndexes);
      if (saved.error) { json({ type: 'error', message: saved.error }); return; }
      json({ type: 'ok', room: roomState(roomCode, m.player) });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/host_action') {
      if (room.hostId !== m.player) { json({ type: 'error', message: 'Только хост' }); return; }
      if (room.phase !== 'night') { json({ type: 'error', message: 'Сейчас не ночь' }); return; }

      const target = room.players[m.target];
      if (!target || target.isHost || !target.isAlive) {
        json({ type: 'error', message: 'Недопустимая цель' });
        return;
      }

      if (m.action === 'kill') {
        if (!hasAliveRole(room, 'mafia') && !hasAliveRole(room, 'don')) {
          json({ type: 'error', message: 'Живой мафии/дона нет' });
          return;
        }
        if (target.role === 'mafia' || target.role === 'don') {
          json({ type: 'error', message: 'Мафия не может убить свою' });
          return;
        }
        room.hostKillTarget = m.target;
      } else if (m.action === 'save') {
        if (!hasAliveRole(room, 'doctor')) {
          json({ type: 'error', message: 'Доктор мёртв' });
          return;
        }
        const docPlayer = getAlivePlayers(room).find(p => p.role === 'doctor');
        if (docPlayer && m.target === docPlayer.id) {
          if (room.doctorSelfHealsUsed) {
            json({ type: 'error', message: 'Доктор уже лечил себя в этой игре' });
            return;
          }
          room.doctorSelfHealsUsed = true;
        }
        room.hostSaveTarget = m.target;
      } else if (m.action === 'check') {
        if (!hasAliveRole(room, 'sheriff')) {
          json({ type: 'error', message: 'Шериф мёртв' });
          return;
        }
        if (target.role === 'sheriff') {
          json({ type: 'error', message: 'Шериф не может проверить себя' });
          return;
        }
        room.hostCheckTarget = m.target;
      } else if (m.action === 'don_check') {
        if (!hasAliveRole(room, 'don')) {
          json({ type: 'error', message: 'Дон мёртв' });
          return;
        }
        if (target.role === 'don') {
          json({ type: 'error', message: 'Дон не может проверить себя' });
          return;
        }
        room.hostDonCheckTarget = m.target;
      } else if (m.action === 'maniac_kill') {
        if (!hasAliveRole(room, 'maniac')) {
          json({ type: 'error', message: 'Маньяк мёртв' });
          return;
        }
        room.hostManiacKillTarget = m.target;
      } else if (m.action === 'prostitute_block') {
        if (!hasAliveRole(room, 'prostitute')) {
          json({ type: 'error', message: 'Путана мертва' });
          return;
        }
        const prosPlayer = getAlivePlayers(room).find(p => p.role === 'prostitute');
        if (prosPlayer && m.target === prosPlayer.id) {
          json({ type: 'error', message: 'Путана не может блокировать себя' });
          return;
        }
        room.hostProstituteBlockTarget = m.target;
      } else {
        json({ type: 'error', message: 'Неизвестное действие' });
        return;
      }

      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/end_night') {
      if (room.hostId !== m.player) { json({ type: 'error', message: 'Только хост' }); return; }
      if (room.phase !== 'night') { json({ type: 'error', message: 'Сейчас не ночь' }); return; }

      // Determine which players are blocked by prostitute
      const blockTarget = hasAliveRole(room, 'prostitute') ? room.hostProstituteBlockTarget : null;
      room.prostituteBlocked = blockTarget;

      // Mafia as a team: if at least one mafia/don is NOT blocked, the kill happens
      const mafiaTeam = getAlivePlayers(room).filter(p => p.role === 'mafia' || p.role === 'don');
      const anyMafiaUnblocked = mafiaTeam.some(p => p.id !== blockTarget);
      const mafiaKillHappens = mafiaTeam.length > 0 && anyMafiaUnblocked;

      // Don check: only if don is alive and not blocked
      const donPlayer = mafiaTeam.find(p => p.role === 'don');
      const donCheckHappens = donPlayer && donPlayer.id !== blockTarget;

      // Doctor save: only if alive and not blocked
      const doctorPlayer = getAlivePlayers(room).find(p => p.role === 'doctor');
      const doctorBlocked = doctorPlayer && doctorPlayer.id === blockTarget;

      // Sheriff check: only if alive and not blocked
      const sheriffPlayer = getAlivePlayers(room).find(p => p.role === 'sheriff');
      const sheriffBlocked = sheriffPlayer && sheriffPlayer.id === blockTarget;

      // Maniac kill: only if alive and not blocked
      const maniacPlayer = getAlivePlayers(room).find(p => p.role === 'maniac');
      const maniacBlocked = maniacPlayer && maniacPlayer.id === blockTarget;

      // 1. Mafia kill
      const killTarget = mafiaKillHappens ? room.hostKillTarget : null;

      // 2. Don check
      const donCheckTarget = donCheckHappens ? room.hostDonCheckTarget : null;
      let donCheckResult = null;
      if (donCheckTarget && room.players[donCheckTarget]) {
        donCheckResult = room.players[donCheckTarget].role === 'sheriff' ? 'sheriff' : 'not_sheriff';
      }

      // 3. Doctor save
      const saveTarget = hasAliveRole(room, 'doctor') && !doctorBlocked ? room.hostSaveTarget : null;

      // 4. Sheriff check
      const checkTarget = hasAliveRole(room, 'sheriff') && !sheriffBlocked ? room.hostCheckTarget : null;
      let checkResult = null;
      if (checkTarget && room.players[checkTarget]) {
        checkResult = room.players[checkTarget].role === 'mafia' || room.players[checkTarget].role === 'don' ? 'mafia' : 'civilian';
      }

      // 5. Maniac kill
      const maniacKillTarget = hasAliveRole(room, 'maniac') && !maniacBlocked ? room.hostManiacKillTarget : null;

      // Resolve mafia kill (doctor save applies)
      const mafiaKilledPlayer = (killTarget && killTarget !== saveTarget) ? killTarget : null;
      if (mafiaKilledPlayer && room.players[mafiaKilledPlayer] && room.players[mafiaKilledPlayer].isAlive) {
        if (room.players[mafiaKilledPlayer].role === 'mafia' || room.players[mafiaKilledPlayer].role === 'don') {
          json({ type: 'error', message: 'Мафия не может убить свою' });
          return;
        }
        room.players[mafiaKilledPlayer].isAlive = false;
      }

      // Resolve maniac kill
      if (maniacKillTarget && room.players[maniacKillTarget] && room.players[maniacKillTarget].isAlive) {
        room.players[maniacKillTarget].isAlive = false;
      }

      const totalKilled = [];
      if (mafiaKilledPlayer) totalKilled.push(mafiaKilledPlayer);
      if (maniacKillTarget && maniacKillTarget !== mafiaKilledPlayer) totalKilled.push(maniacKillTarget);

      room.phase = 'day';
      room.killedTonight = totalKilled.length > 0 ? totalKilled.join(',') : null;
      room.donCheckResult = donCheckResult;
      room.checkResult = checkResult;

      if (checkWin(room)) {
        json({ type: 'ok' });
        broadcast(roomCode);
        return;
      }

      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/start_vote') {
      if (room.hostId !== m.player) { json({ type: 'error', message: 'Только хост' }); return; }
      if (room.phase !== 'day') { json({ type: 'error', message: 'Сейчас не день' }); return; }
      // After night reveal, game may already be over
      if (checkWin(room)) {
        json({ type: 'ok' });
        broadcast(roomCode);
        return;
      }
      room.phase = 'vote';
      Object.values(room.players).forEach(p => { p.votedFor = null; });
      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/start_first_night') {
      if (room.hostId !== m.player) { json({ type: 'error', message: 'Только хост' }); return; }
      if (room.phase !== 'day0') { json({ type: 'error', message: 'Сейчас не день 0' }); return; }
      room.phase = 'night';
      room.round = 1;
      room.killedTonight = null;
      room.eliminatedPlayer = null;
      room.hostKillTarget = null;
      room.hostSaveTarget = null;
      room.hostCheckTarget = null;
      room.hostDonCheckTarget = null;
      room.hostManiacKillTarget = null;
      room.hostProstituteBlockTarget = null;
      room.prostituteBlocked = null;
      room.donCheckResult = null;
      room.checkResult = null;
      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/vote') {
      const p = room.players[m.player];
      if (!p || p.isHost) { json({ type: 'error', message: 'Ведущий не голосует' }); return; }
      if (!p.isAlive) { json({ type: 'error', message: 'Ты мёртв' }); return; }
      if (room.phase !== 'vote') { json({ type: 'error', message: 'Сейчас не голосование' }); return; }

      const target = room.players[m.target];
      if (!target || target.isHost || !target.isAlive) {
        json({ type: 'error', message: 'Недопустимая цель' });
        return;
      }
      if (m.target === m.player) {
        json({ type: 'error', message: 'Нельзя голосовать за себя' });
        return;
      }

      p.votedFor = m.target;
      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/end_vote') {
      if (room.hostId !== m.player) { json({ type: 'error', message: 'Только хост' }); return; }
      if (room.phase !== 'vote') { json({ type: 'error', message: 'Сейчас не голосование' }); return; }

      const aliveEntries = Object.entries(room.players)
        .filter(([, p]) => p.isAlive && !p.isHost);

      // Bots auto-vote for a random alive non-self player
      aliveEntries.filter(([, p]) => p.isBot).forEach(([botId, bot]) => {
        if (bot.votedFor) return;
        const targets = aliveEntries.filter(([id]) => id !== botId);
        if (targets.length > 0) {
          bot.votedFor = targets[Math.floor(Math.random() * targets.length)][0];
        }
      });

      const votes = {};
      aliveEntries.forEach(([, p]) => {
        if (p.votedFor && room.players[p.votedFor]?.isAlive) {
          votes[p.votedFor] = (votes[p.votedFor] || 0) + 1;
        }
      });

      const keys = Object.keys(votes);
      let eliminated = null;
      if (keys.length > 0) {
        keys.sort((a, b) => votes[b] - votes[a]);
        const top = votes[keys[0]];
        const tied = keys.filter(k => votes[k] === top);
        // Classic rule: on tie, nobody is eliminated
        if (tied.length === 1) eliminated = tied[0];
      }

      if (eliminated && room.players[eliminated]) {
        room.players[eliminated].isAlive = false;
      }

      room.eliminatedPlayer = eliminated;
      Object.values(room.players).forEach(p => { p.votedFor = null; });

      // Сразу завершаем, если мафия выбита или сравнялась с городом
      if (checkWin(room)) {
        json({ type: 'ok' });
        broadcast(roomCode);
        return;
      }

      room.phase = 'vote_result';
      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/add_bot') {
      if (room.hostId !== m.player) { json({ type: 'error', message: 'Только хост' }); return; }
      if (room.status !== 'waiting') { json({ type: 'error', message: 'Только в лобби' }); return; }
      if (room.game === 'spy' || room.game === 'alias' || room.game === 'bunker') { json({ type: 'error', message: 'В этом режиме боты отключены' }); return; }
      const usedNames = Object.values(room.players).map(p => p.name);
      const avail = BOT_NAMES.filter(n => !usedNames.includes(n));
      if (avail.length === 0) { json({ type: 'error', message: 'Кончились имена для ботов' }); return; }
      const name = avail[Math.floor(Math.random() * avail.length)];
      const pid = genId();
      room.players[pid] = {
        name,
        role: null,
        isAlive: true,
        isHost: false,
        isBot: true,
        votedFor: null,
        questionsAsked: 0,
        aliasTeam: null
      };
      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/admin_command') {
      if (room.hostId !== m.player) { json({ type: 'error', message: 'Только хост' }); return; }

      if (m.cmd === 'kill' && room.players[m.target] && room.players[m.target].isAlive && !room.players[m.target].isHost) {
        room.players[m.target].isAlive = false;
        checkWin(room);
        json({ type: 'ok' });
        broadcast(roomCode);
        return;
      }
      if (m.cmd === 'revive' && room.players[m.target] && !room.players[m.target].isAlive) {
        room.players[m.target].isAlive = true;
        json({ type: 'ok' });
        broadcast(roomCode);
        return;
      }
      if (m.cmd === 'remove_bot' && room.players[m.target] && room.players[m.target].isBot) {
        delete room.players[m.target];
        json({ type: 'ok' });
        broadcast(roomCode);
        return;
      }
      if (m.cmd === 'kick' && room.players[m.target] && !room.players[m.target].isHost && room.status === 'waiting') {
        delete room.players[m.target];
        // Close SSE for kicked player
        const kickIdx = room.waiting.findIndex(w => w.id === m.target);
        if (kickIdx > -1) {
          try { room.waiting[kickIdx].res.end(); } catch (e) {}
          room.waiting.splice(kickIdx, 1);
        }
        json({ type: 'ok' });
        broadcast(roomCode);
        return;
      }
      json({ type: 'error', message: 'Неизвестная команда' });
      return;
    }

    if (url === '/api/next_round') {
      if (room.hostId !== m.player) { json({ type: 'error', message: 'Только хост' }); return; }
      if (room.phase !== 'vote_result') {
        json({ type: 'error', message: 'Сначала завершите голосование' });
        return;
      }

      if (checkWin(room)) {
        json({ type: 'ok' });
        broadcast(roomCode);
        return;
      }

      room.phase = 'night';
      room.round++;
      room.killedTonight = null;
      room.eliminatedPlayer = null;
      room.hostKillTarget = null;
      room.hostSaveTarget = null;
      room.hostCheckTarget = null;
      room.hostDonCheckTarget = null;
      room.hostManiacKillTarget = null;
      room.hostProstituteBlockTarget = null;
      room.prostituteBlocked = null;
      room.donCheckResult = null;
      room.checkResult = null;
      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    // ========================
    //   БУНКЕР API v3
    // ========================

if (url === '/api/bunker_start_turns') {
      if (room.hostId !== m.player) { json({ type: 'error', message: 'Только хост' }); return; }
      if (room.game !== 'bunker' || room.bunkerPhase !== 'catastrophe') { json({ type: 'error', message: 'Сначала покажи катастрофу' }); return; }
      room.bunkerPhase = 'turns';
      room.bunkerTurnOrder = [];
      room.bunkerCurrentTurn = -1;
      room.bunkerRoundHadVote = false;
      room.bunkerVoteSkipCount = 0;
      bunkerAdvanceTurn(room);
      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/bunker_reveal_card') {
      if (room.game !== 'bunker' || room.bunkerPhase !== 'turns') { json({ type: 'error', message: 'Не сейчас' }); return; }
      const pid = bunkerGetActivePlayerId(room);
      if (m.player !== pid) { json({ type: 'error', message: 'Сейчас не твой ход' }); return; }
      const p = room.players[pid];
      if (!p || !p.bunkerCards) { json({ type: 'error', message: 'Нет карт' }); return; }
      const cat = m.category;
      const valid = ['profession', 'biology', 'health', 'hobby', 'luggage', 'fact'];
      if (!valid.includes(cat)) { json({ type: 'error', message: 'Неверная категория' }); return; }
      if (p.bunkerRevealed.includes(cat)) { json({ type: 'error', message: 'Уже раскрыто' }); return; }
      if (room.bunkerRound === 1 && cat !== 'profession') { json({ type: 'error', message: 'Сейчас можно только профессию' }); return; }
      p.bunkerRevealed.push(cat);
      const more = bunkerAdvanceTurn(room);
      if (!more) room.bunkerPhase = 'discuss';
      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/bunker_vote_start') {
      if (room.hostId !== m.player) { json({ type: 'error', message: 'Только хост' }); return; }
      if (room.game !== 'bunker' || room.bunkerPhase !== 'discuss') {
        json({ type: 'error', message: 'Не сейчас' }); return;
      }
      if (room.bunkerRound === 1) { json({ type: 'error', message: 'В первом раунде не голосуем' }); return; }
      room.bunkerPhase = 'vote';
      Object.values(room.players).forEach(p => { p.votedFor = null; });
      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/bunker_skip_vote') {
      if (room.hostId !== m.player) { json({ type: 'error', message: 'Только хост' }); return; }
      if (room.game !== 'bunker' || room.bunkerPhase !== 'vote') { json({ type: 'error', message: 'Не голосование' }); return; }
      room.bunkerVoteSkipCount = (room.bunkerVoteSkipCount || 0) + 1;
      room.bunkerPhase = 'event';
      // Add random extra catastrophe tag
      const allTags = BUNKER_CATASTROPHES.flatMap(c => c.requiredTags);
      const extra = allTags[Math.floor(Math.random() * allTags.length)];
      if (!room.bunkerExtraTags) room.bunkerExtraTags = [];
      if (!room.bunkerExtraTags.includes(extra)) room.bunkerExtraTags.push(extra);
      const avail = BUNKER_EVENTS.filter(ev => !(room.bunkerEventsUsed || []).some(u => u.text === ev.text));
      const pool = avail.length > 0 ? avail : BUNKER_EVENTS;
      room.bunkerEvent = pool[Math.floor(Math.random() * pool.length)];
      room.bunkerEventsUsed.push(room.bunkerEvent);
      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/bunker_vote') {
      const p = room.players[m.player];
      if (!p || p.isBot) { json({ type: 'error', message: 'Нельзя голосовать' }); return; }
      if (!p.isAlive) { json({ type: 'error', message: 'Ты выбыл' }); return; }
      if (room.game !== 'bunker' || room.bunkerPhase !== 'vote') { json({ type: 'error', message: 'Не голосование' }); return; }
      const target = room.players[m.target];
      if (!target || target.isBot || !target.isAlive) { json({ type: 'error', message: 'Нельзя' }); return; }
      if (m.target === m.player) { json({ type: 'error', message: 'Нельзя за себя' }); return; }
      p.votedFor = m.target;
      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/bunker_vote_end') {
      if (room.hostId !== m.player) { json({ type: 'error', message: 'Только хост' }); return; }
      if (room.game !== 'bunker' || room.bunkerPhase !== 'vote') { json({ type: 'error', message: 'Не голосование' }); return; }

      const alive = Object.keys(room.players).filter(id => room.players[id] && !room.players[id].isBot && room.players[id].isAlive);
      const votes = {};
      alive.forEach(id => {
        const p = room.players[id];
        if (p.votedFor && room.players[p.votedFor]?.isAlive) votes[p.votedFor] = (votes[p.votedFor] || 0) + 1;
      });
      const sorted = Object.entries(votes).sort((a, b) => b[1] - a[1]);
      const skipMult = 1 + (room.bunkerVoteSkipCount || 0);
      const kickCount = Math.max(1, Math.ceil(alive.length / 4)) * skipMult;
      let eliminated = [];
      for (let i = 0; i < sorted.length && eliminated.length < kickCount; i++) {
        const tied = sorted.filter(e => e[1] === sorted[i][1]);
        if (tied.length === 1) {
          if (room.players[sorted[i][0]] && !eliminated.includes(sorted[i][0])) {
            room.players[sorted[i][0]].isAlive = false;
            room.bunkerEliminated.push(sorted[i][0]);
            eliminated.push(sorted[i][0]);
          }
        }
      }
      Object.values(room.players).forEach(p => { p.votedFor = null; });
      room.bunkerRoundHadVote = true;
      room.bunkerVoteSkipCount = 0;

      // Check game over
      const aliveCount = alive.filter(id => room.players[id].isAlive).length;
      if (aliveCount <= room.bunkerCapacity) {
        const result = calculateBunkerSurvivalResult(room);
        room.winner = result.survived ? 'survived' : 'dead';
        room.bunkerPhase = 'result';
        room.status = 'ended';
        json({ type: 'ok' });
        broadcast(roomCode);
        return;
      }

      // Random event + extra catastrophe tag
      const allTags = BUNKER_CATASTROPHES.flatMap(c => c.requiredTags);
      const extra = allTags[Math.floor(Math.random() * allTags.length)];
      if (!room.bunkerExtraTags) room.bunkerExtraTags = [];
      if (!room.bunkerExtraTags.includes(extra)) room.bunkerExtraTags.push(extra);
      const avail = BUNKER_EVENTS.filter(ev => !(room.bunkerEventsUsed || []).some(u => u.text === ev.text));
      const pool = avail.length > 0 ? avail : BUNKER_EVENTS;
      room.bunkerEvent = pool[Math.floor(Math.random() * pool.length)];
      room.bunkerEventsUsed.push(room.bunkerEvent);
      room.bunkerPhase = 'event';
      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/bunker_next_round') {
      if (room.hostId !== m.player) { json({ type: 'error', message: 'Только хост' }); return; }
      if (room.game !== 'bunker' || room.bunkerPhase !== 'event') {
        json({ type: 'error', message: 'Сначала голосование' }); return;
      }
      room.bunkerRound++;
      room.bunkerPhase = 'turns';
      room.bunkerTurnOrder = [];
      room.bunkerCurrentTurn = -1;
      room.bunkerEvent = null;
      bunkerAdvanceTurn(room);
      json({ type: 'ok' });
      broadcast(roomCode);
      return;
    }

    if (url === '/api/return_lobby') {
      const canReturn =
        room.phase === 'ended' ||
        room.status === 'ended' ||
        room.phase === 'spy_reveal' ||
        room.phase === 'bunker_playing';
      if (!canReturn) {
        json({ type: 'error', message: 'Игра ещё не окончена' });
        return;
      }
      if (!room.players[m.player]) {
        json({ type: 'error', message: 'Ты не в комнате' });
        return;
      }
      resetRoomToLobby(room);
      json({ type: 'ok', room: roomState(roomCode, m.player) });
      broadcast(roomCode);
      return;
    }

    json({ type: 'error', message: 'Unknown action' });
  });
}).listen(PORT, '0.0.0.0', () => {
  console.log('Server running at http://localhost:' + PORT);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('Port ' + PORT + ' is already in use. Run: taskkill /F /IM node.exe');
    process.exit(1);
  }
  console.error('Server error:', err.message);
});
