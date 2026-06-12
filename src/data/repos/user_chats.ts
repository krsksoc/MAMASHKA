import { getDb } from "../db.js";

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

export interface UserChat {
  id: number;
  userId: number;
  chatId: number;
  chatTitle: string | null;
  firstSeenAt: string;
  lastActiveAt: string;
}

export function touchUserChat(userId: number, chatId: number, chatTitle: string | null): void {
  const db = getDb();
  const existing = db
    .prepare("SELECT id FROM user_chats WHERE user_id = ? AND chat_id = ?")
    .get(userId, chatId);
  if (!existing) {
    db.prepare(
      "INSERT INTO user_chats (user_id, chat_id, chat_title, first_seen_at, last_active_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))"
    ).run(userId, chatId, chatTitle);
  } else {
    db.prepare(
      "UPDATE user_chats SET chat_title = ?, last_active_at = datetime('now') WHERE user_id = ? AND chat_id = ?"
    ).run(chatTitle, userId, chatId);
  }
}

export function getUserChatsByTelegramId(telegramId: number): Array<{chat_id: number; chat_title: string | null; first_seen_at: string}> {
  const db = getDb();
  const rows = db
    .prepare(`
      SELECT uc.chat_id, uc.chat_title, uc.first_seen_at
      FROM user_chats uc
      JOIN users u ON u.id = uc.user_id
      WHERE u.telegram_id = ?
      ORDER BY uc.last_active_at DESC
    `)
    .all(telegramId);
  if (!rows || !Array.isArray(rows)) return [];
  return rows.filter(isRecord).map((row) => ({
    chat_id: Number(row["chat_id"]),
    chat_title: typeof row["chat_title"] === "string" ? row["chat_title"] : null,
    first_seen_at: typeof row["first_seen_at"] === "string" ? row["first_seen_at"] : "",
  }));
}

export function getUserChats(userId: number): UserChat[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM user_chats WHERE user_id = ? ORDER BY last_active_at DESC")
    .all(userId);
  if (!rows || !Array.isArray(rows)) return [];
  return rows.filter(isRecord).map((row) => ({
    id: Number(row["id"]),
    userId: Number(row["user_id"]),
    chatId: Number(row["chat_id"]),
    chatTitle: typeof row["chat_title"] === "string" ? row["chat_title"] : null,
    firstSeenAt: typeof row["first_seen_at"] === "string" ? row["first_seen_at"] : "",
    lastActiveAt: typeof row["last_active_at"] === "string" ? row["last_active_at"] : "",
  }));
}
