-- Esquema do banco SQLite do Bolão Amigo.
-- O servidor cria estas tabelas automaticamente em server/db.js.
PRAGMA foreign_keys = ON;

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
  updated_at TEXT NOT NULL,
  on_site INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game_id TEXT NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  -- campos legados do modelo antigo (palpite de gols de um time + um marcador)
  team_id TEXT NOT NULL,
  player_team_id TEXT,
  goals TEXT NOT NULL,
  player TEXT NOT NULL,
  -- modelo atual: placar exato + lista de artilheiros (JSON)
  guess_home INTEGER,
  guess_away INTEGER,
  scorers TEXT NOT NULL DEFAULT '[]',
  odd REAL NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (user_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_bets_game ON bets(game_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
