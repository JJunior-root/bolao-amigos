'use strict';
const crypto = require('crypto');
const { db, TEAMS, localDateISO } = require('./db');
const { POINTS, MAX_SCORERS, SCORE_MAX, BET_CUTOFF_HOURS } = require('../js/data.js');
const sec = require('./security');
const { computeRanking } = require('./ranking');
const live = require('./live');

const SESSION_DAYS = 30;
const COOKIE = 'aq_session';
const TEAM_BY_ID = Object.fromEntries(TEAMS.map((t) => [t.id, t]));
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

/* ---------- DTOs (formato que o front-end espera) ---------- */
function teamOf(id) {
  const t = TEAM_BY_ID[id];
  return t ? { id: t.id, name: t.name, logo: t.logo } : { id, name: id, logo: '' };
}

function gameDto(row) {
  const kickoff = new Date(`${row.game_date}T${row.game_time}:00-03:00`);
  const bettingClosesAt = new Date(kickoff.getTime() - BET_CUTOFF_HOURS * 60 * 60 * 1000);
  return {
    id: row.id,
    label: row.label,
    homeId: row.home_id,
    awayId: row.away_id,
    home: teamOf(row.home_id),
    away: teamOf(row.away_id),
    date: row.game_date,
    time: row.game_time,
    bettingClosesAt: bettingClosesAt.toISOString(),
    winnerId: row.winner_id,
    homeGoals: row.home_goals,
    awayGoals: row.away_goals,
    scorersHome: JSON.parse(row.scorers_home),
    scorersAway: JSON.parse(row.scorers_away),
    onSite: Boolean(row.on_site),
    liveStatus: row.live_status || '',
    liveMinute: row.live_minute ?? null,
    liveHome: row.live_home ?? null,
    liveAway: row.live_away ?? null
  };
}

function winnerName(game) {
  if (game.winnerId === 'draw') return 'Empate';
  if (game.winnerId === game.homeId) return game.home.name;
  if (game.winnerId === game.awayId) return game.away.name;
  return 'Não definido';
}

const normName = (v) => String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');

// Pontos que o palpite rendeu (0 enquanto o jogo não é julgado).
function betPoints(bet, game) {
  const guessHome = Number(bet.guessHome);
  const guessAway = Number(bet.guessAway);
  if (!Number.isInteger(guessHome) || !Number.isInteger(guessAway)) return null;
  const exactHit = guessHome === game.homeGoals && guessAway === game.awayGoals;
  const outcomeHit = !exactHit && Math.sign(guessHome - guessAway) === Math.sign(game.homeGoals - game.awayGoals);
  const picked = Array.isArray(bet.scorers) ? bet.scorers : [];
  const allScorers = [...game.scorersHome, ...game.scorersAway];
  const scorerHits = picked.filter((name) => allScorers.some((actual) => normName(actual) === normName(name))).length;
  return { base: exactHit ? POINTS.exact : outcomeHit ? POINTS.outcome : 0, exactHit, outcomeHit, scorerHits,
    total: (exactHit ? POINTS.exact : outcomeHit ? POINTS.outcome : 0) + scorerHits * POINTS.scorer };
}

// Mesmas regras de acerto que o ranking usa
function betStatus(bet, game) {
  if (!game) return { kind: 'pending', label: 'PARTIDA INDISPONÍVEL' };
  if (!game.winnerId) return { kind: 'pending', label: 'EM ABERTO' };
  if (game.homeGoals === null || game.awayGoals === null) return { kind: 'waiting', label: 'AGUARDANDO PLACAR' };
  if (bet.guessHome === null || bet.guessAway === null || bet.guessHome === undefined || bet.guessAway === undefined) {
    return { kind: 'legacy', label: 'PALPITE ANTIGO' };
  }
  // Placar registrado, mas o time que marcou gol ainda sem artilheiros informados
  const anyGoal = game.homeGoals > 0 || game.awayGoals > 0;
  const anyScorer = (game.homeGoals > 0 && game.scorersHome.length > 0) || (game.awayGoals > 0 && game.scorersAway.length > 0);
  if (anyGoal && !anyScorer) return { kind: 'waiting', label: 'AGUARDANDO ARTILHEIROS' };
  const points = betPoints(bet, game);
  if (!points) return { kind: 'legacy', label: 'PALPITE ANTIGO' };
  if (points.exactHit) return { kind: 'exact', label: 'PLACAR EXATO', points };
  if (points.outcomeHit) return { kind: 'outcome', label: 'ACERTOU O RESULTADO', points };
  return { kind: 'lost', label: 'NÃO ACERTOU', points };
}

function resultText(game) {
  if (game.homeGoals !== null && game.awayGoals !== null) {
    return `Resultado: ${winnerName(game)} · ${game.homeGoals} x ${game.awayGoals}`;
  }
  if (game.winnerId) return `Vencedor: ${winnerName(game)}`;
  return 'Resultado ainda não registrado';
}

function betDto(row) {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(row.game_id);
  const g = game ? gameDto(game) : null;
  const bet = {
    guessHome: row.guess_home === undefined ? null : row.guess_home,
    guessAway: row.guess_away === undefined ? null : row.guess_away,
    scorers: safeScorers(row.scorers),
    playerTeamId: row.player_team_id || row.team_id
  };
  const status = betStatus(bet, g);
  return {
    id: row.id,
    matchId: row.game_id,
    guessHome: bet.guessHome,
    guessAway: bet.guessAway,
    scorers: bet.scorers,
    createdAt: row.created_at,
    user: { id: row.user_id, name: row.user_name, email: row.user_email },
    match: g,
    status,
    points: status.points ? status.points.total : null,
    resultText: g ? resultText(g) : ''
  };
}

function safeScorers(value) {
  try {
    const list = JSON.parse(value || '[]');
    return Array.isArray(list) ? list.map(String) : [];
  } catch { return []; }
}

function publicUser(row) {
  return { id: row.id, name: row.name, email: row.email, role: row.role, favoriteTeamId: row.favorite_team_id || null };
}

/* ---------- Sessão ---------- */
function currentUser(req) {
  const token = sec.parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const row = db.prepare(`
    SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).get(sec.hashToken(token), new Date().toISOString());
  return row || null;
}

function startSession(userId) {
  const token = sec.newSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(sec.hashToken(token), userId, expires);
  const secure = process.env.COOKIE_SECURE === '1' ? '; Secure' : '';
  return { 'Set-Cookie': `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}${secure}` };
}

function endSession(req) {
  const token = sec.parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sec.hashToken(token));
  return { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` };
}

function requireUser(ctx) {
  if (!ctx.user) throw new HttpError(401, 'Entre na sua conta para continuar.');
  return ctx.user;
}
function requireAdmin(ctx) {
  requireUser(ctx);
  if (ctx.user.role !== 'admin') throw new HttpError(403, 'Acesso restrito ao administrador.');
  return ctx.user;
}

/* ---------- Validação ---------- */
function cleanName(value) {
  const name = String(value || '').trim().slice(0, 40);
  if (!name) throw new HttpError(400, 'Informe seu nome.');
  return name;
}
function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 120) throw new HttpError(400, 'Informe um e-mail válido.');
  return email;
}
function cleanPassword(value) {
  const password = String(value || '');
  if (password.length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres.');
  if (password.length > 200) throw new HttpError(400, 'Senha muito longa.');
  return password;
}
function splitScorers(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',');
  return list.map((n) => String(n).trim().slice(0, 40)).filter(Boolean).slice(0, 20);
}
function teamExists(id) { return Boolean(TEAM_BY_ID[id]); }

/* ---------- Handlers ---------- */
const handlers = {};

handlers['GET /api/me'] = (ctx) => ({ data: { user: ctx.user ? publicUser(ctx.user) : null } });

handlers['POST /api/signup'] = (ctx) => {
  const name = cleanName(ctx.body.name);
  const email = cleanEmail(ctx.body.email);
  const password = cleanPassword(ctx.body.password);
  const favoriteTeamId = ctx.body.favoriteTeamId ? String(ctx.body.favoriteTeamId) : null;
  if (favoriteTeamId && !teamExists(favoriteTeamId)) throw new HttpError(400, 'Escolha um time válido.');
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    throw new HttpError(409, 'Este e-mail já está cadastrado. Entre com sua senha.');
  }
  const info = db.prepare(`INSERT INTO users (name, email, password_hash, role, favorite_team_id, created_at) VALUES (?, ?, ?, 'user', ?, ?)`)
    .run(name, email, sec.hashPassword(password), favoriteTeamId, new Date().toISOString());
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  return { status: 201, data: { user: publicUser(user) }, headers: startSession(user.id) };
};

handlers['POST /api/login'] = (ctx) => {
  const email = String(ctx.body.email || '').trim().toLowerCase();
  const password = String(ctx.body.password || '');
  const key = `${ctx.ip}|${email}`;
  if (sec.loginBlocked(key)) throw new HttpError(429, 'Muitas tentativas. Aguarde 15 minutos e tente de novo.');
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!row || !sec.verifyPassword(password, row.password_hash)) {
    sec.recordFailure(key);
    throw new HttpError(401, 'E-mail ou senha incorretos.');
  }
  sec.clearFailures(key);
  return { data: { user: publicUser(row) }, headers: startSession(row.id) };
};

handlers['POST /api/logout'] = (ctx) => ({ data: { ok: true }, headers: endSession(ctx.req) });

handlers['PUT /api/me/team'] = (ctx) => {
  const user = requireUser(ctx);
  const teamId = String(ctx.body.teamId || '');
  if (!teamExists(teamId)) throw new HttpError(400, 'Escolha um dos 20 times disponíveis.');
  if (user.favorite_team_id && user.favorite_team_id !== teamId) {
    throw new HttpError(409, 'Seu time fixo já foi escolhido e não pode ser alterado.');
  }
  if (!user.favorite_team_id) db.prepare('UPDATE users SET favorite_team_id = ? WHERE id = ?').run(teamId, user.id);
  return { data: { user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) } };
};

// Usuários comuns veem apenas os jogos que ainda vão acontecer (kickoff no futuro);
// o admin vê todos, inclusive os que já passaram, para lançar resultados.
function upcoming(rows) {
  const now = Date.now();
  return rows.filter((row) => new Date(`${row.game_date}T${row.game_time}:00-03:00`).getTime() > now);
}

handlers['GET /api/games'] = (ctx) => {
  const admin = ctx.user && ctx.user.role === 'admin';
  let rows;
  if (admin) {
    rows = db.prepare('SELECT * FROM games ORDER BY game_date, game_time, label').all();
  } else {
    const teamId = ctx.user && ctx.user.favorite_team_id
      ? ctx.user.favorite_team_id
      : String(ctx.query.get('teamId') || '');
    rows = teamExists(teamId)
      ? db.prepare(`SELECT * FROM games WHERE on_site = 1 AND (home_id = ? OR away_id = ?)
                    ORDER BY game_date, game_time, label`).all(teamId, teamId)
      : db.prepare('SELECT * FROM games WHERE on_site = 1 ORDER BY game_date, game_time, label').all();
    rows = upcoming(rows);
  }
  return { data: { games: rows.map(gameDto) } };
};

handlers['GET /api/bets'] = (ctx) => {
  const user = requireUser(ctx);
  const rows = db.prepare(`SELECT b.*, u.name AS user_name, u.email AS user_email FROM bets b
                           JOIN users u ON u.id = b.user_id WHERE b.user_id = ? ORDER BY b.created_at DESC`).all(user.id);
  return { data: { bets: rows.map(betDto) } };
};

handlers['POST /api/bets'] = (ctx) => {
  const user = requireUser(ctx);
  const { gameId, guessHome, guessAway } = ctx.body;
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(String(gameId || ''));
  if (!game || (!game.on_site && ctx.user.role !== 'admin')) throw new HttpError(404, 'Partida não encontrada.');
  if (game.winner_id) throw new HttpError(409, 'Os palpites desta partida já foram encerrados.');
  const kickoff = new Date(`${game.game_date}T${game.game_time}:00-03:00`).getTime();
  const closesAt = kickoff - BET_CUTOFF_HOURS * 60 * 60 * 1000;
  if (Date.now() >= closesAt) throw new HttpError(409, `Palpites encerrados ${BET_CUTOFF_HOURS} horas antes do início da partida.`);
  if (user.favorite_team_id && user.favorite_team_id !== game.home_id && user.favorite_team_id !== game.away_id) {
    throw new HttpError(403, 'Esta partida não envolve o seu time fixo.');
  }

  // Placar palpitado: dois inteiros entre 0 e SCORE_MAX
  const validGoals = (value) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 0 && n <= SCORE_MAX ? n : null;
  };
  const home = validGoals(guessHome);
  const away = validGoals(guessAway);
  if (home === null || away === null) throw new HttpError(400, `Informe o placar com gols entre 0 e ${SCORE_MAX} para os dois times.`);

  // Artilheiros: 1 a MAX_SCORERS nomes, sem repetição
  const raw = Array.isArray(ctx.body.scorers) ? ctx.body.scorers : [];
  const seen = new Set();
  const scorers = [];
  for (const item of raw) {
    const name = String(item || '').trim().slice(0, 40);
    if (!name) continue;
    const key = normName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    scorers.push(name);
    if (scorers.length >= MAX_SCORERS) break;
  }
  if (!scorers.length) throw new HttpError(400, 'Escolha pelo menos um jogador para marcar gol.');

  const now = new Date().toISOString();
  try {
    const existing = db.prepare('SELECT id FROM bets WHERE user_id = ? AND game_id = ?').get(user.id, game.id);
    let betId;
    if (existing) {
      // Palpite pode ser ajustado até o fechamento da janela
      db.prepare(`UPDATE bets SET guess_home = ?, guess_away = ?, scorers = ?, created_at = ? WHERE id = ?`)
        .run(home, away, JSON.stringify(scorers), now, existing.id);
      betId = existing.id;
    } else {
      const info = db.prepare(`INSERT INTO bets (user_id, game_id, team_id, player_team_id, goals, player, guess_home, guess_away, scorers, odd, created_at)
                               VALUES (?, ?, ?, NULL, '', '', ?, ?, ?, 0, ?)`)
        .run(user.id, game.id, game.home_id, home, away, JSON.stringify(scorers), now);
      betId = info.lastInsertRowid;
    }
    const row = db.prepare(`SELECT b.*, u.name AS user_name, u.email AS user_email FROM bets b
                            JOIN users u ON u.id = b.user_id WHERE b.id = ?`).get(betId);
    return { status: existing ? 200 : 201, data: { bet: betDto(row) } };
  } catch (err) {
    if (String(err.message).includes('UNIQUE')) throw new HttpError(409, 'Você já fez um palpite nesta partida.');
    throw err;
  }
};

/* ----- Administrador ----- */
handlers['GET /api/admin/bets'] = (ctx) => {
  requireAdmin(ctx);
  const rows = db.prepare(`SELECT b.*, u.name AS user_name, u.email AS user_email FROM bets b
                           JOIN users u ON u.id = b.user_id ORDER BY b.created_at DESC`).all();
  return { data: { bets: rows.map(betDto) } };
};

handlers['GET /api/admin/users'] = (ctx) => {
  requireAdmin(ctx);
  const rows = db.prepare(`SELECT u.id, u.name, u.email, u.role, u.created_at,
                           (SELECT COUNT(*) FROM bets b WHERE b.user_id = u.id) AS bet_count
                           FROM users u ORDER BY u.created_at`).all();
  return { data: { users: rows.map((r) => ({ id: r.id, name: r.name, email: r.email, role: r.role, createdAt: r.created_at, betCount: r.bet_count })) } };
};

// Liga/desliga um jogo no site (jogo do dia) sem reenviar a partida inteira
handlers['PATCH /api/admin/games/:id/site'] = (ctx, params) => {
  requireAdmin(ctx);
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(params.id);
  if (!row) throw new HttpError(404, 'Partida não encontrada.');
  if (typeof ctx.body.onSite !== 'boolean') throw new HttpError(400, 'Informe onSite como verdadeiro ou falso.');
  db.prepare('UPDATE games SET on_site = ?, updated_at = ? WHERE id = ?')
    .run(ctx.body.onSite ? 1 : 0, new Date().toISOString(), row.id);
  return { data: { game: gameDto(db.prepare('SELECT * FROM games WHERE id = ?').get(row.id)) } };
};

handlers['POST /api/admin/games'] = (ctx) => {
  requireAdmin(ctx);
  const count = db.prepare('SELECT COUNT(*) AS n FROM games').get().n;
  const now = new Date().toISOString();
  const id = `admin-game-${Date.now()}`;
  db.prepare(`INSERT INTO games (id, label, home_id, away_id, game_date, game_time, on_site, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, '19:00', 0, ?, ?)`)
    .run(id, `Confronto ${String(count + 1).padStart(2, '0')}`, TEAMS[0].id, TEAMS[1].id, localDateISO(), now, now);
  return { status: 201, data: { game: gameDto(db.prepare('SELECT * FROM games WHERE id = ?').get(id)) } };
};

// Exclui uma partida; bloqueado quando existe qualquer palpite registrado
handlers['DELETE /api/admin/games/:id'] = (ctx, params) => {
  requireAdmin(ctx);
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(params.id);
  if (!row) throw new HttpError(404, 'Partida não encontrada.');
  const bets = db.prepare('SELECT COUNT(*) AS n FROM bets WHERE game_id = ?').get(row.id).n;
  if (bets > 0) {
    throw new HttpError(409, `Esta partida já tem ${bets} palpite(s). Para manter o histórico, oculte-a do site em vez de excluir.`);
  }
  db.prepare('DELETE FROM games WHERE id = ?').run(row.id);
  return { data: { ok: true, id: row.id } };
};

handlers['PUT /api/admin/games/:id'] = (ctx, params) => {
  requireAdmin(ctx);
  const row = db.prepare('SELECT * FROM games WHERE id = ?').get(params.id);
  if (!row) throw new HttpError(404, 'Partida não encontrada.');
  const b = ctx.body;
  const hasBets = db.prepare('SELECT COUNT(*) AS n FROM bets WHERE game_id = ?').get(row.id).n > 0;

  // Times só podem mudar enquanto a partida não tiver palpites
  const homeId = hasBets ? row.home_id : String(b.homeId || '');
  const awayId = hasBets ? row.away_id : String(b.awayId || '');
  if (!teamExists(homeId) || !teamExists(awayId)) throw new HttpError(400, 'Escolha os dois times.');
  if (homeId === awayId) throw new HttpError(400, 'Escolha dois times diferentes para a partida.');

  const date = String(b.date || '');
  const time = String(b.time || '');
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(date))) throw new HttpError(400, 'Informe uma data válida.');
  if (!TIME_RE.test(time)) throw new HttpError(400, 'Informe um horário válido.');

  const hasHome = b.homeGoals !== null && b.homeGoals !== undefined && b.homeGoals !== '';
  const hasAway = b.awayGoals !== null && b.awayGoals !== undefined && b.awayGoals !== '';
  if (hasHome !== hasAway) throw new HttpError(400, 'Preencha os dois lados do placar ou deixe ambos vazios.');

  let homeGoals = null;
  let awayGoals = null;
  let winnerId = String(b.winnerId || '');
  if (hasHome) {
    homeGoals = Number(b.homeGoals);
    awayGoals = Number(b.awayGoals);
    const ok = (n) => Number.isInteger(n) && n >= 0 && n <= 30;
    if (!ok(homeGoals) || !ok(awayGoals)) throw new HttpError(400, 'Use gols inteiros entre 0 e 30.');
    const scoreWinner = homeGoals === awayGoals ? 'draw' : homeGoals > awayGoals ? homeId : awayId;
    if (winnerId && winnerId !== scoreWinner) throw new HttpError(400, 'O vencedor selecionado precisa corresponder ao placar.');
    winnerId = scoreWinner;
  } else if (winnerId && !['draw', homeId, awayId].includes(winnerId)) {
    throw new HttpError(400, 'Vencedor inválido.');
  }

  const onSite = b.onSite === undefined ? row.on_site : (b.onSite ? 1 : 0);
  db.prepare(`UPDATE games SET home_id = ?, away_id = ?, game_date = ?, game_time = ?, winner_id = ?,
              home_goals = ?, away_goals = ?, scorers_home = ?, scorers_away = ?, on_site = ?, updated_at = ? WHERE id = ?`)
    .run(homeId, awayId, date, time, winnerId, homeGoals, awayGoals,
      JSON.stringify(splitScorers(b.scorersHome)), JSON.stringify(splitScorers(b.scorersAway)),
      onSite, new Date().toISOString(), row.id);
  return { data: { game: gameDto(db.prepare('SELECT * FROM games WHERE id = ?').get(row.id)) } };
};

/* ----- Jogos ao vivo (público) ----- */
handlers['GET /api/live'] = () => {
  const games = live.liveGames().map((g) => ({
    id: g.id,
    home: teamOf(g.home_id),
    away: teamOf(g.away_id),
    minute: g.live_minute,
    homeGoals: g.live_home,
    awayGoals: g.live_away
  }));
  return { data: { games } };
};

/* ----- Ranking (público, sem e-mails) ----- */
handlers['GET /api/ranking'] = () => {
  const users = db.prepare('SELECT id, name, favorite_team_id, created_at FROM users WHERE favorite_team_id IS NOT NULL').all()
    .map((u) => ({ id: u.id, name: u.name, favoriteTeamId: u.favorite_team_id, createdAt: u.created_at }));
  const games = db.prepare('SELECT * FROM games WHERE on_site = 1 AND home_goals IS NOT NULL AND away_goals IS NOT NULL')
    .all().map(gameDto);
  const bets = db.prepare('SELECT user_id, game_id, guess_home, guess_away, scorers FROM bets').all()
    .map((b) => ({ userId: b.user_id, gameId: b.game_id,
      guessHome: b.guess_home, guessAway: b.guess_away, scorers: safeScorers(b.scorers) }));
  const { rows, gamesJudged, rules } = computeRanking({ users, games, bets });
  return { data: {
    rules,
    gamesJudged,
    ranking: rows.map((r) => ({ ...r, favoriteTeam: teamOf(r.favoriteTeamId) }))
  } };
};

/* ---------- Roteamento ---------- */
function resolve(method, pathname) {
  for (const key of Object.keys(handlers)) {
    const [m, pattern] = key.split(' ');
    if (m !== method) continue;
    const names = [];
    const regex = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; }) + '$');
    const match = pathname.match(regex);
    if (match) {
      const params = {};
      names.forEach((n, i) => { params[n] = decodeURIComponent(match[i + 1]); });
      return { handler: handlers[key], params };
    }
  }
  return null;
}

// Retorna { status, data, headers } ou lança HttpError
function handleApi(req, pathname, body, ip) {
  const found = resolve(req.method, pathname);
  if (!found) throw new HttpError(404, 'Rota não encontrada.');
  const ctx = { req, body: body || {}, ip, query: new URL(req.url, 'http://localhost').searchParams, user: currentUser(req) };
  const result = found.handler(ctx, found.params) || {};
  return { status: result.status || 200, data: result.data || {}, headers: result.headers || {} };
}

module.exports = { handleApi, HttpError, crypto };
