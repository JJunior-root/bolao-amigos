'use strict';
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { TEAMS, FIXTURE_PAIRS } = require('../js/data.js');
const { hashPassword, verifyPassword } = require('./security');

const ROOT = path.join(__dirname, '..');
const DB_FILE = process.env.DB_PATH || path.join(ROOT, 'data', 'arquibancada.db');
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    favorite_team_id TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS games (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    home_id TEXT NOT NULL,
    away_id TEXT NOT NULL,
    game_date TEXT NOT NULL,
    game_time TEXT NOT NULL,
    winner_id TEXT NOT NULL DEFAULT '',
    home_goals INTEGER,
    away_goals INTEGER,
    scorers_home TEXT NOT NULL DEFAULT '[]',
    scorers_away TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    team_id TEXT NOT NULL,
    player_team_id TEXT,
    goals TEXT NOT NULL,
    player TEXT NOT NULL,
    guess_home INTEGER,
    guess_away INTEGER,
    scorers TEXT NOT NULL DEFAULT '[]',
    odd REAL NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, game_id)
  );
  CREATE INDEX IF NOT EXISTS idx_bets_game ON bets(game_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

function localDateISO(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Início do "dia de Brasília" (as partidas usam horário de Brasília).
function brasiliaNow() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}

function kickoffMs(row) {
  return Date.parse(`${row.game_date}T${row.game_time}:00-03:00`);
}

// Jogos iniciais: mantidos sempre no futuro.
// 1) Remove jogos antigos de demonstração (já aconteceram, sem placar e sem palpites).
// 2) Se não restar nenhum jogo futuro, cria uma rodada nova distribuída
//    por hoje (ou amanhã, quando já é tarde para palpitar) e os próximos dias.
function seedGames() {
  const now = Date.now();
  const rows = db.prepare(`SELECT g.*, (SELECT COUNT(*) FROM bets b WHERE b.game_id = g.id) AS bet_count FROM games g`).all();
  for (const row of rows) {
    const passed = kickoffMs(row) < now - 12 * 60 * 60 * 1000; // começou há mais de 12h
    const untouched = row.bet_count === 0 && row.home_goals === null && row.away_goals === null;
    if (passed && untouched) db.prepare('DELETE FROM games WHERE id = ?').run(row.id);
  }

  const remaining = db.prepare('SELECT game_date, game_time FROM games').all();
  const hasUpcoming = remaining.some((row) => kickoffMs(row) > now);
  if (hasUpcoming) return;

  const brt = brasiliaNow();
  // Depois das 16h (Brasília) os jogos de hoje já estariam com palpites
  // fechando ou encerrados: a rodada começa no dia seguinte.
  const startOffset = brt.getHours() >= 16 ? 1 : 0;
  const dayOffsets = [0, 0, 0, 0, 1, 1, 1, 2, 2, 3].map((n) => n + startOffset);
  const times = ['19:00', '19:30', '20:00', '20:30', '18:00', '20:00', '21:00', '16:00', '18:30', '21:00'];
  const stamp = new Date().toISOString();
  const insert = db.prepare(`INSERT INTO games (id, label, home_id, away_id, game_date, game_time, created_at, updated_at)
                             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  FIXTURE_PAIRS.forEach(([homeId, awayId], i) => {
    const day = new Date(brt.getTime());
    day.setDate(day.getDate() + (dayOffsets[i] || 0));
    insert.run(`${homeId}-${awayId}`, `Confronto ${String(i + 1).padStart(2, '0')}`, homeId, awayId,
      localDateISO(day), times[i] || '19:00', stamp, stamp);
  });
}

// Conta especial do administrador.
// ADMIN_EMAIL e ADMIN_PASSWORD vêm do ambiente. Se a senha não for definida
// e a conta ainda não existir, uma senha aleatória é gerada e mostrada UMA vez.
function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'chianca@gmail.com').trim().toLowerCase();
  const envPassword = process.env.ADMIN_PASSWORD;
  const now = new Date().toISOString();
  let existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const adminName = (process.env.ADMIN_NAME || 'Chianca').trim().slice(0, 40);

  // Atualiza a conta administrativa padrão de versões anteriores sem perder a senha já definida.
  if (!existing && email === 'chianca@gmail.com') {
    const legacy = db.prepare("SELECT * FROM users WHERE email = 'admin@arquibancada.local' AND role = 'admin'").get();
    if (legacy) {
      db.prepare('UPDATE users SET email = ?, name = ? WHERE id = ?').run(email, adminName, legacy.id);
      existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    }
  }

  if (!existing) {
    const password = envPassword || require('crypto').randomBytes(12).toString('base64url');
    db.prepare(`INSERT INTO users (name, email, password_hash, role, created_at) VALUES (?, ?, ?, 'admin', ?)`)
      .run(adminName, email, hashPassword(password), now);
    if (!envPassword) {
      console.log('\n[admin] Conta de administrador criada.');
      console.log(`[admin] E-mail: ${email}`);
      console.log(`[admin] Senha temporária: ${password}`);
      console.log('[admin] Troque definindo ADMIN_PASSWORD no ambiente e reiniciando o servidor.\n');
    }
    return;
  }

  // Mantém a conta admin como admin e sincroniza a senha com ADMIN_PASSWORD, se definida
  if (existing.name !== adminName) {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(adminName, existing.id);
  }
  if (existing.role !== 'admin') {
    db.prepare(`UPDATE users SET role = 'admin' WHERE id = ?`).run(existing.id);
  }
  if (envPassword && !verifyPassword(envPassword, existing.password_hash)) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(envPassword), existing.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(existing.id);
    console.log('[admin] Senha do administrador atualizada a partir de ADMIN_PASSWORD.');
  }
}

// Migrações aditivas mantêm os bancos existentes e adicionam os novos campos.
function migrate() {
  const userCols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  if (!userCols.includes('favorite_team_id')) {
    db.exec('ALTER TABLE users ADD COLUMN favorite_team_id TEXT');
  }
  // Novo modelo de palpite: placar exato (mandante x visitante) + lista de artilheiros.
  const betCols = db.prepare('PRAGMA table_info(bets)').all().map((c) => c.name);
  if (!betCols.includes('player_team_id')) {
    db.exec('ALTER TABLE bets ADD COLUMN player_team_id TEXT');
  }
  if (!betCols.includes('guess_home')) db.exec('ALTER TABLE bets ADD COLUMN guess_home INTEGER');
  if (!betCols.includes('guess_away')) db.exec('ALTER TABLE bets ADD COLUMN guess_away INTEGER');
  if (!betCols.includes('scorers')) db.exec("ALTER TABLE bets ADD COLUMN scorers TEXT NOT NULL DEFAULT '[]'");
  const cols = db.prepare('PRAGMA table_info(games)').all().map((c) => c.name);
  if (!cols.includes('on_site')) {
    db.exec('ALTER TABLE games ADD COLUMN on_site INTEGER NOT NULL DEFAULT 1');
  }
  // Campos da sincronização ao vivo (ver server/live.js)
  const liveCols = {
    external_id: 'TEXT', live_status: "TEXT NOT NULL DEFAULT ''", live_minute: 'INTEGER',
    live_home: 'INTEGER', live_away: 'INTEGER'
  };
  for (const [name, type] of Object.entries(liveCols)) {
    if (!cols.includes(name)) db.exec(`ALTER TABLE games ADD COLUMN ${name} ${type}`);
  }
}

migrate();
seedGames();
ensureAdmin();

module.exports = { db, TEAMS, DB_FILE, localDateISO };
