const STORAGE_KEY = "fifa26_championship_manager_v2";
const LEGACY_STORAGE_KEY = "fifa26_championship_manager_v1";
const COLOR_PALETTE = [
  "#2F80ED", "#27D36F", "#8B5CF6", "#FF6B35", "#FACC15", "#EC4899",
  "#14B8A6", "#38BDF8", "#F43F5E", "#84CC16", "#D946EF", "#A3E635",
  "#FB7185", "#22D3EE", "#C084FC", "#F97316", "#10B981", "#EAB308"
];
const FORMATS = {
  round_robin_single: { label: "Solo ida", type: "league", legs: 1, final: false, third: false },
  round_robin_double: { label: "Ida y vuelta", type: "league", legs: 2, final: false, third: false },
  rr_double_final_third: { label: "Ida y vuelta + final + 4.º vs 5.º por tercero", type: "league", legs: 2, final: true, third: true },
  rr_double_final: { label: "Ida y vuelta + final sin tercer lugar", type: "league", legs: 2, final: true, third: false },
  league_champion: { label: "Liga: el primero queda campeón", type: "league", legs: 1, final: false, third: false },
  champions_knockout: { label: "Tipo Champions: eliminación directa", type: "knockout", legs: 1, final: false, third: false }
};

let state = loadState();
let currentView = "home";
let activeTournamentTab = "matches";
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
  return String(name || "").trim().replace(/\s+/g, " ");
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

  try {
    localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch (error) {
    console.warn("No se pudo limpiar el estado anterior", error);
  }

  const players = ["Joseph", "Brenes", "Daniel", "Isaac", "Leo"].map((name, index) => ({
    id: uid("player"),
    name,
    color: COLOR_PALETTE[index]
  }));
  const demo = createChampionshipData("Torneo Familia Palmeña", "round_robin_double", players.map(player => player.id));
  seedDemoScores(demo);
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

function formatConfig(format) {
  return FORMATS[format] || FORMATS.round_robin_double;
}

function nextAvailableColor() {
  const used = new Set(state.players.map(player => player.color));
  const available = COLOR_PALETTE.find(color => !used.has(color));
  if (available) return available;

  let hue = Math.floor(Math.random() * 360);
  let color = `hsl(${hue}, 78%, 55%)`;
  while (used.has(color)) {
    hue = (hue + 41) % 360;
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
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createChampionshipData(name, format, playerIds) {
  const config = formatConfig(format);
  const data = config.type === "knockout"
    ? generateKnockout(playerIds)
    : generateLeague(playerIds, config.legs);

  return {
    id: uid("champ"),
    name,
    format,
    playerIds,
    createdAt: new Date().toISOString(),
    matches: data.matches,
    byes: data.byes
  };
}

function generateLeague(playerIds, legs) {
  const rotating = shuffle(playerIds);
  if (rotating.length % 2 === 1) rotating.push(null);

  const totalRounds = rotating.length - 1;
  const half = rotating.length / 2;
  const matches = [];
  const byes = [];
  let matchNumber = 1;
  let roundPlayers = [...rotating];

  for (let round = 1; round <= totalRounds; round += 1) {
    const roundMatches = [];
    for (let i = 0; i < half; i += 1) {
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
        stage: "league",
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

  if (Number(legs) === 2) {
    const firstLeg = [...matches];
    firstLeg.forEach(match => {
      matches.push({
        id: matchNumber++,
        stage: "league",
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

function generateKnockout(playerIds) {
  return { matches: buildKnockoutRound(shuffle(playerIds), 1, 1), byes: [] };
}

function buildKnockoutRound(playerIds, round, startId) {
  const shuffled = shuffle(playerIds);
  const matches = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    if (!shuffled[i + 1]) continue;
    matches.push({
      id: startId + matches.length,
      stage: "knockout",
      round,
      leg: 1,
      homeId: shuffled[i],
      awayId: shuffled[i + 1],
      hs: null,
      as: null
    });
  }
  return matches;
}

function seedDemoScores(championship) {
  const scores = [[3, 2], [1, 1], [4, 2], [2, 0], [1, 3], [5, 2], [0, 0], [2, 4]];
  championship.matches.slice(0, scores.length).forEach((match, index) => {
    match.hs = scores[index][0];
    match.as = scores[index][1];
  });
}

function leagueMatches(championship) {
  return championship.matches.filter(match => match.stage === "league");
}

function played(match) {
  return match.hs !== null && match.as !== null;
}

function winnerOf(match) {
  if (!played(match) || match.hs === match.as) return null;
  return match.hs > match.as ? match.homeId : match.awayId;
}

function isLeagueComplete(championship) {
  const matches = leagueMatches(championship);
  return matches.length > 0 && matches.every(played);
}

function ensurePostLeagueMatches(championship) {
  const config = formatConfig(championship.format);
  if (config.type !== "league") return;
  if (!config.final && !config.third) return;

  championship.matches = championship.matches.filter(match => !["final", "third"].includes(match.stage));
  if (!isLeagueComplete(championship)) return;

  const standings = buildStats([championship], championship.playerIds, { leagueOnly: true });
  let nextId = Math.max(0, ...championship.matches.map(match => match.id)) + 1;
  if (config.third && standings[3] && standings[4]) {
    championship.matches.push({
      id: nextId++,
      stage: "third",
      round: 998,
      leg: 1,
      homeId: standings[3].id,
      awayId: standings[4].id,
      hs: null,
      as: null
    });
  }
  if (config.final && standings[0] && standings[1]) {
    championship.matches.push({
      id: nextId,
      stage: "final",
      round: 999,
      leg: 1,
      homeId: standings[0].id,
      awayId: standings[1].id,
      hs: null,
      as: null
    });
  }
}

function ensureKnockoutProgress(championship) {
  if (formatConfig(championship.format).type !== "knockout") return;
  const rounds = [...new Set(championship.matches.map(match => match.round))].sort((a, b) => a - b);
  const lastRound = rounds[rounds.length - 1] || 1;
  const lastMatches = championship.matches.filter(match => match.round === lastRound);
  if (!lastMatches.length || lastMatches.some(match => !winnerOf(match))) return;
  if (lastMatches.length === 1) return;
  if (championship.matches.some(match => match.round === lastRound + 1)) return;

  const winners = lastMatches.map(winnerOf);
  const nextMatches = buildKnockoutRound(winners, lastRound + 1, Math.max(...championship.matches.map(match => match.id)) + 1);
  championship.matches.push(...nextMatches);
}

function syncDerivedMatches(championship) {
  if (!championship) return;
  ensurePostLeagueMatches(championship);
  ensureKnockoutProgress(championship);
}

function matchesForStats(championship, options = {}) {
  return championship.matches.filter(match => {
    if (options.leagueOnly && match.stage !== "league") return false;
    return played(match);
  });
}

function buildStats(championships, playerIds = null, options = {}) {
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
      p: 0,
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
    matchesForStats(championship, options).forEach(match => {
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
        away.p += 1;
        home.pts += 3;
      } else if (match.hs < match.as) {
        away.v += 1;
        home.p += 1;
        away.pts += 3;
      } else {
        home.e += 1;
        away.e += 1;
        home.pts += 1;
        away.pts += 1;
      }
    });
  });

  return Object.values(stats)
    .map(player => ({
      ...player,
      dif: player.gf - player.gc,
      consistency: player.pj ? (player.v + player.e) / player.pj : 0
    }))
    .sort((a, b) => b.pts - a.pts || b.dif - a.dif || b.gf - a.gf || a.name.localeCompare(b.name));
}

function championshipStatus(championship) {
  syncDerivedMatches(championship);
  const config = formatConfig(championship.format);
  const allPlayed = championship.matches.length > 0 && championship.matches.every(played);
  if (config.type === "knockout") {
    const finalMatch = championship.matches.filter(match => match.stage === "knockout").sort((a, b) => b.round - a.round)[0];
    return finalMatch && championship.matches.filter(match => match.round === finalMatch.round).length === 1 && played(finalMatch) ? "Finalizado" : "En juego";
  }
  if ((config.final || config.third) && isLeagueComplete(championship)) return allPlayed ? "Finalizado" : "Finales pendientes";
  return allPlayed ? "Finalizado" : "En juego";
}

function championName(championship) {
  syncDerivedMatches(championship);
  const config = formatConfig(championship.format);
  const finalMatch = championship.matches.find(match => match.stage === "final")
    || (config.type === "knockout" ? championship.matches.filter(match => match.stage === "knockout").sort((a, b) => b.round - a.round)[0] : null);
  const finalWinner = finalMatch ? winnerOf(finalMatch) : null;
  if (finalWinner) return getPlayerName(finalWinner);
  const standings = buildStats([championship], championship.playerIds, { leagueOnly: config.final || config.third });
  return standings[0]?.name || "—";
}

function highlights(stats, championships = state.championships) {
  const withGames = stats.filter(player => player.pj > 0);
  const finished = championships.filter(championship => championshipStatus(championship) === "Finalizado").length;
  if (!withGames.length) return [
    { label: "Torneos", value: championships.length, sub: `${finished} finalizados` },
    { label: "Más victorias", value: "—", sub: "Sin partidos" },
    { label: "Más goleador", value: "—", sub: "Sin goles" },
    { label: "Porterías a cero", value: "—", sub: "Sin datos" }
  ];

  const byWins = [...withGames].sort((a, b) => b.v - a.v || b.pts - a.pts)[0];
  const byGoals = [...withGames].sort((a, b) => b.gf - a.gf || b.v - a.v)[0];
  const byCleanSheets = [...withGames].sort((a, b) => b.cleanSheets - a.cleanSheets || b.v - a.v)[0];
  return [
    { label: "Torneos", value: championships.length, sub: `${finished} finalizados` },
    { label: "Más victorias", value: byWins.name, sub: `${byWins.v} ganados` },
    { label: "Más goleador", value: byGoals.name, sub: `${byGoals.gf} goles` },
    { label: "Porterías a cero", value: byCleanSheets.name, sub: `${byCleanSheets.cleanSheets} partidos` }
  ];
}

function renderHeader() {
  const current = getCurrentChampionship();
  document.getElementById("appTitle").textContent = currentView === "tournament" && current ? current.name.toUpperCase() : "TORNEO";
  document.getElementById("appSubtitle").textContent = currentView === "tournament" && current
    ? `${formatConfig(current.format).label} · ${current.playerIds.length} jugadores · ${championshipStatus(current)}`
    : "Familia palmeña · Champions League de amigos";
  const matches = currentView === "tournament" && current ? current.matches : state.championships.flatMap(championship => championship.matches);
  const total = matches.length;
  const done = matches.filter(played).length;
  document.getElementById("progressPill").textContent = `${done} / ${total} partidos jugados`;
}

function renderHighlights(containerId, stats, championships) {
  document.getElementById(containerId).innerHTML = highlights(stats, championships).map(item => `
    <article class="stat-card">
      <span>${escapeHTML(item.label)}</span>
      <strong>${escapeHTML(item.value)}</strong>
      <small>${escapeHTML(item.sub)}</small>
    </article>
  `).join("");
}

function posterRow(player, index, includeTournaments) {
  const dif = `${player.dif > 0 ? "+" : ""}${player.dif}`;
  const difClass = player.dif > 0 ? "green" : player.dif < 0 ? "red" : "";
  return `
    <tr>
      <td class="rank-cell"><span>${index + 1}</span></td>
      <td class="player-cell">
        <span class="avatar" style="background:${getPlayerColor(player.id)}">${initials(player.name)}</span>
        <strong>${escapeHTML(player.name)}</strong>
      </td>
      ${includeTournaments ? `<td>${player.tournaments}</td>` : ""}
      <td>${player.pj}</td>
      <td class="green">${player.v}</td>
      <td class="yellow">${player.e}</td>
      <td class="red">${player.p}</td>
      <td>${player.gf}</td>
      <td>${player.gc}</td>
      <td class="${difClass}">${dif}</td>
      ${includeTournaments ? `<td>${player.cleanSheets}</td>` : ""}
      <td class="points">${player.pts}</td>
    </tr>
  `;
}

function renderGlobalStats() {
  state.championships.forEach(syncDerivedMatches);
  const stats = buildStats(state.championships);
  renderHighlights("globalHighlights", stats, state.championships);
  document.getElementById("globalStandingsBody").innerHTML = stats.length
    ? stats.map((player, index) => posterRow(player, index, true)).join("")
    : `<tr><td colspan="12" class="empty-cell">No hay datos generales todavía.</td></tr>`;
}

function renderPlayerPicker() {
  const picker = document.getElementById("playerPicker");
  picker.innerHTML = state.players.map(player => `
    <label class="player-chip">
      <input type="checkbox" value="${player.id}" checked />
      <span class="avatar small" style="background:${player.color}">${initials(player.name)}</span>
      ${escapeHTML(player.name)}
    </label>
  `).join("");
}

function renderChampionshipList() {
  const list = document.getElementById("championshipList");
  if (!state.championships.length) {
    list.innerHTML = `<div class="empty-state">Todavía no hay torneos guardados.</div>`;
    return;
  }

  list.innerHTML = state.championships.map(championship => {
    const done = championship.matches.filter(played).length;
    const total = championship.matches.length;
    return `
      <article class="championship-card" onclick="selectChampionship('${championship.id}')">
        <div>
          <span>${escapeHTML(championshipStatus(championship))}</span>
          <h3>${escapeHTML(championship.name)}</h3>
          <p>${escapeHTML(formatConfig(championship.format).label)} · ${championship.playerIds.length} jugadores · ${done}/${total} partidos</p>
          <small>Campeón / líder: ${escapeHTML(championName(championship))}</small>
        </div>
        <button class="btn-secondary" type="button">Abrir</button>
      </article>
    `;
  }).join("");
}

function renderTournamentSummary() {
  const current = getCurrentChampionship();
  if (!current) return;
  const standings = buildStats([current], current.playerIds);
  const done = current.matches.filter(played).length;
  document.getElementById("tournamentSummary").innerHTML = `
    <article class="stat-card"><span>Estado</span><strong>${championshipStatus(current)}</strong><small>${done}/${current.matches.length} partidos</small></article>
    <article class="stat-card"><span>Formato</span><strong>${escapeHTML(formatConfig(current.format).label)}</strong><small>${current.playerIds.length} jugadores</small></article>
    <article class="stat-card"><span>Líder</span><strong>${escapeHTML(standings[0]?.name || "—")}</strong><small>${standings[0]?.pts || 0} pts</small></article>
    <article class="stat-card"><span>Campeón</span><strong>${escapeHTML(championName(current))}</strong><small>Actualizado en vivo</small></article>
  `;
}

function stageTitle(match) {
  if (match.stage === "final") return "Final";
  if (match.stage === "third") return "Tercer lugar";
  if (match.stage === "knockout") return match.round === 1 ? "Eliminación directa" : `Ronda ${match.round}`;
  return `${match.leg === 2 ? "Vuelta" : "Ida"} · Jornada ${match.round}`;
}

function renderMatches() {
  const current = getCurrentChampionship();
  const container = document.getElementById("matchesContainer");
  if (!current) {
    container.innerHTML = `<div class="empty-state">Selecciona un torneo para ver partidos.</div>`;
    return;
  }
  syncDerivedMatches(current);
  const groups = [...new Set(current.matches.map(match => `${match.stage}-${match.round}`))];
  container.innerHTML = groups.map(key => {
    const matches = current.matches.filter(match => `${match.stage}-${match.round}` === key);
    const first = matches[0];
    const bye = current.byes?.find(item => item.round === first.round && item.leg === first.leg);
    return `
      <div class="session-label"><span class="dot ${first.leg === 2 || first.stage !== "league" ? "pink" : ""}"></span>${stageTitle(first)}</div>
      ${bye ? buildByeCard(bye) : ""}
      ${matches.map(buildMatchCard).join("")}
    `;
  }).join("");
}

function buildByeCard(bye) {
  return `
    <article class="bye-card">
      <span class="avatar small" style="background:${getPlayerColor(bye.playerId)}">${initials(getPlayerName(bye.playerId))}</span>
      <strong>${escapeHTML(getPlayerName(bye.playerId))}</strong> descansa esta jornada por cantidad impar de jugadores.
    </article>
  `;
}

function buildMatchCard(match) {
  const isEdit = editingMatchId === match.id;
  const isPlayed = played(match);
  const homeClass = isPlayed ? (match.hs > match.as ? "win" : match.hs < match.as ? "loss" : "draw") : "";
  const awayClass = isPlayed ? (match.as > match.hs ? "win" : match.as < match.hs ? "loss" : "draw") : "";
  const scoreHtml = isEdit ? `
    <div class="edit-row">
      <input class="score-input" id="inputHome" type="number" min="0" max="99" value="${isPlayed ? match.hs : ""}" />
      <span>-</span>
      <input class="score-input" id="inputAway" type="number" min="0" max="99" value="${isPlayed ? match.as : ""}" />
    </div>` : isPlayed ? `
    <div class="score-display"><strong class="${homeClass}">${match.hs}</strong><span>-</span><strong class="${awayClass}">${match.as}</strong></div>` : `<span class="vs-text">VS</span>`;
  const buttons = isEdit ? `
    <button class="btn-save" onclick="saveScore(${match.id})">Guardar</button>
    <button class="btn-ghost" onclick="cancelEdit()">Cancelar</button>` : `
    <button class="btn-ghost" onclick="openEdit(${match.id})">${isPlayed ? "Editar" : "Ingresar resultado"}</button>
    ${isPlayed ? `<button class="btn-danger" onclick="clearScore(${match.id})">Borrar</button>` : ""}`;

  return `
    <article class="match-card ${isPlayed ? "played" : ""}">
      <div class="match-tag">#${match.id} · ${stageTitle(match)}</div>
      <div class="match-row">
        <div class="team right">
          <strong class="${homeClass}">${escapeHTML(getPlayerName(match.homeId))}</strong>
          <span class="avatar" style="background:${getPlayerColor(match.homeId)}">${initials(getPlayerName(match.homeId))}</span>
        </div>
        <div class="score-area">${scoreHtml}</div>
        <div class="team">
          <span class="avatar" style="background:${getPlayerColor(match.awayId)}">${initials(getPlayerName(match.awayId))}</span>
          <strong class="${awayClass}">${escapeHTML(getPlayerName(match.awayId))}</strong>
        </div>
      </div>
      <div class="actions">${buttons}</div>
    </article>
  `;
}

function renderLocalTable() {
  const current = getCurrentChampionship();
  if (!current) return;
  syncDerivedMatches(current);
  const standings = buildStats([current], current.playerIds);
  document.getElementById("tableTournamentName").textContent = current.name;
  document.getElementById("tableTournamentFormat").textContent = formatConfig(current.format).label;
  renderHighlights("localHighlights", standings, [current]);
  document.getElementById("standingsBody").innerHTML = standings.map((player, index) => posterRow(player, index, false)).join("");
}

function renderPlayers() {
  document.getElementById("playersList").innerHTML = state.players.map(player => `
    <article class="player-row">
      <div class="player-row-main">
        <span class="avatar" style="background:${player.color}">${initials(player.name)}</span>
        <div><strong>${escapeHTML(player.name)}</strong><small>${player.color}</small></div>
      </div>
      <button class="btn-danger" onclick="deletePlayer('${player.id}')">Eliminar</button>
    </article>
  `).join("");
}

function renderAll() {
  renderHeader();
  renderGlobalStats();
  renderPlayerPicker();
  renderChampionshipList();
  renderTournamentSummary();
  renderMatches();
  renderLocalTable();
  renderPlayers();
  saveState();
}

function showView(view) {
  currentView = view;
  ["home", "create", "select", "tournament"].forEach(name => {
    document.getElementById(`${name}View`).style.display = name === view ? "block" : "none";
  });
  renderAll();
}

function showHomeView() { showView("home"); }
function showCreateView() { showView("create"); }
function showSelectView() { showView("select"); }

function createChampionship() {
  const name = normalizeName(document.getElementById("championshipName").value) || `Torneo ${state.championships.length + 1}`;
  const format = document.getElementById("championshipFormat").value;
  const selectedIds = [...document.querySelectorAll("#playerPicker input:checked")].map(input => input.value);
  const newNames = document.getElementById("championshipNewPlayers").value
    .split(/[\n,]+/)
    .map(normalizeName)
    .filter(Boolean);
  const newIds = newNames.map(nameItem => findOrCreatePlayer(nameItem).id);
  const playerIds = [...new Set([...selectedIds, ...newIds])];

  if (playerIds.length < 2) {
    alert("Necesitas al menos 2 jugadores para crear un torneo.");
    return;
  }
  if (format === "rr_double_final_third" && playerIds.length < 5) {
    alert("Este formato necesita al menos 5 jugadores para disputar 4.º vs 5.º por tercer lugar.");
    return;
  }

  const championship = createChampionshipData(name, format, playerIds);
  state.championships.unshift(championship);
  state.currentChampionshipId = championship.id;
  editingMatchId = null;
  document.getElementById("championshipName").value = "";
  document.getElementById("championshipNewPlayers").value = "";
  switchTournamentTab("matches");
  showView("tournament");
}

function selectChampionship(id) {
  state.currentChampionshipId = id;
  editingMatchId = null;
  switchTournamentTab("matches");
  showView("tournament");
}

function addPlayerFromInput() {
  const input = document.getElementById("playerNameInput");
  if (findOrCreatePlayer(input.value)) input.value = "";
  renderAll();
}

function deletePlayer(id) {
  const isUsed = state.championships.some(championship => championship.playerIds.includes(id));
  if (isUsed) {
    alert("No se puede eliminar: este jugador ya participa en un torneo guardado.");
    return;
  }
  state.players = state.players.filter(player => player.id !== id);
  renderAll();
}

function findMatch(id) {
  const current = getCurrentChampionship();
  return current?.matches.find(match => match.id === id) || null;
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
  const match = findMatch(id);
  if (!match) return;
  match.hs = h;
  match.as = a;
  editingMatchId = null;
  syncDerivedMatches(getCurrentChampionship());
  renderAll();
}

function clearScore(id) {
  const match = findMatch(id);
  if (!match) return;
  match.hs = null;
  match.as = null;
  editingMatchId = null;
  syncDerivedMatches(getCurrentChampionship());
  renderAll();
}

function switchTournamentTab(tab) {
  activeTournamentTab = tab;
  ["matches", "table", "players"].forEach(name => {
    document.getElementById(`${name}Tab`).style.display = name === tab ? "block" : "none";
  });
  document.querySelectorAll(".tab").forEach(button => {
    button.classList.toggle("active", button.getAttribute("onclick")?.includes(`'${tab}'`));
  });
  renderAll();
}

renderAll();
