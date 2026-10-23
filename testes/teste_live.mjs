// Testa a sincronização ao vivo com um fornecedor simulado e banco temporário.
// Rode: node testes/teste_live.mjs
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'live-')), 'test.db');
process.env.DB_PATH = tmp;
const require = createRequire(import.meta.url);
const { db } = require('../server/db.js');
const live = require('../server/live.js');

const now = new Date().toISOString();
const insert = (id, home, away, date, adminDone = false) => db.prepare(
  `INSERT INTO games (id,label,home_id,away_id,game_date,game_time,winner_id,home_goals,away_goals,created_at,updated_at,on_site)
   VALUES (?,?,?,?,?,'19:00',?,?,?,?,?,1)`).run(id, id, home, away, date,
   adminDone ? 'draw' : '', adminDone ? 1 : null, adminDone ? 1 : null, now, now);
insert('g-live', 'flamengo', 'sao-paulo', '2026-03-01');
insert('g-fim', 'palmeiras', 'corinthians', '2026-03-01');
insert('g-admin', 'santos', 'botafogo', '2026-03-02', true); // admin já lançou 1x1

// Nomes do fornecedor (com acento e variações) mapeiam para os ids do bolão
assert.equal(live.teamIdFor('São Paulo'), 'sao-paulo');
assert.equal(live.teamIdFor('Atlético Mineiro'), 'atletico-mg');
assert.equal(live.teamIdFor('Red Bull Bragantino'), 'bragantino');
assert.equal(live.teamIdFor('Time Inventado'), null);

const fixtures = [
  { externalId: '1', homeName: 'Flamengo', awayName: 'São Paulo', date: '2026-03-01', time: '19:00',
    status: 'live', minute: 67, homeGoals: 2, awayGoals: 1, scorers: { home: [], away: [] } },
  { externalId: '2', homeName: 'Palmeiras', awayName: 'Corinthians', date: '2026-03-01', time: '19:00',
    status: 'finished', minute: null, homeGoals: 0, awayGoals: 3, scorers: { home: [], away: ['Yuri Alberto', 'Memphis'] } },
  { externalId: '3', homeName: 'Santos', awayName: 'Botafogo', date: '2026-03-02', time: '19:00',
    status: 'finished', minute: null, homeGoals: 4, awayGoals: 0, scorers: { home: ['X'], away: [] } },
  { externalId: '4', homeName: 'Time Inventado', awayName: 'Remo', date: '2026-03-01', time: '19:00',
    status: 'scheduled', minute: null, homeGoals: null, awayGoals: null, scorers: { home: [], away: [] } }
];

const counts = live.syncFixtures(fixtures);
assert.deepEqual(counts, { 'ao-vivo': 1, finalizado: 1, 'ja-finalizado': 1, 'time-desconhecido': 1 });

const liveRow = db.prepare('SELECT * FROM games WHERE id = ?').get('g-live');
assert.equal(liveRow.live_status, 'live');
assert.equal(liveRow.live_minute, 67);
assert.equal(liveRow.live_home, 2);
assert.equal(liveRow.home_goals, null, 'jogo ao vivo não vira resultado final');

const finRow = db.prepare('SELECT * FROM games WHERE id = ?').get('g-fim');
assert.equal(finRow.home_goals, 0);
assert.equal(finRow.away_goals, 3);
assert.equal(finRow.winner_id, 'corinthians');
assert.deepEqual(JSON.parse(finRow.scorers_away), ['Yuri Alberto', 'Memphis']);

const adminRow = db.prepare('SELECT * FROM games WHERE id = ?').get('g-admin');
assert.equal(adminRow.home_goals, 1, 'resultado lançado pelo admin não é sobrescrito');

// Lista pública só mostra jogos ao vivo
const list = live.liveGames();
assert.deepEqual(list.map((g) => g.id), ['g-live']);

// Fluxo completo: busca (fetch simulado) -> parse -> aplica
process.env.LIVE_API_URL = 'https://fornecedor.example/fixtures';
const fakeFetch = async (url, opts) => {
  assert.equal(url, 'https://fornecedor.example/fixtures');
  return { ok: true, json: async () => ({ data: fixtures.slice(0, 1) }) };
};
const again = await live.runSync(fakeFetch);
assert.equal(again['ao-vivo'], 1);

// Falha do fornecedor é erro claro, não derruba nada
const bad = async () => ({ ok: false, status: 503 });
await assert.rejects(live.runSync(bad), /503/);

console.log('OK: sincronização ao vivo passou em todos os testes.');
