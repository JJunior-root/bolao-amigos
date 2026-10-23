/* ==========================================================
   APP v3 — telas, navegação, palpites, conta e administração
   Novidades: countdown ao vivo, placar ao vivo, skeletons,
   transições de tela, auth com medidor de força e admin expandido
   ========================================================== */

/* ---------- Utilidades ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* storage bloqueado */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* storage bloqueado */ } }
};
const THEME_KEY = "arquibancada-theme";
const FAVORITE_TEAM_KEY = "arquibancada-favorite-team";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pad2 = (n) => String(n).padStart(2, "0");
const reducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---------- Dados derivados ---------- */
const teamById = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
function localDateISO(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function normalizeGame(game, index) {
  if (!teamById[game.homeId] || !teamById[game.awayId] || game.homeId === game.awayId) return null;
  const validWinner = game.winnerId === "draw" || game.winnerId === game.homeId || game.winnerId === game.awayId;
  const validScore = (value) => Number.isInteger(value) && value >= 0 && value <= 30 ? value : null;
  return {
    id: String(game.id || `game-${index + 1}`),
    homeId: game.homeId,
    awayId: game.awayId,
    home: teamById[game.homeId],
    away: teamById[game.awayId],
    label: String(game.label || `Confronto ${String(index + 1).padStart(2, "0")}`),
    date: /^\d{4}-\d{2}-\d{2}$/.test(game.date || "") ? game.date : localDateISO(),
    time: /^\d{2}:\d{2}$/.test(game.time || "") ? game.time : "19:00",
    bettingClosesAt: game.bettingClosesAt || null,
    winnerId: validWinner ? game.winnerId : "",
    homeGoals: validScore(game.homeGoals),
    awayGoals: validScore(game.awayGoals),
    scorersHome: Array.isArray(game.scorersHome) ? game.scorersHome.map(String).map((name) => name.trim().slice(0, 40)).filter(Boolean) : [],
    onSite: game.onSite !== false,
    scorersAway: Array.isArray(game.scorersAway) ? game.scorersAway.map(String).map((name) => name.trim().slice(0, 40)).filter(Boolean) : [],
    liveStatus: String(game.liveStatus || ""),
    liveMinute: Number.isInteger(game.liveMinute) ? game.liveMinute : null,
    liveHome: Number.isInteger(game.liveHome) ? game.liveHome : null,
    liveAway: Number.isInteger(game.liveAway) ? game.liveAway : null
  };
}

let matches = [];
const ROUTES = ["inicio", "jogos", "palpite", "ranking", "meus-palpites", "admin"];
const TITLES = { inicio: "Início", jogos: "Jogos", palpite: "Palpite", ranking: "Ranking", "meus-palpites": "Meus palpites", admin: "Painel administrativo" };

/* ---------- Estado ---------- */
const state = { matchId: null, guessHome: null, guessAway: null, scorers: [], bets: [], busy: false, favoriteTeamId: null, gateTeamChoice: null };
let currentUser = null;
let authMode = "signup";
let adminBets = [];
let adminUsers = [];
const adminOpenCards = new Set();
let countdownExpiredTimer = null;

const selectedMatch = () => matches.find((m) => m.id === state.matchId) || null;
const isReady = () => Number.isInteger(state.guessHome) && Number.isInteger(state.guessAway) && state.scorers.length > 0;
const teamBadge = (team) => `<span class="club-badge"><img src="assets/${team.logo}" alt="" loading="lazy" /></span>`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const normQuery = (value) => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");

function cutoffDate(game) {
  if (game.bettingClosesAt) return new Date(game.bettingClosesAt);
  return new Date(new Date(`${game.date}T${game.time}:00-03:00`).getTime() - BET_CUTOFF_HOURS * 60 * 60 * 1000);
}
function bettingOpen(game) { return !game.winnerId && Date.now() < cutoffDate(game).getTime(); }
function formatCutoff(game) {
  return cutoffDate(game).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function shortDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(" de ", " ");
}
function winnerForScore(homeGoals, awayGoals, homeId, awayId) {
  if (homeGoals === awayGoals) return "draw";
  return homeGoals > awayGoals ? homeId : awayId;
}
function winnerName(game) {
  if (game.winnerId === "draw") return "Empate";
  if (game.winnerId === game.homeId) return game.home.name;
  if (game.winnerId === game.awayId) return game.away.name;
  return "Não definido";
}
function gameStatus(game) {
  if (game.homeGoals !== null && game.awayGoals !== null) {
    const completeHome = game.homeGoals === 0 || game.scorersHome.length > 0;
    const completeAway = game.awayGoals === 0 || game.scorersAway.length > 0;
    return completeHome && completeAway ? "Resultado completo" : "Placar registrado";
  }
  return game.winnerId ? "Vencedor registrado" : "Agendado";
}

/* ---------- Comunicação com o servidor ---------- */
async function api(method, path, body) {
  const options = { method, credentials: "same-origin", headers: {} };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(path, options);
  } catch {
    const err = new Error("Não foi possível conectar ao servidor. Verifique sua conexão.");
    err.status = 0;
    throw err;
  }
  let data = {};
  try { data = await response.json(); } catch { /* resposta sem JSON */ }
  if (!response.ok) {
    const err = new Error(data.error || "Erro ao comunicar com o servidor.");
    err.status = response.status;
    throw err;
  }
  return data;
}

const isAdmin = () => Boolean(currentUser && currentUser.role === "admin");

async function loadGames() {
  const query = state.favoriteTeamId ? `?teamId=${encodeURIComponent(state.favoriteTeamId)}` : "";
  const { games } = await api("GET", `/api/games${query}`);
  matches = games.map((game, index) => normalizeGame(game, index)).filter(Boolean)
    .filter((game) => isAdmin() || Boolean(state.favoriteTeamId && (game.homeId === state.favoriteTeamId || game.awayId === state.favoriteTeamId)));
}

async function refreshGames() {
  try {
    await loadGames();
  } catch (err) {
    showToast(err.message, "error");
  }
  jogosRendered = false;
  if (currentRoute() === "jogos") renderJogos();
  if (currentRoute() === "palpite") renderPalpite();
  if (currentRoute() === "admin") renderAdminGames();
  renderCounts();
}

async function loadSession() {
  const { user } = await api("GET", "/api/me");
  currentUser = user;
}

async function syncFavoriteTeam() {
  const saved = storage.get(FAVORITE_TEAM_KEY);
  const localTeam = teamById[saved] ? saved : null;
  if (currentUser && currentUser.favoriteTeamId) {
    state.favoriteTeamId = currentUser.favoriteTeamId;
    storage.set(FAVORITE_TEAM_KEY, state.favoriteTeamId);
    return;
  }
  state.favoriteTeamId = localTeam;
  if (currentUser && localTeam) {
    const { user } = await api("PUT", "/api/me/team", { teamId: localTeam });
    currentUser = user;
    state.favoriteTeamId = user.favoriteTeamId;
  }
}

async function loadMyBets() {
  state.bets = currentUser ? (await api("GET", "/api/bets")).bets : [];
}

function applyRoles() {
  document.documentElement.classList.toggle("is-admin", isAdmin());
  $$(".admin-only").forEach((el) => { el.hidden = !isAdmin(); });
}

/* ---------- Navegação entre telas ---------- */
function currentRoute() {
  const hash = location.hash.replace(/^#\//, "");
  return ROUTES.includes(hash) ? hash : "inicio";
}

function navigate(route) {
  if (location.hash !== `#/${route}`) location.hash = `#/${route}`;
  else renderRoute();
}

function renderRoute() {
  let route = currentRoute();
  if (route === "admin" && !isAdmin()) {
    showToast("Acesso restrito ao administrador.", "error");
    navigate("inicio");
    return;
  }
  $$("[data-screen]").forEach((screen) => { screen.hidden = screen.dataset.screen !== route; });
  const screen = $(`[data-screen="${route}"]`);
  screen.classList.remove("screen-enter");
  void screen.offsetWidth; // reinicia a animação
  screen.classList.add("screen-enter");

  $$("[data-route]").forEach((link) => {
    const active = link.dataset.route === route;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });
  $("#crumb").textContent = TITLES[route];
  document.title = `${TITLES[route]} — Bolão amigo`;
  window.scrollTo({ top: 0, behavior: reducedMotion() ? "auto" : "smooth" });

  if (route === "jogos") renderJogos();
  if (route === "palpite") renderPalpite();
  if (route === "meus-palpites") renderBets();
  if (route === "ranking") renderRanking();
  if (route === "admin") renderAdmin();
  renderCounts();
  setupReveal();
}

/* ---------- Countdown ao vivo (ticking 1s) ---------- */
function fmtCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return days > 0 ? `${days}d ${pad2(hours)}:${pad2(minutes)}` : `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
}

function tickCountdowns() {
  $$("[data-countdown]").forEach((el) => {
    const target = new Date(el.dataset.countdown).getTime();
    if (Number.isNaN(target)) return;
    const ms = target - Date.now();
    const value = el.querySelector("b") || el;
    if (ms <= 0) {
      value.textContent = "fechado";
      el.classList.add("closed");
      el.classList.remove("urgent");
      if (!el.dataset.expired) {
        el.dataset.expired = "1";
        scheduleCountdownRefresh();
      }
      return;
    }
    value.textContent = fmtCountdown(ms);
    el.classList.toggle("urgent", ms < 30 * 60 * 1000);
  });
}

function scheduleCountdownRefresh() {
  if (countdownExpiredTimer) return;
  countdownExpiredTimer = setTimeout(() => {
    countdownExpiredTimer = null;
    refreshGames();
  }, 2500);
}

setInterval(tickCountdowns, 1000);

/* ---------- Placar ao vivo ---------- */
function liveChip(game) {
  if (game.liveStatus !== "live") return "";
  const score = `${game.liveHome ?? 0} × ${game.liveAway ?? 0}`;
  const minute = game.liveMinute !== null && game.liveMinute !== undefined ? ` · ${game.liveMinute}'` : "";
  return `<span class="match-live"><i aria-hidden="true"></i>AO VIVO<b>${score}${minute}</b></span>`;
}

/* ---------- Tela: Ranking ---------- */
async function renderRanking() {
  const list = $("#ranking-list");
  list.innerHTML = `<div class="skel-list">${Array.from({ length: 4 }, (_, i) => `
    <div class="skel-card" style="--i:${i}"><div class="skel-row"><span class="skel skel-dot"></span><span class="skel skel-line w40"></span></div><span class="skel skel-line w80"></span></div>`).join("")}</div>`;
  let data;
  try {
    data = await api("GET", "/api/ranking");
  } catch (err) {
    list.innerHTML = `<p class="rank-empty">${esc(err.message)}</p>`;
    return;
  }
  const r = data.rules;
  $("#ranking-total").textContent = plural(data.gamesJudged, "jogo julgado", "jogos julgados");
  $("#ranking-rules").textContent =
    `${r.exact} pontos pelo placar exato · ${r.outcome} ponto por acertar o resultado (vencedor ou empate) · +${r.scorer} ponto por cada artilheiro escolhido que marcar gol.`;

  if (!data.ranking.length) {
    list.innerHTML = `<p class="rank-empty">Ainda não há jogadores com time fixo escolhido.</p>`;
    return;
  }
  list.innerHTML = data.ranking.map((row, i) => `
    <article class="rank-row stagger-item ${row.position <= 3 ? `top-${row.position}` : ""}" style="--i:${Math.min(i, 8)}">
      <span class="rank-pos">${row.position}</span>
      <span class="rank-team">${teamBadge(row.favoriteTeam)}</span>
      <div class="rank-who">
        <strong>${esc(row.name)}</strong>
        <small>${esc(row.favoriteTeam.name)} · ${plural(row.exactHits, "placar exato", "placares exatos")} · ${plural(row.outcomeHits, "resultado", "resultados")} · ${plural(row.scorerHits, "artilheiro", "artilheiros")} · ${plural(row.gamesCounted, "jogo", "jogos")}</small>
      </div>
      <div class="rank-streak"><small>Acertos</small><strong>${row.exactHits + row.outcomeHits}</strong><small>de ${row.gamesCounted} jogos</small></div>
      <div class="rank-points"><strong>${row.points}</strong><small>pts</small></div>
    </article>`).join("");
}

/* ---------- Tela: Início ---------- */
function animateNumber(el, target) {
  const from = Number(el.textContent) || 0;
  if (from === target) return;
  if (reducedMotion() || Math.abs(target - from) > 999) { el.textContent = target; return; }
  const duration = 480;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(from + (target - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderCounts() {
  const count = state.bets.length;
  animateNumber($("#home-games"), matches.length);
  ["#bet-count", "#tab-bet-count", "#home-bets"].forEach((sel) => {
    const el = $(sel);
    if (el.textContent !== String(count)) {
      el.textContent = count;
      el.classList.remove("bump");
      void el.offsetWidth;
      el.classList.add("bump");
    }
  });
  $("#tab-bet-count").dataset.zero = String(count === 0);
  $("#bets-total").textContent = plural(count, "palpite", "palpites");
}

/* ---------- Tela: Jogos ---------- */
let jogosRendered = false;
function matchCardHTML(match, i) {
  const open = bettingOpen(match);
  const closed = Boolean(match.winnerId) || !open;
  const countdown = !match.winnerId
    ? `<span class="match-countdown" data-countdown="${cutoffDate(match).toISOString()}"><span aria-hidden="true">⏱</span> Fecha em <b>${fmtCountdown(cutoffDate(match).getTime() - Date.now())}</b></span>`
    : "";
  const statusChip = match.winnerId
    ? `<span class="match-countdown closed"><span aria-hidden="true">✓</span> <b>Encerrado</b></span>`
    : liveChip(match);
  return `
    <button class="match-card stagger-item ${closed ? "closed" : ""}" style="--i:${Math.min(i, 10)}" type="button" data-match="${match.id}" ${match.winnerId ? "disabled" : ""}>
      <span class="match-topline"><span class="league-tag">Série A</span><span class="match-tag">${esc(match.label)} · ${shortDate(match.date)}</span></span>
      <span class="match-teams">
        <span class="team-mini">${teamBadge(match.home)}<span>${esc(match.home.name)}</span></span>
        <span class="versus">VS</span>
        <span class="team-mini">${teamBadge(match.away)}<span>${esc(match.away.name)}</span></span>
      </span>
      ${statusChip || countdown}
      <span class="match-bottom"><span>${esc(match.time)}${match.winnerId ? ` · ${esc(winnerName(match))}` : ""}</span><strong>${match.winnerId ? "ENCERRADO" : open ? "Palpitar <span aria-hidden=\"true\">→</span>" : "PALPITE FECHADO"}</strong></span>
    </button>`;
}

function renderJogos() {
  if (jogosRendered) return;
  jogosRendered = true;
  $("#match-list").innerHTML = matches.length
    ? matches.map(matchCardHTML).join("")
    : `<div class="no-bets" style="grid-column:1/-1"><span aria-hidden="true">▦</span><div><strong>Nenhum jogo do seu time por aqui</strong><p>Quando o administrador publicar um confronto do seu clube, ele aparece nesta lista.</p></div></div>`;

  const favoriteTeam = teamById[state.favoriteTeamId];
  $(".clubs-heading h2").textContent = favoriteTeam ? favoriteTeam.name : "Seu time fixo";
  $(".clubs-heading .eyebrow").textContent = "MEU TIME FIXO";
  $(".clubs-hint").textContent = favoriteTeam ? "Toque no escudo para palpitar sobre este time." : "Escolha seu time fixo para ver os jogos.";
  $("#club-grid").innerHTML = (favoriteTeam ? [favoriteTeam] : []).map((team, i) => `
    <button class="club-card stagger-item" style="--i:${i}" type="button" data-club="${team.id}" aria-label="Palpitar sobre ${esc(team.name)}">
      <img src="assets/${team.logo}" alt="" loading="lazy" />
      <span>${esc(team.name)}</span>
    </button>`).join("");
  tickCountdowns();
}

function renderJogosSkeleton() {
  $("#match-list").innerHTML = Array.from({ length: 4 }, () => `
    <div class="skel-card">
      <div class="skel-row"><span class="skel skel-line" style="width:64px;height:22px;border-radius:6px"></span><span class="skel skel-line w40"></span></div>
      <span class="skel skel-line w80"></span>
      <span class="skel skel-line w60"></span>
      <span class="skel skel-line" style="width:45%"></span>
    </div>`).join("");
  $("#club-grid").innerHTML = "";
}

/* ---------- Tela: Palpite ---------- */
function selectMatch(matchId) {
  state.matchId = matchId;
  state.guessHome = null;
  state.guessAway = null;
  state.scorers = [];
  // Se já existe palpite nesta partida, traz as escolhas de volta para ajuste
  // (o palpite pode ser alterado até o fechamento da janela).
  const existing = matchId ? state.bets.find((b) => b.matchId === matchId) : null;
  if (existing && Number.isInteger(existing.guessHome) && Number.isInteger(existing.guessAway)) {
    state.guessHome = existing.guessHome;
    state.guessAway = existing.guessAway;
    state.scorers = [...(existing.scorers || [])];
  }
  const search = $("#scorer-search");
  if (search) search.value = "";
}

function renderPalpite() {
  const match = selectedMatch();
  $("#palpite-empty").hidden = Boolean(match);
  $("#palpite-body").hidden = !match;
  if (!match) return;

  $("#pal-title").innerHTML = `${esc(match.home.name)} <span class="title-vs">x</span> ${esc(match.away.name)}`;
  $("#pal-meta").textContent = `${match.label} · Série A`;
  const cutoff = cutoffDate(match);
  if (match.winnerId) {
    $("#pal-deadline").innerHTML = "Partida finalizada. Os palpites estão encerrados.";
  } else if (bettingOpen(match)) {
    $("#pal-deadline").innerHTML = `Palpites até ${formatCutoff(match)} · fecha em <b data-countdown="${cutoff.toISOString()}">${fmtCountdown(cutoff.getTime() - Date.now())}</b>.`;
  } else {
    $("#pal-deadline").innerHTML = `Palpites encerrados em ${formatCutoff(match)} · ${BET_CUTOFF_HOURS} horas antes do início.`;
  }
  $("#bet-lock-notice").hidden = bettingOpen(match);
  $("#bet-lock-notice").textContent = match.winnerId ? "Partida finalizada: não é mais possível palpitar." : `Palpites encerrados. A janela fecha ${BET_CUTOFF_HOURS} horas antes do início.`;
  $("#slip-match-name").textContent = `${match.home.name} x ${match.away.name}`;
  renderScorePicker();
  renderScorerPicker();
  updateSummary();
  tickCountdowns();
}

function scoreSideHTML(side, team, value, disabled) {
  return `
    <div class="score-side">
      ${teamBadge(team)}
      <span class="score-team-name">${esc(team.name)}</span>
      <div class="stepper">
        <button class="step-btn" type="button" data-score-step="${side}:-1" aria-label="Diminuir gols de ${esc(team.name)}" ${disabled}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14" /></svg>
        </button>
        <input class="score-input" id="score-${side}" type="number" inputmode="numeric" min="0" max="${SCORE_MAX}" value="${value === null ? "" : value}" placeholder="–" aria-label="Gols de ${esc(team.name)}" ${disabled} />
        <button class="step-btn" type="button" data-score-step="${side}:1" aria-label="Aumentar gols de ${esc(team.name)}" ${disabled}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>
    </div>`;
}

function renderScorePicker() {
  const match = selectedMatch();
  if (!match) return;
  const disabled = !bettingOpen(match) ? "disabled" : "";
  $("#score-picker").innerHTML =
    scoreSideHTML("home", match.home, state.guessHome, disabled) +
    `<span class="score-x" aria-hidden="true">×</span>` +
    scoreSideHTML("away", match.away, state.guessAway, disabled);
}

function renderScorerPicker() {
  const container = $("#scorer-options");
  const match = selectedMatch();
  if (!match) return;
  const query = normQuery($("#scorer-search").value);
  const disabled = !bettingOpen(match) ? "disabled" : "";
  const full = state.scorers.length >= MAX_SCORERS;
  const groups = [match.home, match.away].map((team) => ({
    team,
    names: (ROSTERS[team.id] || []).filter((name) => !query || normQuery(name).includes(query))
  })).filter((group) => group.names.length);

  if (!groups.length) {
    container.innerHTML = `<p class="player-options-empty">Nenhum jogador encontrado com esse nome nos dois elencos.</p>`;
    return;
  }
  container.innerHTML = groups.map(({ team, names }) => `
    <div class="player-group">
      <p class="player-group-title">${esc(team.name)} <span>${names.length}</span></p>
      <div class="player-group-list">
        ${names.map((name, i) => {
          const selected = state.scorers.includes(name);
          return `<button class="player-option stagger-item ${selected ? "selected" : ""}" style="--i:${Math.min(i, 14)}" type="button" data-scorer="${esc(name)}" aria-pressed="${selected}" ${disabled || (!selected && full) ? "disabled" : ""}>${esc(name)}</button>`;
        }).join("")}
      </div>
    </div>`).join("");
  $("#scorer-counter").textContent = `${state.scorers.length}/${MAX_SCORERS}`;
}

function updateSummary() {
  const match = selectedMatch();
  if (!match) return;

  const rows = [];
  if (state.guessHome !== null && state.guessAway !== null) {
    rows.push(["Seu placar", `${state.guessHome} × ${state.guessAway}`]);
  }
  if (state.scorers.length) rows.push(["Artilheiros", state.scorers.join(", ")]);
  $("#slip-selections").innerHTML = rows.length
    ? rows.map(([label, value]) => `<div class="selection-row"><span>${label}</span><strong>${esc(value)}</strong></div>`).join("")
    : `<div class="empty-selection"><span aria-hidden="true">＋</span><p>Escolha o placar do jogo e pelo menos um artilheiro.</p></div>`;

  const done = [state.guessHome !== null && state.guessAway !== null, state.scorers.length > 0].filter(Boolean).length;
  $("#progress-bar").style.width = `${(done / 2) * 100}%`;
  $("#progress-text").textContent = `${done} de 2 escolhas`;

  $("#potential-points").textContent = `${POINTS.exact + state.scorers.length * POINTS.scorer} pts`;
  $("#submit-bet").disabled = !isReady() || state.busy || !match || !bettingOpen(match);
}

async function placeBet() {
  if (!isReady() || state.busy) return;
  if (!currentUser) {
    openAccount("Entre ou crie uma conta para registrar seu palpite.");
    return;
  }
  state.busy = true;
  updateSummary();
  try {
    const { bet } = await api("POST", "/api/bets", {
      gameId: state.matchId,
      guessHome: state.guessHome,
      guessAway: state.guessAway,
      scorers: state.scorers
    });
    const index = state.bets.findIndex((b) => b.matchId === bet.matchId);
    if (index >= 0) state.bets[index] = bet; else state.bets.unshift(bet);
    celebrate();
    renderCounts();
    setTimeout(() => {
      state.busy = false;
      selectMatch(null);
      hideCelebration();
      navigate("meus-palpites");
    }, 1700);
  } catch (err) {
    state.busy = false;
    updateSummary();
    if (err.status === 401) openAccount("Entre na sua conta para palpitar.");
    else showToast(err.message, "error");
  }
}

/* ---------- Tela: Meus palpites ---------- */
function renderBets() {
  renderCounts();
  const myBets = currentUser ? state.bets : [];
  $("#bets-total").textContent = plural(myBets.length, "palpite", "palpites");
  if (!myBets.length) {
    $("#bets-list").innerHTML = `
      <div class="no-bets"><span aria-hidden="true">◷</span><div><strong>${currentUser ? "Nenhum palpite por aqui ainda" : "Entre com uma conta demonstrativa"}</strong><p>${currentUser ? "Escolha um jogo e monte seu primeiro palpite." : "Assim seus palpites ficam associados ao seu nome."}</p></div></div>
      <button class="btn-primary btn-inline" type="button" data-go="jogos">Escolher um jogo <span aria-hidden="true">→</span></button>`;
    return;
  }
  $("#bets-list").innerHTML = myBets.map((bet, i) => {
    const result = getBetStatus(bet);
    const tagClass = result.kind === "exact" ? "result-won" : result.kind === "outcome" ? "result-partial" : result.kind === "lost" ? "result-lost" : result.kind === "waiting" ? "result-waiting" : "";
    const points = bet.points;
    return `
    <article class="bet-card stagger-item" style="--i:${Math.min(i, 10)}">
      <div class="bet-match"><strong>${esc(bet.match.home.name)} x ${esc(bet.match.away.name)}</strong><small>${esc(bet.match.label)} · ${shortDate(bet.match.date)} · Série A</small></div>
      <div class="bet-pick"><span>Palpite: <b>${bet.guessHome ?? "–"} × ${bet.guessAway ?? "–"}</b></span><small>Artilheiros: ${esc((bet.scorers || []).join(", ") || "—")}</small></div>
      <div class="bet-odd"><small>Pontos</small><strong>${points === null || points === undefined ? "—" : `+${points}`}</strong></div>
      <span class="pending-tag ${tagClass}">${esc(result.label)}</span>
    </article>`;
  }).join("");
}

/* ---------- Administração ---------- */
function getBetStatus(bet) {
  return bet.status || { kind: "pending", label: "EM ABERTO" };
}

async function renderAdmin() {
  if (!isAdmin()) return;
  try {
    const [bets, users] = await Promise.all([api("GET", "/api/admin/bets"), api("GET", "/api/admin/users")]);
    adminBets = bets.bets;
    adminUsers = users.users;
  } catch (err) {
    showToast(err.message, "error");
  }
  const today = localDateISO();
  $("#admin-welcome-name").textContent = currentUser.name;
  animateNumber($("#admin-today-games"), matches.filter((game) => game.date === today).length);
  animateNumber($("#admin-total-bets"), adminBets.length);
  animateNumber($("#admin-open-bets"), adminBets.filter((bet) => ["pending", "waiting"].includes(bet.status.kind)).length);
  animateNumber($("#admin-finished-games"), matches.filter((game) => gameStatus(game) === "Resultado completo").length);
  $("#admin-users-total").textContent = adminUsers.length;
  $("#admin-shortcut-games").textContent = matches.length;
  $("#admin-shortcut-bets").textContent = adminBets.length;
  $("#admin-shortcut-users").textContent = adminUsers.length;
  renderAdminGames();
  renderAdminBets();
  renderAdminUsers();
}

function renderAdminGames() {
  const search = $("#admin-game-search").value.trim().toLocaleLowerCase("pt-BR");
  const filter = $("#admin-game-filter").value;
  if (!matches.length) {
    $("#admin-game-count").textContent = "0 partidas";
    $("#admin-game-list").innerHTML = `<div class="admin-empty"><span aria-hidden="true">▦</span><strong>Nenhum jogo cadastrado</strong><p>Adicione uma partida para começar. Ela nasce oculta, pronta para você escolher os times e liberar no site.</p></div>`;
    return;
  }
  const ordered = [...matches].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  const filtered = ordered.filter((game) => {
    const status = gameStatus(game) === "Resultado completo" ? "finished" : game.winnerId ? "partial" : "scheduled";
    const text = `${game.home.name} ${game.away.name} ${game.label} ${game.date} ${shortDate(game.date)}`.toLocaleLowerCase("pt-BR");
    const matchesSearch = !search || text.includes(search);
    const matchesFilter = filter === "all" || (filter === "hidden" ? !game.onSite : status === filter);
    return matchesSearch && matchesFilter;
  });
  $("#admin-game-count").textContent = filtered.length === ordered.length
    ? plural(filtered.length, "partida", "partidas")
    : `${filtered.length} de ${ordered.length} partidas`;
  if (!filtered.length) {
    $("#admin-game-list").innerHTML = `<div class="admin-empty"><span aria-hidden="true">◷</span><strong>Nenhum jogo encontrado</strong><p>Ajuste a busca ou o filtro de situação para ver outras partidas.</p></div>`;
    return;
  }
  $("#admin-game-list").innerHTML = filtered.map((game) => {
    const hasBets = adminBets.some((bet) => bet.matchId === game.id);
    const status = gameStatus(game);
    const statusKind = status === "Resultado completo" ? "finished" : game.winnerId ? "partial" : "scheduled";
    const live = game.liveStatus === "live" ? `<span class="admin-live-chip"><i aria-hidden="true"></i>AO VIVO ${game.liveMinute ?? ""}'</span>` : "";
    const teamOptions = (selectedId) => TEAMS.map((team) => `<option value="${team.id}" ${team.id === selectedId ? "selected" : ""}>${esc(team.name)}</option>`).join("");
    const winnerOptions = `<option value="">Não definido</option><option value="draw" ${game.winnerId === "draw" ? "selected" : ""}>Empate</option><option value="${game.homeId}" ${game.winnerId === game.homeId ? "selected" : ""}>${esc(game.home.name)}</option><option value="${game.awayId}" ${game.winnerId === game.awayId ? "selected" : ""}>${esc(game.away.name)}</option>`;
    const isOpen = adminOpenCards.has(game.id);
    return `
      <article class="admin-game-card ${isOpen ? "open" : ""}" id="admin-game-${esc(game.id)}" data-game-card="${esc(game.id)}">
        <div class="admin-game-card-head">
          <div class="admin-game-matchup">${teamBadge(game.home)}<strong>${esc(game.home.name)}</strong><span class="admin-vs">x</span>${teamBadge(game.away)}<strong>${esc(game.away.name)}</strong></div>
          <div class="admin-game-head-meta">${live}<span class="admin-status-chip status-${statusKind}">${esc(status)}</span>${game.onSite ? "" : '<span class="admin-status-chip status-scheduled">Oculto</span>'}<span>${shortDate(game.date)} · ${esc(game.time)}</span></div>
          <div class="admin-head-actions">
            <label class="admin-toggle" title="Exibir no site (jogo do dia)">
              <input type="checkbox" data-site-toggle="${esc(game.id)}" ${game.onSite ? "checked" : ""} />
              <span class="track" aria-hidden="true"></span>
              <span class="toggle-label">${game.onSite ? "No site" : "Oculto"}</span>
            </label>
            <button class="admin-icon-btn" type="button" data-card-toggle="${esc(game.id)}" aria-expanded="${isOpen}" aria-label="Editar partida" title="Editar partida"><span aria-hidden="true">✎</span></button>
            ${hasBets ? "" : `<button class="admin-icon-btn danger" type="button" data-card-delete="${esc(game.id)}" aria-label="Excluir partida" title="Excluir partida"><span aria-hidden="true">🗑</span></button>`}
          </div>
        </div>
        <div class="admin-game-formwrap">
          <form class="admin-game-form" data-admin-game-form data-game-id="${esc(game.id)}">
            <div class="admin-form-grid">
              <label class="admin-field"><span>Mandante</span><select name="homeId" ${hasBets ? "disabled" : ""}>${teamOptions(game.homeId)}</select></label>
              <label class="admin-field"><span>Visitante</span><select name="awayId" ${hasBets ? "disabled" : ""}>${teamOptions(game.awayId)}</select></label>
              <label class="admin-field"><span>Data</span><input name="date" type="date" value="${esc(game.date)}" required /></label>
              <label class="admin-field"><span>Horário</span><input name="time" type="time" value="${esc(game.time)}" required /></label>
              <label class="admin-field"><span>Vencedor</span><select name="winnerId">${winnerOptions}</select></label>
              <fieldset class="admin-field admin-score-field"><legend>Placar final</legend><div class="admin-score-inputs"><label><span class="sr-only">Gols de ${esc(game.home.name)}</span><input name="homeGoals" type="number" min="0" max="30" step="1" value="${game.homeGoals === null ? "" : game.homeGoals}" placeholder="0" /></label><span>×</span><label><span class="sr-only">Gols de ${esc(game.away.name)}</span><input name="awayGoals" type="number" min="0" max="30" step="1" value="${game.awayGoals === null ? "" : game.awayGoals}" placeholder="0" /></label></div></fieldset>
              <label class="admin-field admin-field-wide"><span>Marcadores — ${esc(game.home.name)}</span><input name="scorersHome" type="text" maxlength="240" value="${esc(game.scorersHome.join(", "))}" placeholder="Separe os nomes por vírgula" /></label>
              <label class="admin-field admin-field-wide"><span>Marcadores — ${esc(game.away.name)}</span><input name="scorersAway" type="text" maxlength="240" value="${esc(game.scorersAway.join(", "))}" placeholder="Separe os nomes por vírgula" /></label>
            </div>
            <div class="admin-game-actions">
              <span class="admin-game-actions-hint">${hasBets ? "🔒 Os times ficam bloqueados após o primeiro palpite desta partida." : "Ao informar o placar, o vencedor é conferido automaticamente."}</span>
              <button class="admin-save-button" type="submit">Salvar partida <span aria-hidden="true">→</span></button>
            </div>
          </form>
        </div>
      </article>`;
  }).join("");
}

function renderAdminBets() {
  const filter = $("#admin-bet-filter");
  const previous = filter.value;
  filter.innerHTML = `<option value="">Todas as partidas</option>` + matches.map((game) => `<option value="${esc(game.id)}">${esc(game.home.name)} x ${esc(game.away.name)}</option>`).join("");
  filter.value = matches.some((game) => game.id === previous) ? previous : "";
  const search = $("#admin-bet-search").value.trim().toLocaleLowerCase("pt-BR");
  const bets = adminBets.filter((bet) => {
    const okMatch = !filter.value || bet.matchId === filter.value;
    const haystack = `${bet.user?.name || ""} ${bet.user?.email || ""} ${(bet.scorers || []).join(" ")} ${bet.match?.home?.name || ""} ${bet.match?.away?.name || ""}`.toLocaleLowerCase("pt-BR");
    return okMatch && (!search || haystack.includes(search));
  });
  $("#admin-bets-empty").hidden = bets.length > 0;
  if (!bets.length) {
    $("#admin-bets-table").innerHTML = "";
    return;
  }
  $("#admin-bets-table").innerHTML = bets.map((bet, i) => {
    const sent = bet.createdAt ? new Date(bet.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "";
    const initial = (bet.user?.name || "V").charAt(0).toUpperCase();
    return `<tr style="animation-delay:${Math.min(i, 12) * 30}ms">
      <td><strong class="admin-participant-name"><span class="mini-avatar" aria-hidden="true">${esc(initial)}</span>${esc(bet.user?.name || "Visitante")}</strong><small>${esc(bet.user?.email || "Sem e-mail cadastrado")}${sent ? ` · ${esc(sent)}` : ""}</small></td>
      <td><strong>${esc(bet.match.home.name)} x ${esc(bet.match.away.name)}</strong><small>${esc(bet.match.label)} · ${shortDate(bet.match.date)}</small></td>
      <td><strong>${bet.guessHome ?? "–"} × ${bet.guessAway ?? "–"}</strong><small>Artilheiros: ${esc((bet.scorers || []).join(", ") || "—")}</small></td>
      <td><strong class="admin-odd-value">${bet.points === null || bet.points === undefined ? "—" : `+${bet.points}`}</strong></td>
      <td><span class="admin-bet-status status-bet-${esc(bet.status.kind)}">${esc(bet.status.label)}</span><small>${esc(bet.resultText)}</small></td>
    </tr>`;
  }).join("");
}

function renderAdminUsers() {
  const search = $("#admin-user-search").value.trim().toLocaleLowerCase("pt-BR");
  const users = adminUsers.filter((user) => {
    const haystack = `${user.name} ${user.email}`.toLocaleLowerCase("pt-BR");
    return !search || haystack.includes(search);
  });
  $("#admin-users-table").innerHTML = users.map((user, i) => {
    const sent = new Date(user.createdAt).toLocaleDateString("pt-BR");
    const initial = (user.name || "?").charAt(0).toUpperCase();
    return `<tr style="animation-delay:${Math.min(i, 12) * 30}ms">
      <td><strong class="admin-participant-name"><span class="mini-avatar" aria-hidden="true">${esc(initial)}</span>${esc(user.name)}${user.role === "admin" ? ' <span class="admin-role-tag">ADMIN</span>' : ""}</strong></td>
      <td><small>${esc(user.email)}</small></td>
      <td><small>${esc(sent)}</small></td>
      <td><strong>${user.betCount}</strong></td>
    </tr>`;
  }).join("");
}

async function saveAdminGame(form, successMessage = "Partida atualizada.") {
  const game = matches.find((item) => item.id === form.dataset.gameId);
  if (!game) return;
  const button = form.querySelector(".admin-save-button");
  if (button) button.classList.add("loading");
  const numberOrNull = (value) => (value === "" ? null : Number(value));
  const payload = {
    homeId: form.elements.homeId.value,
    awayId: form.elements.awayId.value,
    date: form.elements.date.value,
    time: form.elements.time.value,
    winnerId: form.elements.winnerId.value,
    homeGoals: numberOrNull(form.elements.homeGoals.value),
    awayGoals: numberOrNull(form.elements.awayGoals.value),
    onSite: game.onSite,
    scorersHome: form.elements.scorersHome.value,
    scorersAway: form.elements.scorersAway.value
  };
  try {
    const { game: saved } = await api("PUT", `/api/admin/games/${encodeURIComponent(game.id)}`, payload);
    const index = matches.findIndex((item) => item.id === game.id);
    matches[index] = normalizeGame(saved, index);
    jogosRendered = false;
    adminOpenCards.add(game.id);
    await renderAdmin();
    if (currentRoute() === "jogos") renderJogos();
    if (currentRoute() === "palpite") renderPalpite();
    showToast(successMessage, "success");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (button) button.classList.remove("loading");
  }
}

async function addAdminGame() {
  try {
    const { game } = await api("POST", "/api/admin/games", {});
    matches.push(normalizeGame(game, matches.length));
    jogosRendered = false;
    adminOpenCards.add(game.id);
    showToast("Jogo criado oculto. Use a chave \"No site\" para publicá-lo.", "info");
    await renderAdmin();
    document.getElementById("admin-game-" + game.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteAdminGame(gameId) {
  const game = matches.find((item) => item.id === gameId);
  if (!game) return;
  const ok = await askConfirm({
    title: "Excluir partida?",
    text: `${game.home.name} x ${game.away.name} será removida definitivamente. Esta ação não pode ser desfeita.`,
    okLabel: "Excluir partida"
  });
  if (!ok) return;
  try {
    await api("DELETE", `/api/admin/games/${encodeURIComponent(gameId)}`);
    matches = matches.filter((item) => item.id !== gameId);
    jogosRendered = false;
    showToast("Partida excluída.", "success");
    await renderAdmin();
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function toggleGameOnSite(gameId, onSite) {
  const game = matches.find((item) => item.id === gameId);
  try {
    const { game: saved } = await api("PATCH", `/api/admin/games/${encodeURIComponent(gameId)}/site`, { onSite });
    const index = matches.findIndex((item) => item.id === gameId);
    if (index >= 0) matches[index] = normalizeGame(saved, index);
    jogosRendered = false;
    showToast(onSite ? "Jogo exibido no site." : "Jogo ocultado do site.", "success");
    if (currentRoute() === "admin") renderAdminGames();
  } catch (err) {
    if (game) {
      const box = document.querySelector(`[data-site-toggle="${gameId}"]`);
      if (box) box.checked = !onSite;
      const card = document.getElementById("admin-game-" + gameId);
      const label = card?.querySelector(".toggle-label");
      if (label) label.textContent = game.onSite ? "No site" : "Oculto";
    }
    showToast(err.message, "error");
  }
}

/* ---------- Exportação CSV (admin) ---------- */
function downloadCsv(filename, rows) {
  const csv = "\uFEFF" + rows.map((row) => row.map((cell) => {
    const value = String(cell ?? "").replace(/"/g, '""');
    return /[";\n]/.test(value) ? `"${value}"` : value;
  }).join(";")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function exportBetsCsv() {
  if (!adminBets.length) return showToast("Nenhum palpite para exportar.", "info");
  const rows = [["Participante", "E-mail", "Partida", "Data", "Placar palpitado", "Artilheiros", "Pontos", "Status", "Enviado em"]];
  adminBets.forEach((bet) => rows.push([
    bet.user?.name || "Visitante", bet.user?.email || "", `${bet.match?.home?.name} x ${bet.match?.away?.name}`,
    bet.match?.date || "", `${bet.guessHome ?? "–"} x ${bet.guessAway ?? "–"}`, (bet.scorers || []).join(", "),
    bet.points ?? "", bet.status.label, bet.createdAt || ""
  ]));
  downloadCsv(`palpites-${localDateISO()}.csv`, rows);
  showToast("CSV de palpites baixado.", "success");
}

function exportUsersCsv() {
  if (!adminUsers.length) return showToast("Nenhum usuário para exportar.", "info");
  const rows = [["Nome", "E-mail", "Tipo", "Cadastro", "Palpites"]];
  adminUsers.forEach((user) => rows.push([user.name, user.email, user.role === "admin" ? "Administrador" : "Jogador", user.createdAt, user.betCount]));
  downloadCsv(`usuarios-${localDateISO()}.csv`, rows);
  showToast("CSV de usuários baixado.", "success");
}

/* ---------- Diálogo de confirmação ---------- */
let confirmResolve = null;
function askConfirm({ title = "Confirmar ação", text = "", okLabel = "Confirmar" }) {
  $("#confirm-title").textContent = title;
  $("#confirm-text").textContent = text;
  $("#confirm-ok").textContent = okLabel;
  const dialog = $("#confirm-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  return new Promise((resolve) => { confirmResolve = resolve; });
}
function settleConfirm(value) {
  const dialog = $("#confirm-dialog");
  if (typeof dialog.close === "function" && dialog.open) dialog.close(); else dialog.removeAttribute("open");
  if (confirmResolve) { confirmResolve(value); confirmResolve = null; }
}

/* ---------- Celebração ao fazer palpite ---------- */
function celebrate() {
  const overlay = $("#success");
  const burst = $("#confetti");
  const colors = ["#d7fa72", "#7fd6a4", "#ef8556", "#ffffff", "#4a8a62"];
  burst.innerHTML = Array.from({ length: 42 }, (_, i) => {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.25;
    const dur = 1.1 + Math.random() * 0.7;
    const rot = Math.random() * 360;
    const size = 7 + Math.random() * 6;
    return `<i style="left:${left}%;width:${size}px;height:${size * 1.4}px;animation-delay:${delay}s;animation-duration:${dur}s;background:${colors[i % colors.length]};transform:rotate(${rot}deg)"></i>`;
  }).join("");
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("show"));
}

function hideCelebration() {
  const overlay = $("#success");
  overlay.classList.remove("show");
  setTimeout(() => { overlay.hidden = true; }, 350);
}

/* ---------- Revelar ao rolar ---------- */
let revealObserver = null;
function setupReveal() {
  if (reducedMotion() || !("IntersectionObserver" in window)) return;
  const targets = $$(".admin-panel, .steps .step, .stat-card");
  if (!targets.length) return;
  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("in-view");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.08 });
  }
  targets.forEach((el) => {
    if (!el.classList.contains("in-view")) {
      el.classList.add("reveal");
      revealObserver.observe(el);
    }
  });
}

/* ---------- Tema claro / escuro ---------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const isDark = theme === "dark";
  const toggle = $("#theme-toggle");
  toggle.setAttribute("aria-label", isDark ? "Ativar tema claro" : "Ativar tema escuro");
  toggle.title = isDark ? "Tema claro" : "Tema escuro";
  $("meta[name='theme-color']").setAttribute("content", isDark ? "#0a1410" : "#14251f");
}

function toggleTheme(event) {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  storage.set(THEME_KEY, next);
  event.currentTarget.classList.remove("spin");
  void event.currentTarget.offsetWidth;
  event.currentTarget.classList.add("spin");
}

/* ---------- Conta: UX de entrar / criar conta ---------- */
function passwordScore(password) {
  if (!password) return 0;
  let score = 0;
  if (password.length >= 6) score = 1;
  if (password.length >= 10) score += 1;
  if (/[A-Za-z]/.test(password) && /\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password) || (/[a-z]/.test(password) && /[A-Z]/.test(password))) score += 1;
  if (password.length < 6) score = Math.min(score, 1);
  return Math.min(4, score);
}
const STRENGTH_LABELS = ["", "Fraca", "Razoável", "Boa", "Forte"];

function renderPasswordStrength() {
  const password = $("#signup-password").value;
  const meter = $("#pwd-meter");
  if (!password) { meter.hidden = true; return; }
  meter.hidden = false;
  meter.dataset.score = String(passwordScore(password));
  $("#pwd-meter-label").textContent = STRENGTH_LABELS[meter.dataset.score] || "";
}

function renderEmailCheck() {
  const email = $("#signup-email").value.trim();
  const check = $("#email-check");
  if (!email) { check.dataset.state = ""; check.textContent = ""; return; }
  if (EMAIL_RE.test(email)) { check.dataset.state = "ok"; check.textContent = "✓"; }
  else { check.dataset.state = "bad"; check.textContent = "✗"; }
}

function updateCapsHint(event) {
  const caps = event.getModifierState && event.getModifierState("CapsLock");
  $("#caps-hint").hidden = !caps;
}

function renderFavoriteTeamGate(filterText = "") {
  const query = filterText.trim().toLocaleLowerCase("pt-BR");
  const list = TEAMS.filter((team) => !query || team.name.toLocaleLowerCase("pt-BR").includes(query));
  $("#favorite-team-grid").innerHTML = list.length ? list.map((team) => `
    <button class="favorite-team-option ${state.gateTeamChoice === team.id ? "selected" : ""}" type="button" data-favorite-team="${team.id}" aria-pressed="${state.gateTeamChoice === team.id}">
      <img src="assets/${team.logo}" alt="" loading="lazy" /><span>${esc(team.name)}</span>
    </button>`).join("") : `<p class="player-options-empty" style="grid-column:1/-1">Nenhum clube encontrado para “${esc(filterText)}”.</p>`;
  $("#favorite-team-confirm").disabled = !state.gateTeamChoice;
  $("#favorite-team-error").textContent = "";
}

function openFavoriteTeamGate() {
  if (state.favoriteTeamId) return;
  state.gateTeamChoice = teamById[storage.get(FAVORITE_TEAM_KEY)] ? storage.get(FAVORITE_TEAM_KEY) : null;
  $("#favorite-team-search").value = "";
  renderFavoriteTeamGate();
  const dialog = $("#favorite-team-dialog");
  if (!dialog.open && typeof dialog.showModal === "function") dialog.showModal();
  else if (!dialog.open) dialog.setAttribute("open", "");
}

async function confirmFavoriteTeam() {
  const teamId = state.gateTeamChoice;
  if (!teamById[teamId]) return;
  const button = $("#favorite-team-confirm");
  button.disabled = true;
  button.classList.add("loading");
  try {
    if (currentUser) {
      const { user } = await api("PUT", "/api/me/team", { teamId });
      currentUser = user;
      state.favoriteTeamId = user.favoriteTeamId;
    } else {
      state.favoriteTeamId = teamId;
    }
    if (!isAdmin()) matches = matches.filter((game) => game.homeId === state.favoriteTeamId || game.awayId === state.favoriteTeamId);
    storage.set(FAVORITE_TEAM_KEY, state.favoriteTeamId);
    await loadGames();
    jogosRendered = false;
    renderProfile();
    const dialog = $("#favorite-team-dialog");
    if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
    renderRoute();
    showToast(`Você torce para ${teamById[teamId].name}. Bons palpites!`, "success");
  } catch (err) {
    $("#favorite-team-error").textContent = err.message;
    button.disabled = false;
  } finally {
    button.classList.remove("loading");
  }
}

function renderProfile() {
  const name = currentUser ? currentUser.name : "Jogador";
  const initial = name.charAt(0).toUpperCase();
  $("#profile-name").textContent = name;
  $("#profile-sub").textContent = state.favoriteTeamId ? `Torcedor do ${teamById[state.favoriteTeamId].name}` : currentUser ? currentUser.email : "Torcedor iniciante";
  $("#profile-avatar").textContent = initial;
  $("#account-button").setAttribute("aria-label", currentUser ? `Conta de ${name}` : "Criar conta ou entrar");
  $("#account-button").title = currentUser ? "Minha conta" : "Criar conta";
}

function renderAccountDialog() {
  const loggedIn = Boolean(currentUser);
  $("#account-title").textContent = loggedIn ? "Minha conta" : authMode === "signup" ? "Criar conta" : "Entrar";
  $("#signup-form").hidden = loggedIn;
  $("#account-summary").hidden = !loggedIn;
  if (loggedIn) {
    $("#account-summary-avatar").textContent = currentUser.name.charAt(0).toUpperCase();
    $("#account-summary-name").textContent = currentUser.name;
    $("#account-summary-email").textContent = currentUser.email;
    $("#account-summary-team").textContent = state.favoriteTeamId ? `Time fixo: ${teamById[state.favoriteTeamId].name}` : "Time fixo ainda não escolhido";
    $("#account-summary-role").hidden = !isAdmin();
  }
}

function openAccount(message = "") {
  setAuthMode(authMode);
  renderAccountDialog();
  if (message) $("#signup-error").textContent = message;
  const dialog = $("#account-dialog");
  if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
  (currentUser ? $("#logout-button") : (authMode === "signup" ? $("#signup-name") : $("#signup-email"))).focus();
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === "signup";
  $(".auth-tabs").dataset.mode = mode;
  if (!currentUser) $("#account-title").textContent = isSignup ? "Criar conta" : "Entrar";
  $("#signup-name-field").hidden = !isSignup;
  $("#signup-name").required = isSignup;
  $("#signup-password").autocomplete = isSignup ? "new-password" : "current-password";
  $("#auth-submit .btn-label").textContent = isSignup ? "Criar conta" : "Entrar";
  $$(".auth-tab").forEach((tab) => {
    const on = tab.dataset.auth === mode;
    tab.classList.toggle("active", on);
    tab.setAttribute("aria-selected", String(on));
  });
  $("#pwd-meter").hidden = true;
  $("#caps-hint").hidden = true;
  $("#signup-error").textContent = "";
}

function closeAccount() {
  const dialog = $("#account-dialog");
  if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
}

async function handleAuth(event) {
  event.preventDefault();
  const name = $("#signup-name").value.trim();
  const email = $("#signup-email").value.trim();
  const password = $("#signup-password").value;
  const button = $("#auth-submit");
  const errorBox = $("#signup-error");
  errorBox.textContent = "";

  if (authMode === "signup" && !name) { errorBox.textContent = "Informe seu nome."; return; }
  if (!EMAIL_RE.test(email)) { errorBox.textContent = "Informe um e-mail válido."; return; }
  if (password.length < 6) { errorBox.textContent = "A senha precisa ter pelo menos 6 caracteres."; return; }

  button.disabled = true;
  button.classList.add("loading");
  try {
    const isSignup = authMode === "signup";
    const { user } = isSignup
      ? await api("POST", "/api/signup", { name, email, password, favoriteTeamId: state.favoriteTeamId })
      : await api("POST", "/api/login", { email, password });
    currentUser = user;
    await syncFavoriteTeam();
    await loadMyBets();
    await refreshGames();
    applyRoles();
    renderProfile();
    event.target.reset();
    $("#pwd-meter").hidden = true;
    renderEmailCheck();
    closeAccount();
    if (!state.favoriteTeamId) openFavoriteTeamGate();
    showToast(isSignup ? `Conta criada! Bem-vindo, ${user.name}.` : `Bem-vindo de volta, ${user.name}.`, "success");
    if (currentRoute() === "meus-palpites") renderBets();
    renderCounts();
  } catch (err) {
    errorBox.textContent = err.message;
  } finally {
    button.disabled = false;
    button.classList.remove("loading");
  }
}

async function handleLogout() {
  api("POST", "/api/logout").catch(() => {});
  currentUser = null;
  state.bets = [];
  await refreshGames();
  applyRoles();
  renderProfile();
  renderAccountDialog();
  closeAccount();
  if (currentRoute() === "admin") navigate("inicio");
  if (currentRoute() === "meus-palpites") renderBets();
  renderCounts();
  showToast("Você saiu da conta.", "info");
}

/* ---------- Toast ---------- */
let toastTimer;
function showToast(message, type = "success") {
  const toast = $("#toast");
  const icons = { success: "✓", error: "!", info: "i" };
  $("#toast-msg").textContent = message;
  $("#toast-icon").textContent = icons[type] || "✓";
  toast.className = `toast visible ${type}`;
  toast.style.setProperty("--toast-dur", "2.8s");
  void toast.offsetWidth; // reinicia a barra de progresso
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 2800);
}

/* ==========================================================
   EVENTOS
   ========================================================== */

// Cliques delegados: funcionam mesmo com elementos re-renderizados
document.addEventListener("click", (event) => {
  const el = event.target.closest("[data-go],[data-match],[data-club],[data-score-step],[data-scorer],[data-favorite-team],[data-card-toggle],[data-card-delete]");
  if (!el) return;

  if (el.dataset.favoriteTeam) {
    state.gateTeamChoice = el.dataset.favoriteTeam;
    renderFavoriteTeamGate($("#favorite-team-search").value);
    return;
  }

  if (el.dataset.go) return navigate(el.dataset.go);

  if (el.dataset.match) {
    selectMatch(el.dataset.match);
    return navigate("palpite");
  }
  if (el.dataset.club) {
    const match = matches.find((m) => m.homeId === el.dataset.club || m.awayId === el.dataset.club);
    if (!match) return showToast("Este time ainda não está em um confronto cadastrado.", "info");
    if (match.winnerId) return showToast("Os palpites desta partida já foram encerrados.", "error");
    selectMatch(match.id);
    return navigate("palpite");
  }
  if (el.dataset.scoreStep) {
    const match = selectedMatch();
    if (!match || !bettingOpen(match)) return;
    const [side, dir] = el.dataset.scoreStep.split(":");
    const current = side === "home" ? state.guessHome : state.guessAway;
    let next;
    if (dir === "1") next = current === null ? 0 : Math.min(SCORE_MAX, current + 1);
    else next = current === null || current === 0 ? null : current - 1;
    if (side === "home") state.guessHome = next; else state.guessAway = next;
    renderScorePicker();
    return updateSummary();
  }
  if (el.dataset.scorer) {
    const match = selectedMatch();
    if (!match || !bettingOpen(match)) return;
    const name = el.dataset.scorer;
    const index = state.scorers.indexOf(name);
    if (index >= 0) state.scorers.splice(index, 1);
    else if (state.scorers.length < MAX_SCORERS) state.scorers.push(name);
    renderScorerPicker();
    return updateSummary();
  }
  if (el.dataset.cardToggle) {
    const id = el.dataset.cardToggle;
    const card = document.getElementById("admin-game-" + id);
    if (!card) return;
    const open = !card.classList.contains("open");
    card.classList.toggle("open", open);
    el.setAttribute("aria-expanded", String(open));
    if (open) adminOpenCards.add(id); else adminOpenCards.delete(id);
    return;
  }
  if (el.dataset.cardDelete) return deleteAdminGame(el.dataset.cardDelete);
});

// Digitação: placar (dois lados) e busca de artilheiros
function scoreInputSide(target) {
  if (target.id === "score-home") return "home";
  if (target.id === "score-away") return "away";
  return null;
}

document.addEventListener("input", (event) => {
  const side = scoreInputSide(event.target);
  if (side) {
    const raw = String(event.target.value).trim();
    const n = raw === "" ? null : Number(raw);
    const valid = n !== null && Number.isInteger(n) && n >= 0 && n <= SCORE_MAX ? n : null;
    if (side === "home") state.guessHome = valid; else state.guessAway = valid;
    event.target.classList.toggle("invalid", valid === null && raw !== "");
    return updateSummary();
  }
  if (event.target.id === "scorer-search") return renderScorerPicker();
});

document.addEventListener("change", (event) => {
  const side = scoreInputSide(event.target);
  if (side) {
    // Ao sair do campo, ajusta o valor digitado para um placar válido
    const raw = String(event.target.value).trim();
    let n = Number(raw);
    if (raw === "" || Number.isNaN(n)) n = null;
    else n = Math.max(0, Math.min(SCORE_MAX, Math.round(n)));
    if (side === "home") state.guessHome = n; else state.guessAway = n;
    renderScorePicker();
    return updateSummary();
  }
  if (event.target.matches && event.target.matches("[data-site-toggle]")) {
    const card = event.target.closest("[data-game-card]");
    const label = card?.querySelector(".toggle-label");
    if (label) label.textContent = event.target.checked ? "No site" : "Oculto";
    return toggleGameOnSite(event.target.dataset.siteToggle, event.target.checked);
  }
});
$("#submit-bet").addEventListener("click", placeBet);
$("#all-matches").addEventListener("click", () => $("#match-list").scrollIntoView({ behavior: "smooth", block: "center" }));
$("#theme-toggle").addEventListener("click", toggleTheme);
$("#account-button").addEventListener("click", () => openAccount());
$("#profile-more").addEventListener("click", () => openAccount());
$("#signup-form").addEventListener("submit", handleAuth);
$$(".auth-tab").forEach((tab) => tab.addEventListener("click", () => setAuthMode(tab.dataset.auth)));
$("#logout-button").addEventListener("click", handleLogout);
$("#favorite-team-confirm").addEventListener("click", confirmFavoriteTeam);
$("#favorite-team-dialog").addEventListener("cancel", (event) => event.preventDefault());
$("#favorite-team-search").addEventListener("input", (event) => renderFavoriteTeamGate(event.target.value));
$$("[data-close]").forEach((button) => button.addEventListener("click", closeAccount));
$("#account-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) closeAccount(); });

// Senha: mostrar/ocultar, medidor de força e Caps Lock
$("#pwd-toggle").addEventListener("click", () => {
  const input = $("#signup-password");
  const toggle = $("#pwd-toggle");
  const show = input.type === "password";
  input.type = show ? "text" : "password";
  toggle.classList.toggle("showing", show);
  toggle.setAttribute("aria-pressed", String(show));
  toggle.setAttribute("aria-label", show ? "Ocultar senha" : "Mostrar senha");
  input.focus();
});
$("#signup-password").addEventListener("input", renderPasswordStrength);
$("#signup-password").addEventListener("keydown", updateCapsHint);
$("#signup-password").addEventListener("keyup", updateCapsHint);
$("#signup-password").addEventListener("blur", () => { $("#caps-hint").hidden = true; });
$("#signup-email").addEventListener("input", renderEmailCheck);

// Admin
$("#admin-add-game").addEventListener("click", addAdminGame);
$("#admin-game-search").addEventListener("input", renderAdminGames);
$("#admin-game-filter").addEventListener("change", renderAdminGames);
$("#admin-bet-search").addEventListener("input", renderAdminBets);
$("#admin-user-search").addEventListener("input", renderAdminUsers);
$("#admin-export-bets").addEventListener("click", exportBetsCsv);
$("#admin-export-users").addEventListener("click", exportUsersCsv);
$(".admin-quick-links").addEventListener("click", (event) => {
  const button = event.target.closest("[data-admin-scroll]");
  if (!button) return;
  document.getElementById(button.dataset.adminScroll)?.scrollIntoView({ behavior: "smooth", block: "start" });
});

// Interruptor "No site" (PATCH direto, sem reenviar a partida) — tratado no delegation de "change" acima

$("#admin-bet-filter").addEventListener("change", renderAdminBets);
document.addEventListener("submit", (event) => {
  if (!event.target.matches("[data-admin-game-form]")) return;
  event.preventDefault();
  saveAdminGame(event.target);
});

// Diálogo de confirmação
$("#confirm-ok").addEventListener("click", () => settleConfirm(true));
$("#confirm-cancel").addEventListener("click", () => settleConfirm(false));
$("#confirm-dialog").addEventListener("cancel", (event) => { event.preventDefault(); settleConfirm(false); });
$("#confirm-dialog").addEventListener("click", (event) => { if (event.target === event.currentTarget) settleConfirm(false); });

/* ==========================================================
   INICIALIZAÇÃO
   ========================================================== */
applyTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
renderJogosSkeleton();

window.addEventListener("hashchange", () => {
  if (document.startViewTransition && !reducedMotion()) document.startViewTransition(renderRoute);
  else renderRoute();
});

function startAutoRefresh() {
  setInterval(() => { if (!document.hidden) refreshGames(); }, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshGames(); });
}

async function boot() {
  try {
    await loadSession();
  } catch (err) {
    showToast(err.message, "error");
  }
  try { await syncFavoriteTeam(); } catch (err) { showToast(err.message, "error"); }
  try { await loadGames(); } catch (err) { showToast(err.message, "error"); }
  try { await loadMyBets(); } catch (err) { showToast(err.message, "error"); }
  if (!state.favoriteTeamId) openFavoriteTeamGate();
  applyRoles();
  renderProfile();
  renderRoute();
  startAutoRefresh();
}
boot();
