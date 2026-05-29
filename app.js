const AVATAR_COLORS = {
  Isaac: "#00C6FF", Daniel: "#FF6B35",
  Brenes: "#A855F7", Joseph: "#22C55E", Leo: "#FACC15"
};

const PLAYERS = ["Isaac", "Daniel", "Brenes", "Joseph", "Leo"];

let matches = [
  { id: 1, home: "Joseph", away: "Brenes", hs: null, as: null, time: "5pm" },
  { id: 2, home: "Isaac",  away: "Daniel", hs: 3,    as: 3,    time: "5pm" },
  { id: 3, home: "Isaac",  away: "Brenes", hs: null, as: null, time: "5pm" },
  { id: 4, home: "Daniel", away: "Joseph", hs: null, as: null, time: "5pm" },
  { id: 5, home: "Isaac",  away: "Joseph", hs: null, as: null, time: "5pm" },
  { id: 6, home: "Brenes", away: "Daniel", hs: null, as: null, time: "5pm" },
  { id: 7, home: "Isaac",  away: "Leo",    hs: null, as: null, time: "7pm" },
  { id: 8, home: "Leo",    away: "Brenes", hs: null, as: null, time: "7pm" },
  { id: 9, home: "Daniel", away: "Leo",    hs: null, as: null, time: "7pm" },
  { id: 10, home: "Joseph", away: "Leo",   hs: null, as: null, time: "7pm" },
];

let editing = null;

function initials(name) { return name.slice(0, 2).toUpperCase(); }

function calcStandings() {
  const t = {};
  PLAYERS.forEach(p => t[p] = { pj:0, v:0, e:0, d:0, ga:0, gr:0, pts:0 });
  matches.forEach(({ home, away, hs, as: awayS }) => {
    if (hs === null || awayS === null) return;
    t[home].pj++; t[away].pj++;
    t[home].ga += hs; t[home].gr += awayS;
    t[away].ga += awayS; t[away].gr += hs;
    if (hs > awayS)       { t[home].v++; t[away].d++; t[home].pts += 3; }
    else if (hs < awayS)  { t[away].v++; t[home].d++; t[away].pts += 3; }
    else                  { t[home].e++; t[away].e++; t[home].pts++; t[away].pts++; }
  });
  return PLAYERS.map(name => ({ name, ...t[name], dif: t[name].ga - t[name].gr }))
    .sort((a, b) => b.pts - a.pts || b.dif - a.dif || b.ga - a.ga);
}

function renderMatches() {
  const s1 = document.getElementById("session1");
  const s2 = document.getElementById("session2");
  s1.innerHTML = ""; s2.innerHTML = "";
  matches.forEach(m => {
    const el = buildCard(m);
    (m.time === "5pm" ? s1 : s2).appendChild(el);
  });
  updateProgress();
}

function buildCard(m) {
  const played = m.hs !== null;
  const isEdit = editing === m.id;

  let homeClass = "", awayClass = "";
  if (played) {
    if (m.hs > m.as)       { homeClass = "win"; awayClass = "loss"; }
    else if (m.hs < m.as)  { homeClass = "loss"; awayClass = "win"; }
    else                   { homeClass = "draw"; awayClass = "draw"; }
  }

  const card = document.createElement("div");
  card.className = "card" + (played ? " played" : "");

  // Score area HTML
  let scoreHtml;
  if (isEdit) {
    scoreHtml = `
      <div class="edit-row">
        <input class="score-input" id="inputHome" type="number" min="0" max="99" value="${m.hs !== null ? m.hs : ""}" />
        <span class="score-dash">-</span>
        <input class="score-input" id="inputAway" type="number" min="0" max="99" value="${m.as !== null ? m.as : ""}" />
      </div>`;
  } else if (played) {
    scoreHtml = `
      <div class="score-display">
        <span class="score-num ${homeClass === 'win' ? 'win' : ''}">${m.hs}</span>
        <span class="score-dash">-</span>
        <span class="score-num ${awayClass === 'win' ? 'win' : ''}">${m.as}</span>
      </div>`;
  } else {
    scoreHtml = `<span class="vs-text">VS</span>`;
  }

  // Buttons
  let btnsHtml;
  if (isEdit) {
    btnsHtml = `
      <button class="btn btn-save" onclick="saveScore(${m.id})">✓ Guardar</button>
      <button class="btn btn-cancel" onclick="cancelEdit()">✕</button>`;
  } else {
    btnsHtml = `<button class="btn btn-edit" onclick="openEdit(${m.id})">${played ? "✏️ Editar" : "⚽ Ingresar resultado"}</button>`;
    if (played) btnsHtml += `<button class="btn btn-clear" onclick="clearScore(${m.id})">🗑</button>`;
  }

  card.innerHTML = `
    <div class="match-num">#${m.id}</div>
    <div class="match-row">
      <div class="team right">
        <span class="team-name ${homeClass}">${m.home}</span>
        <div class="avatar" style="background:${AVATAR_COLORS[m.home]}">${initials(m.home)}</div>
      </div>
      <div class="score-area">${scoreHtml}</div>
      <div class="team">
        <div class="avatar" style="background:${AVATAR_COLORS[m.away]}">${initials(m.away)}</div>
        <span class="team-name ${awayClass}">${m.away}</span>
      </div>
    </div>
    <div class="actions">${btnsHtml}</div>
  `;

  return card;
}

function renderTable() {
  const standings = calcStandings();
  const medals = ["🥇", "🥈", "🥉"];
  const body = document.getElementById("standingsBody");
  body.innerHTML = "";

  standings.forEach((p, i) => {
    const difColor = p.dif > 0 ? "#22C55E" : p.dif < 0 ? "#FF6B35" : "#aaa";
    const difStr = (p.dif > 0 ? "+" : "") + p.dif;
    const row = document.createElement("div");
    row.className = "standing-row" + (i < 3 ? " top" : "");
    row.innerHTML = `
      <div class="col-name">
        <span class="rank">${medals[i] || (i + 1)}</span>
        <div class="avatar-sm" style="background:${AVATAR_COLORS[p.name]}">${initials(p.name)}</div>
        <span class="player-name">${p.name}</span>
      </div>
      <span class="col">${p.pj}</span>
      <span class="col green">${p.v}</span>
      <span class="col yellow-c">${p.e}</span>
      <span class="col red">${p.d}</span>
      <span class="col">${p.ga}</span>
      <span class="col">${p.gr}</span>
      <span class="col" style="color:${difColor}">${difStr}</span>
      <span class="col pts-col">${p.pts}</span>
    `;
    body.appendChild(row);
  });
}

function updateProgress() {
  const played = matches.filter(m => m.hs !== null).length;
  document.getElementById("progressFill").style.width = (played / matches.length * 100) + "%";
  document.getElementById("progressLabel").textContent = `${played}/${matches.length} partidos jugados`;
}

function openEdit(id) {
  editing = id;
  renderMatches();
  // Focus first input after render
  setTimeout(() => { const el = document.getElementById("inputHome"); if (el) el.focus(); }, 50);
}

function cancelEdit() {
  editing = null;
  renderMatches();
}

function saveScore(id) {
  const h = parseInt(document.getElementById("inputHome").value);
  const a = parseInt(document.getElementById("inputAway").value);
  if (isNaN(h) || isNaN(a) || h < 0 || a < 0) return;
  const m = matches.find(x => x.id === id);
  m.hs = h; m.as = a;
  editing = null;
  renderMatches();
  renderTable();
}

function clearScore(id) {
  const m = matches.find(x => x.id === id);
  m.hs = null; m.as = null;
  editing = null;
  renderMatches();
  renderTable();
}

function switchTab(tab) {
  document.getElementById("matchesTab").style.display = tab === "matches" ? "block" : "none";
  document.getElementById("tableTab").style.display   = tab === "table"   ? "block" : "none";
  document.querySelectorAll(".tab").forEach((el, i) => {
    el.classList.toggle("active", (i === 0 && tab === "matches") || (i === 1 && tab === "table"));
  });
  if (tab === "table") renderTable();
}

// Init
renderMatches();
renderTable();
