CREATE TABLE IF NOT EXISTS user_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id INTEGER NOT NULL,
  chat_title TEXT,
  first_seen_at TEXT DEFAULT (datetime('now')),
  last_active_at TEXT DEFAULT (datetime('now')),
  UNIQUE(user_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_user_chats_user_id ON user_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_user_chats_chat_id ON user_chats(chat_id);
