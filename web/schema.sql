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
CREATE TABLE IF NOT EXISTS zalo_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL DEFAULT '',
  is_text INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'received',
  received_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  project_id TEXT,
  job_id TEXT
);
CREATE INDEX IF NOT EXISTS zalo_messages_status ON zalo_messages(status, updated_at);
CREATE TABLE IF NOT EXISTS zalo_outbox (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  message_id TEXT,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS zalo_outbox_status ON zalo_outbox(status, updated_at);
CREATE TABLE IF NOT EXISTS job_progress (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  phase TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
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
-- A bank transaction can pay exactly one order. Retain references for reconciliation.
CREATE TABLE IF NOT EXISTS payment_receipts (
  ref TEXT PRIMARY KEY,
  order_code TEXT NOT NULL,
  received_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS consents (
  user_id TEXT NOT NULL,
  version TEXT NOT NULL,           -- version of the terms + privacy policy accepted
  accepted_at INTEGER NOT NULL,
  ip TEXT,                         -- coarsened
  ua TEXT,
  PRIMARY KEY (user_id, version)
);
-- videos people chose to show in the community gallery
CREATE TABLE IF NOT EXISTS community (
  job_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  title TEXT NOT NULL,
  author TEXT,                     -- display name shown with the video
  style TEXT, mode TEXT, ratio TEXT,
  created_at INTEGER NOT NULL,
  likes INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0 -- set by an admin
);
CREATE INDEX IF NOT EXISTS community_new ON community(hidden, created_at);
CREATE TABLE IF NOT EXISTS community_likes (
  job_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (job_id, user_id)
);

-- Documentary credits (web/src/credits.ts)
CREATE TABLE IF NOT EXISTS credits (user_id TEXT PRIMARY KEY, balance INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS credit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, ref TEXT, ts INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS credit_log_user ON credit_log (user_id, ts);
CREATE TABLE IF NOT EXISTS doc_projects (project_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, charge_ref TEXT NOT NULL, images_left INTEGER NOT NULL, images_total INTEGER NOT NULL, created_at INTEGER NOT NULL);

-- Web Push: devices that asked to be told when a video is ready, and the note they show
CREATE TABLE IF NOT EXISTS push_subs (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS push_subs_user ON push_subs (user_id);
CREATE TABLE IF NOT EXISTS push_notes (user_id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, url TEXT NOT NULL, ts INTEGER NOT NULL);
-- what the Zalo assistant knows about each person it talks to (a salesperson's notes)
CREATE TABLE IF NOT EXISTS zalo_leads (
  chat_id TEXT PRIMARY KEY,
  stage TEXT NOT NULL DEFAULT 'new',  -- new · interested · trying · quoted · customer · lost
  profile TEXT NOT NULL DEFAULT '{}', -- niche, goal, channel, volume, worries… as the assistant learned them
  menu TEXT,                          -- numbered choices last offered ("1" means the first one)
  quoted_at INTEGER,                  -- when they last saw prices
  followups INTEGER NOT NULL DEFAULT 0,
  last_followup INTEGER,
  optout INTEGER NOT NULL DEFAULT 0,  -- asked not to be messaged first
  human_until INTEGER,                -- a member of staff is answering: the assistant stays quiet
  updated_at INTEGER NOT NULL
);

-- Prompt Hunter: publication is independent from AI metadata suggestions.
CREATE TABLE IF NOT EXISTS hunter_prompts (
 id TEXT PRIMARY KEY, user_id TEXT, author TEXT NOT NULL, title TEXT NOT NULL,
 content TEXT NOT NULL, category TEXT NOT NULL, tool TEXT NOT NULL DEFAULT '',
 description TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending', note TEXT NOT NULL DEFAULT '',
 ai_state TEXT NOT NULL DEFAULT 'none', dedupe TEXT UNIQUE,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS hunter_status_created ON hunter_prompts(status,created_at DESC);
CREATE TABLE IF NOT EXISTS hunter_reports (
 prompt_id TEXT NOT NULL, user_id TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL,
 PRIMARY KEY(prompt_id,user_id)
);
CREATE TABLE IF NOT EXISTS hunter_settings (id INTEGER PRIMARY KEY CHECK(id=1), auto_approve INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO hunter_settings(id,auto_approve) VALUES(1,0);

-- Community search indexes only public records; moderation changes update it atomically.
CREATE VIRTUAL TABLE IF NOT EXISTS hunter_search USING fts5(id UNINDEXED,title,description,content,category,tool,tokenize='unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS hunter_search_insert AFTER INSERT ON hunter_prompts WHEN new.status='published' BEGIN
 INSERT INTO hunter_search(id,title,description,content,category,tool) VALUES(new.id,replace(replace(new.title,'đ','d'),'Đ','D'),replace(replace(new.description,'đ','d'),'Đ','D'),replace(replace(new.content,'đ','d'),'Đ','D'),replace(replace(new.category,'đ','d'),'Đ','D'),replace(replace(new.tool,'đ','d'),'Đ','D'));
END;
CREATE TRIGGER IF NOT EXISTS hunter_search_delete AFTER DELETE ON hunter_prompts BEGIN
 DELETE FROM hunter_search WHERE id=old.id;
END;
CREATE TRIGGER IF NOT EXISTS hunter_search_update AFTER UPDATE ON hunter_prompts BEGIN
 DELETE FROM hunter_search WHERE id=old.id;
 INSERT INTO hunter_search(id,title,description,content,category,tool) SELECT new.id,replace(replace(new.title,'đ','d'),'Đ','D'),replace(replace(new.description,'đ','d'),'Đ','D'),replace(replace(new.content,'đ','d'),'Đ','D'),replace(replace(new.category,'đ','d'),'Đ','D'),replace(replace(new.tool,'đ','d'),'Đ','D') WHERE new.status='published';
END;
INSERT INTO hunter_search(id,title,description,content,category,tool) SELECT id,replace(replace(title,'đ','d'),'Đ','D'),replace(replace(description,'đ','d'),'Đ','D'),replace(replace(content,'đ','d'),'Đ','D'),replace(replace(category,'đ','d'),'Đ','D'),replace(replace(tool,'đ','d'),'Đ','D') FROM hunter_prompts WHERE status='published' AND NOT EXISTS(SELECT 1 FROM hunter_search s WHERE s.id=hunter_prompts.id);

CREATE TABLE IF NOT EXISTS zalo_ocr (message_id TEXT PRIMARY KEY,chat_id TEXT NOT NULL,content TEXT NOT NULL,uncertain INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS zalo_ocr_chat ON zalo_ocr(chat_id,created_at DESC);
-- Sheet-driven native Zalo image subscriptions. Delivery ledger survives renames/reordering.
CREATE TABLE IF NOT EXISTS image_feed (id INTEGER PRIMARY KEY CHECK(id=1), config TEXT NOT NULL, origin TEXT NOT NULL DEFAULT '', initialized INTEGER NOT NULL DEFAULT 0, last_poll INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0, error TEXT NOT NULL DEFAULT '', lease TEXT NOT NULL DEFAULT '', lease_until INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS image_feed_subscribers (chat_id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1, joined_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS image_feed_items (id TEXT PRIMARY KEY, file_id TEXT NOT NULL, source TEXT NOT NULL, external_id TEXT NOT NULL DEFAULT '', caption TEXT NOT NULL DEFAULT '', created_at INTEGER NOT NULL, baseline INTEGER NOT NULL DEFAULT 0, token TEXT, expires INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS image_feed_created ON image_feed_items(created_at);
CREATE TABLE IF NOT EXISTS image_feed_deliveries (item_id TEXT NOT NULL, chat_id TEXT NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, slot TEXT NOT NULL DEFAULT '', error TEXT NOT NULL DEFAULT '', message_id TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL, PRIMARY KEY(item_id,chat_id));
CREATE INDEX IF NOT EXISTS image_feed_slot ON image_feed_deliveries(chat_id,slot,status);
CREATE TABLE IF NOT EXISTS feed_google_states (state TEXT PRIMARY KEY, user_id TEXT NOT NULL, verifier TEXT NOT NULL, redirect TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS feed_google_states_expiry ON feed_google_states(expires);
CREATE TABLE IF NOT EXISTS feed_bridge_snapshot(id INTEGER PRIMARY KEY CHECK(id=1),source TEXT NOT NULL,revision TEXT NOT NULL,headers TEXT NOT NULL,rows TEXT NOT NULL,received_at INTEGER NOT NULL,error TEXT NOT NULL DEFAULT '',header_row INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS feed_bridge_failures(item_id TEXT PRIMARY KEY,attempts INTEGER NOT NULL DEFAULT 0,next_at INTEGER NOT NULL DEFAULT 0);
