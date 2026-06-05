-- 001_init: all core tables
PRAGMA journal_mode = WAL;
PRAGMA cache_size = -32000;
PRAGMA mmap_size = 268435456;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  username TEXT,
  display_name TEXT,
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_message_at TEXT,
  is_ignored INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  UNIQUE(telegram_id, chat_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  telegram_message_id INTEGER,
  text TEXT,
  has_sticker INTEGER DEFAULT 0,
  sticker_emoji TEXT,
  reply_to_user_id INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_chat_created ON messages(chat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_chat_user ON messages(chat_id, user_id);
CREATE INDEX IF NOT EXISTS idx_messages_chat_sticker ON messages(chat_id, sticker_emoji);

CREATE TABLE IF NOT EXISTS quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  text TEXT NOT NULL,
  saved_by_user_id INTEGER REFERENCES users(id),
  telegram_message_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reputation_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  target_user_id INTEGER NOT NULL REFERENCES users(id),
  source_user_id INTEGER REFERENCES users(id),
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reputation_chat_target ON reputation_events(chat_id, target_user_id);

CREATE TABLE IF NOT EXISTS votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  target_user_id INTEGER REFERENCES users(id),
  initiated_by INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active',
  votes_required INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vote_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vote_id INTEGER NOT NULL REFERENCES votes(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  choice TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(vote_id, user_id)
);

CREATE TABLE IF NOT EXISTS anon_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL,
  sender_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  published_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_anon_chat_status ON anon_messages(chat_id, status);

CREATE TABLE IF NOT EXISTS drama_tracker (
  chat_id INTEGER PRIMARY KEY,
  last_drama_at TEXT,
  record_days INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS modifier_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  modifier_slug TEXT NOT NULL,
  condition_type TEXT NOT NULL,
  condition_value TEXT,
  priority INTEGER DEFAULT 0,
  compatible_tasks TEXT,
  is_active INTEGER DEFAULT 1
);
