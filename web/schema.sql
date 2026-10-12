-- Nét Vẽ Studio database (Cloudflare D1)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,            -- Google account id ("sub")
  email TEXT NOT NULL,
  name TEXT,
  picture TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,    -- SHA-256 of the cookie value; the raw token is never stored
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS used_nonces (
  nonce TEXT PRIMARY KEY,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  spec TEXT NOT NULL,             -- ProjectSpec JSON
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS projects_user ON projects(user_id, updated_at);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL,           -- queued | running | done | failed
  spec TEXT NOT NULL,             -- snapshot rendered by this job
  progress INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  runner TEXT,
  created_at INTEGER NOT NULL,
  started_at INTEGER,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS jobs_queue ON jobs(status, created_at);
CREATE INDEX IF NOT EXISTS jobs_project ON jobs(project_id, created_at);
CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL,
  day TEXT NOT NULL,              -- YYYY-MM-DD (UTC)
  kind TEXT NOT NULL,             -- script | image | render
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, kind)
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,           -- 'config' (JSON) or 'secret:<NAME>' (AES-GCM, see src/settings.ts)
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS blocked_users (
  user_id TEXT PRIMARY KEY,
  blocked_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  user_id TEXT,
  visitor TEXT,                   -- anonymous browser id (links a guest's visit to the account later)
  channel TEXT NOT NULL,          -- web | zalo | runner | system
  type TEXT NOT NULL,             -- api, auth.login, project.create, render.done, ai.script, ui.click ...
  path TEXT,
  ok INTEGER NOT NULL DEFAULT 1,
  ms INTEGER,
  cost REAL,                      -- VND spent by this step (AI, images, voice)
  project_id TEXT,
  data TEXT,                      -- JSON summary, secrets masked
  ip TEXT,                        -- coarsened
  ua TEXT
);
CREATE INDEX IF NOT EXISTS events_ts ON events(ts);
CREATE INDEX IF NOT EXISTS events_user ON events(user_id, ts);
CREATE INDEX IF NOT EXISTS events_type ON events(type, ts);
CREATE INDEX IF NOT EXISTS events_visitor ON events(visitor, ts);
CREATE TABLE IF NOT EXISTS zalo_links (
  user_id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL UNIQUE,
  name TEXT,
  linked_at INTEGER NOT NULL,
  notify INTEGER NOT NULL DEFAULT 1,
  prefs TEXT                       -- JSON: ratio, style, voice chosen by chat
);
CREATE TABLE IF NOT EXISTS zalo_codes (
  code TEXT PRIMARY KEY,           -- 6 characters, 30 minutes; user_id 'owner' = the admin claiming the bot
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS zalo_seen (
  message_id TEXT PRIMARY KEY,     -- Zalo retries deliveries: each message is handled once
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_plans (
  user_id TEXT PRIMARY KEY,
  plan TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  granted_by TEXT,                 -- order code, or the admin's email
  note TEXT
);
CREATE TABLE IF NOT EXISTS orders (
  code TEXT PRIMARY KEY,           -- also the bank transfer memo
  user_id TEXT NOT NULL,
  plan TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL,            -- pending | paid | cancelled | expired
  created_at INTEGER NOT NULL,
  paid_at INTEGER,
  ref TEXT,                        -- bank / SePay transaction reference
  via TEXT                         -- sepay | admin
);
CREATE INDEX IF NOT EXISTS orders_user ON orders(user_id, created_at);
CREATE INDEX IF NOT EXISTS orders_status ON orders(status, created_at);
