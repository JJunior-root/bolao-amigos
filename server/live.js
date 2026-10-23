'use strict';
/* ==========================================================
   AO VIVO — sincroniza os jogos do Brasileirão com um fornecedor de dados.

   Configuração (variáveis de ambiente):
   - LIVE_API_URL       URL completa da lista de partidas do fornecedor (já com liga/data)
   - LIVE_API_KEY       chave do fornecedor (opcional)
   - LIVE_API_HEADER    cabeçalho onde vai a chave (padrão: Authorization: Bearer ...)
   - LIVE_POLL_SECONDS  intervalo entre consultas (padrão: 60)

   Contrato interno: parseFixtures() converte o JSON do fornecedor para o formato
   abaixo. É o único ponto que depende do fornecedor escolhido e deve ser conferido
   com a documentação e uma resposta real antes de publicar.
     { externalId, homeName, awayName, date: 'AAAA-MM-DD', time: 'HH:MM',
       status: 'scheduled' | 'live' | 'finished', minute, homeGoals, awayGoals,
       scorers: { home: [nomes], away: [nomes] } }

   Palpites continuam fechando 2h antes da partida: a sincronização não altera isso.
   ========================================================== */

const { db } = require('./db');

// Nome que o fornecedor usa -> id do time no bolão (comparação sem acento e caixa)
const ALIASES = {
  'flamengo': 'flamengo', 'fluminense': 'fluminense', 'corinthians': 'corinthians',
  'palmeiras': 'palmeiras', 'sao paulo': 'sao-paulo', 'santos': 'santos',
  'atletico mineiro': 'atletico-mg', 'atletico mg': 'atletico-mg', 'cruzeiro': 'cruzeiro',
  'gremio': 'gremio', 'internacional': 'internacional', 'botafogo': 'botafogo',
  'vasco da gama': 'vasco', 'vasco': 'vasco', 'athletico paranaense': 'athletico',
  'athletico pr': 'athletico', 'athletico': 'athletico', 'coritiba': 'coritiba',
  'bahia': 'bahia', 'vitoria': 'vitoria', 'red bull bragantino': 'bragantino',
  'bragantino': 'bragantino', 'mirassol': 'mirassol', 'chapecoense': 'chapecoense', 'remo': 'remo'
};

const normName = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase('pt-BR');
const teamIdFor = (name) => ALIASES[normName(name)] || null;

/* ---------- Busca no fornecedor ---------- */
function providerHeaders() {
  const key = process.env.LIVE_API_KEY;
  if (!key) return {};
  const header = process.env.LIVE_API_HEADER || 'Authorization';
  return { [header]: header === 'Authorization' ? `Bearer ${key}` : key };
}

async function fetchRawFixtures(fetchImpl = fetch) {
  const url = process.env.LIVE_API_URL;
  if (!url) throw new Error('LIVE_API_URL não configurada.');
  const response = await fetchImpl(url, { headers: providerHeaders() });
  if (!response.ok) throw new Error(`Fornecedor respondeu ${response.status}.`);
  return response.json();
}

/* ---------- Conversão do JSON do fornecedor ---------- */
// Ajuste esta função ao formato real do fornecedor escolhido.
function parseFixtures(json) {
  const list = Array.isArray(json) ? json : (json.data || json.response || []);
  return list.map((raw) => ({
    externalId: String(raw.id),
    homeName: raw.homeName,
    awayName: raw.awayName,
    date: raw.date,
    time: raw.time,
    status: raw.status,
    minute: raw.minute ?? null,
    homeGoals: raw.homeGoals ?? null,
    awayGoals: raw.awayGoals ?? null,
    scorers: { home: raw.scorers?.home || [], away: raw.scorers?.away || [] }
  }));
}

/* ---------- Aplicação no banco ---------- */
// Só altera jogos que existem no bolão (mesmos times e data). Resultado já lançado
// pelo admin é mantido: o fornecedor não sobrescreve.
function applyFixture(f, now = new Date().toISOString()) {
  const home = teamIdFor(f.homeName);
  const away = teamIdFor(f.awayName);
  if (!home || !away) return 'time-desconhecido';
  const game = db.prepare('SELECT * FROM games WHERE home_id = ? AND away_id = ? AND game_date = ?').get(home, away, f.date);
  if (!game) return 'sem-jogo';

  if (f.status === 'finished') {
    if (game.home_goals !== null && game.away_goals !== null) return 'ja-finalizado';
    const winner = f.homeGoals === f.awayGoals ? 'draw' : f.homeGoals > f.awayGoals ? home : away;
    db.prepare(`UPDATE games SET home_goals = ?, away_goals = ?, winner_id = ?, scorers_home = ?, scorers_away = ?,
                live_status = 'finished', live_minute = NULL, live_home = NULL, live_away = NULL,
                external_id = ?, updated_at = ? WHERE id = ?`)
      .run(f.homeGoals, f.awayGoals, winner, JSON.stringify(f.scorers.home.slice(0, 20)),
        JSON.stringify(f.scorers.away.slice(0, 20)), f.externalId, now, game.id);
    return 'finalizado';
  }

  if (f.status === 'live') {
    db.prepare(`UPDATE games SET live_status = 'live', live_minute = ?, live_home = ?, live_away = ?,
                external_id = ?, updated_at = ? WHERE id = ?`)
      .run(f.minute, f.homeGoals ?? 0, f.awayGoals ?? 0, f.externalId, now, game.id);
    return 'ao-vivo';
  }

  db.prepare(`UPDATE games SET live_status = '', external_id = ?, updated_at = ? WHERE id = ?`)
    .run(f.externalId, now, game.id);
  return 'agendado';
}

function syncFixtures(fixtures) {
  const counts = {};
  for (const f of fixtures) {
    const result = applyFixture(f);
    counts[result] = (counts[result] || 0) + 1;
  }
  return counts;
}

async function runSync(fetchImpl) {
  const json = await fetchRawFixtures(fetchImpl);
  return syncFixtures(parseFixtures(json));
}

/* ---------- Consulta para a API pública ---------- */
function liveGames() {
  return db.prepare(`SELECT id, home_id, away_id, game_date, game_time, live_minute, live_home, live_away
                     FROM games WHERE on_site = 1 AND live_status = 'live' ORDER BY game_date, game_time`).all();
}

/* ---------- Agendamento ---------- */
let timer = null;
function start() {
  if (!process.env.LIVE_API_URL || timer) return false;
  const every = Math.max(15, Number(process.env.LIVE_POLL_SECONDS) || 60) * 1000;
  const tick = () => runSync().then(
    (counts) => { if (process.env.LIVE_LOG === '1') console.log('[ao-vivo]', counts); },
    (err) => console.error('[ao-vivo] falha na sincronização:', err.message)
  );
  tick();
  timer = setInterval(tick, every);
  timer.unref();
  return true;
}

module.exports = { ALIASES, teamIdFor, parseFixtures, applyFixture, syncFixtures, runSync, liveGames, start };
