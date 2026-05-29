const STORAGE_KEY = "fifa26_championship_manager_v1";
const COLOR_PALETTE = [
  "#00C6FF", "#FF6B35", "#A855F7", "#22C55E", "#FACC15", "#EC4899",
  "#14B8A6", "#F97316", "#8B5CF6", "#84CC16", "#38BDF8", "#F43F5E",
  "#10B981", "#EAB308", "#6366F1", "#06B6D4", "#D946EF", "#A3E635"
];

let state = loadState();
let activeTab = "championships";
let editingMatchId = null;

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"]/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
  }[char]));
}

function normalizeName(name) {
  return name.trim().replace(/\s+/g, " ");
}

function initials(name) {
  return normalizeName(name)
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0])
    .join("")
    .toUpperCase() || "?";
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.players?.length) return saved;
  } catch (error) {
    console.warn("No se pudo leer el estado guardado", error);
  }

  const players = ["Isaac", "Daniel", "Brenes", "Joseph", "Leo"].map((name, index) => ({
    id: uid("player"),
    name,
    color: COLOR_PALETTE[index]
  }));

  const demo = {
    id: uid("champ"),
    name: "Champions League de Amigos",
    rounds: 2,
    playerIds: players.map(player => player.id),
    createdAt: new Date().toISOString(),
    ...generateSchedule(players.map(player => player.id), 2)
  };

  demo.matches.find(match => match.round === 1 && match.homeId && match.awayId).hs = 3;
  demo.matches.find(match => match.round === 1 && match.homeId && match.awayId).as = 3;

  return { players, championships: [demo], currentChampionshipId: demo.id };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function getCurrentChampionship() {
  return state.championships.find(championship => championship.id === state.currentChampionshipId) || null;
}

function getPlayer(playerId) {
  return state.players.find(player => player.id === playerId) || null;
}

function getPlayerName(playerId) {
  return getPlayer(playerId)?.name || "Jugador eliminado";
}

function getPlayerColor(playerId) {
  return getPlayer(playerId)?.color || "#64748B";
}

function nextAvailableColor() {
  const used = new Set(state.players.map(player => player.color));
  const paletteColor = COLOR_PALETTE.find(color => !used.has(color));
  if (paletteColor) return paletteColor;

  let hue = Math.floor(Math.random() * 360);
  let color = `hsl(${hue}, 78%, 55%)`;
  while (used.has(color)) {
    hue = (hue + 37) % 360;
    color = `hsl(${hue}, 78%, 55%)`;
  }
  return color;
}

function findOrCreatePlayer(name) {
  const normalized = normalizeName(name);
  if (!normalized) return null;

  const existing = state.players.find(player => player.name.toLowerCase() === normalized.toLowerCase());
  if (existing) return existing;

  const player = { id: uid("player"), name: normalized, color: nextAvailableColor() };
  state.players.push(player);
  return player;
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function generateSchedule(playerIds, rounds) {
  const rotating = shuffle(playerIds);
  if (rotating.length % 2 === 1) rotating.push(null);

  const totalRounds = rotating.length - 1;
  const half = rotating.length / 2;
  const matches = [];
  const byes = [];
  let matchNumber = 1;
  let roundPlayers = [...rotating];

  for (let round = 1; round <= totalRounds; round++) {
    const roundMatches = [];

    for (let i = 0; i < half; i++) {
      const a = roundPlayers[i];
      const b = roundPlayers[roundPlayers.length - 1 - i];
      if (!a || !b) {
        const restingPlayerId = a || b;
        if (restingPlayerId) byes.push({ round, leg: 1, playerId: restingPlayerId });
        continue;
      }

      const swap = (round + i) % 2 === 0;
      roundMatches.push({
        id: matchNumber++,
        round,
        leg: 1,
        homeId: swap ? b : a,
        awayId: swap ? a : b,
        hs: null,
        as: null
      });
    }

    shuffle(roundMatches).forEach(match => matches.push(match));
    roundPlayers = [roundPlayers[0], roundPlayers[roundPlayers.length - 1], ...roundPlayers.slice(1, -1)];
  }

  if (Number(rounds) === 2) {
    const firstLeg = [...matches];
    firstLeg.forEach(match => {
      matches.push({
        id: matchNumber++,
        round: match.round + totalRounds,
        leg: 2,
        homeId: match.awayId,
        awayId: match.homeId,
        hs: null,
        as: null
      });
    });
    byes.filter(bye => bye.leg === 1).forEach(bye => {
      byes.push({ round: bye.round + totalRounds, leg: 2, playerId: bye.playerId });
    });
  }

  return { matches, byes };
}

function playedMatches(championships) {
  return championships.flatMap(championship =>
    championship.matches
      .filter(match => match.hs !== null && match.as !== null)
      .map(match => ({ ...match, championshipId: championship.id }))
  );
}

function buildStats(championships, playerIds = null) {
  const ids = playerIds || [...new Set(championships.flatMap(championship => championship.playerIds))];
  const stats = {};

  ids.forEach(id => {
    stats[id] = {
      id,
      name: getPlayerName(id),
      tournaments: 0,
      pj: 0,
      v: 0,
      e: 0,
      d: 0,
      gf: 0,
      gc: 0,
      cleanSheets: 0,
      pts: 0
    };
  });

  championships.forEach(championship => {
    championship.playerIds.forEach(id => {
      if (stats[id]) stats[id].tournaments += 1;
    });
  });

  playedMatches(championships).forEach(match => {
    if (!stats[match.homeId] || !stats[match.awayId]) return;

    const home = stats[match.homeId];
    const away = stats[match.awayId];
    home.pj += 1;
    away.pj += 1;
    home.gf += match.hs;
    home.gc += match.as;
    away.gf += match.as;
    away.gc += match.hs;
    if (match.as === 0) home.cleanSheets += 1;
    if (match.hs === 0) away.cleanSheets += 1;

    if (match.hs > match.as) {
      home.v += 1;
      away.d += 1;
      home.pts += 3;
    } else if (match.hs < match.as) {
      away.v += 1;
      home.d += 1;
      away.pts += 3;
    } else {
      home.e += 1;
      away.e += 1;
      home.pts += 1;
      away.pts += 1;
    }
  });

  return Object.values(stats)
    .map(player => ({
      ...player,
      dif: player.gf - player.gc,
      consistency: player.pj ? (player.v + player.e) / player.pj : 0
    }))
    .sort((a, b) => b.pts - a.pts || b.dif - a.dif || b.gf - a.gf || a.name.localeCompare(b.name));
}

function highlights(stats) {
  const withGames = stats.filter(player => player.pj > 0);
  if (!withGames.length) return [
    { label: "Más victorias", value: "—", sub: "Sin partidos" },
    { label: "Más goleador", value: "—", sub: "Sin goles" },
    { label: "Porterías a cero", value: "—", sub: "Sin datos" },
    { label: "Constancia", value: "—", sub: "Sin partidos" }
  ];

  const byWins = [...withGames].sort((a, b) => b.v - a.v || b.pts - a.pts)[0];
  const byGoals = [...withGames].sort((a, b) => b.gf - a.gf || b.v - a.v)[0];
  const byCleanSheets = [...withGames].sort((a, b) => b.cleanSheets - a.cleanSheets || b.v - a.v)[0];
  const byConsistency = [...withGames].sort((a, b) => b.consistency - a.consistency || b.pj - a.pj)[0];

  return [
    { label: "Más victorias", value: byWins.name, sub: `${byWins.v} ganados` },
    { label: "Más goleador", value: byGoals.name, sub: `${byGoals.gf} goles` },
    { label: "Porterías a cero", value: byCleanSheets.name, sub: `${byCleanSheets.cleanSheets} partidos` },
    { label: "Constancia", value: byConsistency.name, sub: `${Math.round(byConsistency.consistency * 100)}% sin perder` }
  ];
}

function renderHighlights(containerId, stats) {
  document.getElementById(containerId).innerHTML = highlights(stats).map(item => `
    <article class="stat-card">
      <span>${item.label}</span>
      <strong>${escapeHTML(item.value)}</strong>
      <small>${escapeHTML(item.sub)}</small>
    </article>
  `).join("");
}

function renderHeader() {
  const current = getCurrentChampionship();
  document.getElementById("appTitle").textContent = current ? current.name.toUpperCase() : "TORNEO";
  document.getElementById("appSubtitle").textContent = current
    ? `⚽ ${current.rounds === 2 ? "Ida y vuelta" : "Solo ida"} · ${current.playerIds.length} jugadores`
    : "⚽ Campeonatos locales entre amigos";

  const total = current?.matches.length || 0;
  const played = current?.matches.filter(match => match.hs !== null && match.as !== null).length || 0;
  document.getElementById("progressFill").style.width = `${total ? (played / total) * 100 : 0}%`;
  document.getElementById("progressLabel").textContent = `${played}/${total} partidos jugados`;
}

function renderPlayerPicker() {
  const picker = document.getElementById("playerPicker");
  picker.innerHTML = state.players.map(player => `
    <label class="player-chip">
      <input type="checkbox" value="${player.id}" checked />
      <span class="avatar-sm" style="background:${player.color}">${initials(player.name)}</span>
      ${escapeHTML(player.name)}
    </label>
  `).join("");
}

function renderChampionships() {
  const list = document.getElementById("championshipList");
  if (!state.championships.length) {
    list.innerHTML = `<div class="empty-state">Todavía no hay campeonatos guardados.</div>`;
    return;
  }

  list.innerHTML = state.championships.map(championship => {
    const stats = buildStats([championship], championship.playerIds);
    const leader = stats[0];
    const isActive = championship.id === state.currentChampionshipId;
    const played = championship.matches.filter(match => match.hs !== null && match.as !== null).length;
    return `
      <article class="championship-card ${isActive ? "active" : ""}">
        <div>
          <h3>${escapeHTML(championship.name)}</h3>
          <p>${championship.rounds === 2 ? "Ida y vuelta" : "Solo ida"} · ${championship.playerIds.length} jugadores · ${played}/${championship.matches.length} partidos</p>
          <small>Líder: ${leader ? escapeHTML(leader.name) : "—"}</small>
        </div>
        <div class="card-actions">
          <button class="btn btn-edit" onclick="selectChampionship('${championship.id}')">${isActive ? "Seleccionado" : "Abrir"}</button>
          <button class="btn btn-clear" onclick="deleteChampionship('${championship.id}')">🗑</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderPlayers() {
  document.getElementById("playersList").innerHTML = state.players.map(player => `
    <article class="player-row">
      <div class="player-row-main">
        <span class="avatar" style="background:${player.color}">${initials(player.name)}</span>
        <div>
          <strong>${escapeHTML(player.name)}</strong>
          <small>${player.color}</small>
        </div>
      </div>
      <button class="btn btn-clear" onclick="deletePlayer('${player.id}')">Eliminar</button>
    </article>
  `).join("");
}

function renderMatches() {
  const current = getCurrentChampionship();
  const empty = document.getElementById("matchesEmpty");
  const container = document.getElementById("matchesContainer");

  if (!current) {
    empty.style.display = "block";
    container.innerHTML = "";
    return;
  }

  empty.style.display = "none";
  const rounds = [...new Set(current.matches.map(match => match.round))].sort((a, b) => a - b);
  container.innerHTML = rounds.map(round => {
    const matches = current.matches.filter(match => match.round === round);
    const bye = current.byes?.find(item => item.round === round);
    const leg = matches[0]?.leg || bye?.leg || 1;
    return `
      <div class="session-label"><span class="dot ${leg === 2 ? "pink" : ""}"></span>${leg === 2 ? "Vuelta" : "Ida"} · Jornada ${round}</div>
      ${bye ? buildByeCard(bye) : ""}
      ${matches.map(match => buildMatchCard(match)).join("")}
    `;
  }).join("");
}

function buildByeCard(bye) {
  return `
    <article class="bye-card">
      <span class="avatar-sm" style="background:${getPlayerColor(bye.playerId)}">${initials(getPlayerName(bye.playerId))}</span>
      <strong>${escapeHTML(getPlayerName(bye.playerId))}</strong> descansa esta jornada por cantidad impar de jugadores.
    </article>
  `;
}

function buildMatchCard(match) {
  const played = match.hs !== null && match.as !== null;
  const isEdit = editingMatchId === match.id;
  let homeClass = "";
  let awayClass = "";

  if (played) {
    if (match.hs > match.as) {
      homeClass = "win";
      awayClass = "loss";
    } else if (match.hs < match.as) {
      homeClass = "loss";
      awayClass = "win";
    } else {
      homeClass = "draw";
      awayClass = "draw";
    }
  }

  const scoreHtml = isEdit ? `
    <div class="edit-row">
      <input class="score-input" id="inputHome" type="number" min="0" max="99" value="${played ? match.hs : ""}" />
      <span class="score-dash">-</span>
      <input class="score-input" id="inputAway" type="number" min="0" max="99" value="${played ? match.as : ""}" />
    </div>` : played ? `
    <div class="score-display">
      <span class="score-num ${homeClass === "win" ? "win" : ""}">${match.hs}</span>
      <span class="score-dash">-</span>
      <span class="score-num ${awayClass === "win" ? "win" : ""}">${match.as}</span>
    </div>` : `<span class="vs-text">VS</span>`;

  const buttons = isEdit ? `
    <button class="btn btn-save" onclick="saveScore(${match.id})">✓ Guardar</button>
    <button class="btn btn-cancel" onclick="cancelEdit()">✕</button>` : `
    <button class="btn btn-edit" onclick="openEdit(${match.id})">${played ? "✏️ Editar" : "⚽ Ingresar resultado"}</button>
    ${played ? `<button class="btn btn-clear" onclick="clearScore(${match.id})">🗑</button>` : ""}`;

  return `
    <article class="card ${played ? "played" : ""}">
      <div class="match-num">#${match.id} <span class="vuelta-tag">J${match.round}</span></div>
      <div class="match-row">
        <div class="team right">
          <span class="team-name ${homeClass}">${escapeHTML(getPlayerName(match.homeId))}</span>
          <div class="avatar" style="background:${getPlayerColor(match.homeId)}">${initials(getPlayerName(match.homeId))}</div>
        </div>
        <div class="score-area">${scoreHtml}</div>
        <div class="team">
          <div class="avatar" style="background:${getPlayerColor(match.awayId)}">${initials(getPlayerName(match.awayId))}</div>
          <span class="team-name ${awayClass}">${escapeHTML(getPlayerName(match.awayId))}</span>
        </div>
      </div>
      <div class="actions">${buttons}</div>
    </article>
  `;
}

function renderStandings() {
  const current = getCurrentChampionship();
  const body = document.getElementById("standingsBody");

  if (!current) {
    body.innerHTML = `<tr><td colspan="12" class="empty-cell">Selecciona un campeonato.</td></tr>`;
    document.getElementById("localHighlights").innerHTML = "";
    return;
  }

  const standings = buildStats([current], current.playerIds);
  renderHighlights("localHighlights", standings);
  body.innerHTML = standings.map((player, index) => tableRow(player, index, false)).join("");
}

function renderGlobalStats() {
  const stats = buildStats(state.championships);
  renderHighlights("globalHighlights", stats);
  document.getElementById("globalStandingsBody").innerHTML = stats.length
    ? stats.map((player, index) => tableRow(player, index, true)).join("")
    : `<tr><td colspan="13" class="empty-cell">No hay datos globales todavía.</td></tr>`;
}

function tableRow(player, index, includeTournaments) {
  const medal = ["🥇", "🥈", "🥉"][index] || index + 1;
  const dif = `${player.dif > 0 ? "+" : ""}${player.dif}`;
  const difColor = player.dif > 0 ? "#22C55E" : player.dif < 0 ? "#FF6B35" : "#aaa";
  return `
    <tr class="${index < 3 ? "top" : ""}">
      <td class="rank">${medal}</td>
      <td><span class="avatar-sm" style="background:${getPlayerColor(player.id)}">${initials(player.name)}</span></td>
      <td class="player-name">${escapeHTML(player.name)}</td>
      ${includeTournaments ? `<td>${player.tournaments}</td>` : ""}
      <td>${player.pj}</td>
      <td class="green">${player.v}</td>
      <td class="yellow-c">${player.e}</td>
      <td class="red">${player.d}</td>
      <td>${player.gf}</td>
      <td>${player.gc}</td>
      <td style="color:${difColor}">${dif}</td>
      <td>${player.cleanSheets}</td>
      <td class="pts-col">${player.pts}</td>
    </tr>
  `;
}

function renderAll() {
  renderHeader();
  renderPlayerPicker();
  renderChampionships();
  renderPlayers();
  renderMatches();
  renderStandings();
  renderGlobalStats();
}

function createChampionship() {
  const name = normalizeName(document.getElementById("championshipName").value) || `Campeonato ${state.championships.length + 1}`;
  const rounds = Number(document.getElementById("championshipRounds").value);
  const selectedIds = [...document.querySelectorAll("#playerPicker input:checked")].map(input => input.value);
  const newNames = document.getElementById("championshipNewPlayers").value
    .split(/[\n,]+/)
    .map(normalizeName)
    .filter(Boolean);
  const newIds = newNames.map(name => findOrCreatePlayer(name).id);
  const playerIds = [...new Set([...selectedIds, ...newIds])];

  if (playerIds.length < 2) {
    alert("Necesitas al menos 2 jugadores para crear un campeonato.");
    return;
  }

  const championship = {
    id: uid("champ"),
    name,
    rounds,
    playerIds,
    createdAt: new Date().toISOString(),
    ...generateSchedule(playerIds, rounds)
  };

  state.championships.unshift(championship);
  state.currentChampionshipId = championship.id;
  editingMatchId = null;
  document.getElementById("championshipName").value = "";
  document.getElementById("championshipNewPlayers").value = "";
  saveState();
  switchTab("matches");
  renderAll();
}

function selectChampionship(id) {
  state.currentChampionshipId = id;
  editingMatchId = null;
  saveState();
  renderAll();
}

function deleteChampionship(id) {
  if (!confirm("¿Eliminar este campeonato?")) return;
  state.championships = state.championships.filter(championship => championship.id !== id);
  if (state.currentChampionshipId === id) state.currentChampionshipId = state.championships[0]?.id || null;
  saveState();
  renderAll();
}

function addPlayerFromInput() {
  const input = document.getElementById("playerNameInput");
  const player = findOrCreatePlayer(input.value);
  if (!player) return;
  input.value = "";
  saveState();
  renderAll();
}

function deletePlayer(id) {
  const isUsed = state.championships.some(championship => championship.playerIds.includes(id));
  if (isUsed) {
    alert("No se puede eliminar: este jugador ya participa en un campeonato guardado.");
    return;
  }
  state.players = state.players.filter(player => player.id !== id);
  saveState();
  renderAll();
}

function openEdit(id) {
  editingMatchId = id;
  renderMatches();
  setTimeout(() => document.getElementById("inputHome")?.focus(), 50);
}

function cancelEdit() {
  editingMatchId = null;
  renderMatches();
}

function saveScore(id) {
  const h = parseInt(document.getElementById("inputHome").value, 10);
  const a = parseInt(document.getElementById("inputAway").value, 10);
  if (Number.isNaN(h) || Number.isNaN(a) || h < 0 || a < 0) return;

  const current = getCurrentChampionship();
  const match = current.matches.find(item => item.id === id);
  match.hs = h;
  match.as = a;
  editingMatchId = null;
  saveState();
  renderAll();
}

function clearScore(id) {
  const current = getCurrentChampionship();
  const match = current.matches.find(item => item.id === id);
  match.hs = null;
  match.as = null;
  editingMatchId = null;
  saveState();
  renderAll();
}

function switchTab(tab) {
  activeTab = tab;
  ["championships", "matches", "table", "stats", "players"].forEach(name => {
    document.getElementById(`${name}Tab`).style.display = name === tab ? "block" : "none";
  });
  document.querySelectorAll(".tab").forEach(button => {
    button.classList.toggle("active", button.getAttribute("onclick")?.includes(`'${tab}'`));
  });
  renderAll();
}

renderAll();
