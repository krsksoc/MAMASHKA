import { getDb } from "../db.js";
import type { Message } from "../../core/types.js";

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

function rowToMessage(row: Record<string, unknown>): Message {
  return {
    id: Number(row["id"]),
    chatId: Number(row["chat_id"]),
    userId: Number(row["user_id"]),
    telegramMessageId: typeof row["telegram_message_id"] === "number" ? row["telegram_message_id"] : null,
    text: typeof row["text"] === "string" ? row["text"] : null,
    hasSticker: Number(row["has_sticker"]) === 1,
    stickerEmoji: typeof row["sticker_emoji"] === "string" ? row["sticker_emoji"] : null,
    replyToUserId: typeof row["reply_to_user_id"] === "number" ? row["reply_to_user_id"] : null,
    createdAt: typeof row["created_at"] === "string" ? row["created_at"] : "",
  };
}

export function getChatMessages(chatId: number, limit: number): Message[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at DESC LIMIT ?").all(chatId, limit);
  if (!rows || !Array.isArray(rows)) {
    return [];
  }
  return rows.filter(isRecord).map(rowToMessage);
}

export function getRecentMessages(userId: number, limit: number): Message[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ?").all(userId, limit);
  if (!rows || !Array.isArray(rows)) {
    return [];
  }
  return rows.filter(isRecord).map(rowToMessage);
}

export function getMessagesByDateRange(chatId: number, startDate: string, endDate: string, limit: number): Message[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM messages WHERE chat_id = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at ASC LIMIT ?")
    .all(chatId, startDate, endDate, limit);
  if (!rows || !Array.isArray(rows)) {
    return [];
  }
  return rows.filter(isRecord).map(rowToMessage);
}

export function insertMessage(
  chatId: number,
  userId: number,
  text: string | null,
  hasSticker: boolean,
  stickerEmoji: string | null,
  replyToUserId: number | null,
): number {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO messages (chat_id, user_id, text, has_sticker, sticker_emoji, reply_to_user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
  );
  const result = stmt.run(chatId, userId, text, hasSticker ? 1 : 0, stickerEmoji, replyToUserId);
  return Number(result.lastInsertRowid);
}
export interface MessageWithUser {
  text: string | null;
  createdAt: string;
  userId: number;
  username: string | null;
  displayName: string | null;
}

export function getChatMessagesWithUsers(chatId: number, limit: number): MessageWithUser[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT m.text, m.created_at, m.user_id, u.username, u.display_name
    FROM messages m
    JOIN users u ON m.user_id = u.id
    WHERE m.chat_id = ? AND m.text IS NOT NULL AND m.text != ''
    ORDER BY m.created_at ASC
    LIMIT ?
  `).all(chatId, limit);
  if (!rows || !Array.isArray(rows)) {
    return [];
  }
  return rows.filter(isRecord).map((row) => ({
    text: typeof row["text"] === "string" ? row["text"] : null,
    createdAt: typeof row["created_at"] === "string" ? row["created_at"] : "",
    userId: Number(row["user_id"]),
    username: typeof row["username"] === "string" ? row["username"] : null,
    displayName: typeof row["display_name"] === "string" ? row["display_name"] : null,
  }));
}
