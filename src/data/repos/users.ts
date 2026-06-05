import { getDb } from "../db.js";
import type { User } from "../../core/types.js";

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: Number(row["id"]),
    telegramId: Number(row["telegram_id"]),
    chatId: Number(row["chat_id"]),
    username: typeof row["username"] === "string" ? row["username"] : null,
    displayName: typeof row["display_name"] === "string" ? row["display_name"] : null,
    firstSeenAt: typeof row["first_seen_at"] === "string" ? row["first_seen_at"] : "",
    lastMessageAt: typeof row["last_message_at"] === "string" ? row["last_message_at"] : null,
    isIgnored: Number(row["is_ignored"]) === 1,
    messageCount: Number(row["message_count"]),
  };
}

export function getUserByTelegramId(telegramId: number, chatId: number): User | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE telegram_id = ? AND chat_id = ?").get(telegramId, chatId);
  if (!isRecord(row)) {
    return null;
  }
  return rowToUser(row);
}

export function getOrCreateUser(telegramId: number, chatId: number, username: string | null, displayName: string | null): User | null {
  const db = getDb();
  let user = getUserByTelegramId(telegramId, chatId);
  if (user) {
    // Update
    db.prepare(
      "UPDATE users SET username = ?, display_name = ?, last_message_at = datetime('now'), message_count = message_count + 1 WHERE id = ?"
    ).run(username, displayName, user.id);
    return getUserByTelegramId(telegramId, chatId);
  }
  const stmt = db.prepare(
    "INSERT INTO users (telegram_id, chat_id, username, display_name, first_seen_at, last_message_at, message_count) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'), 1)"
  );
  stmt.run(telegramId, chatId, username, displayName);
  return getUserByTelegramId(telegramId, chatId);
}

export function getUser(id: number): User | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!isRecord(row)) {
    return null;
  }
  return rowToUser(row);
}

export function getUsersByChat(chatId: number): User[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM users WHERE chat_id = ? ORDER BY message_count DESC").all(chatId);
  if (!rows || !Array.isArray(rows)) {
    return [];
  }
  return rows.filter(isRecord).map(rowToUser);
}

export function getActiveUsers(chatId: number, days: number): User[] {
  const db = getDb();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const rows = db.prepare(
    "SELECT * FROM users WHERE chat_id = ? AND last_message_at >= ? ORDER BY message_count DESC"
  ).all(chatId, cutoff.toISOString());
  if (!rows || !Array.isArray(rows)) {
    return [];
  }
  return rows.filter(isRecord).map(rowToUser);
}

export function isUserIgnored(userId: number): boolean {
  const db = getDb();
  const row = db.prepare("SELECT is_ignored FROM users WHERE id = ?").get(userId);
  if (!isRecord(row)) {
    return false;
  }
  return Number(row["is_ignored"]) === 1;
}

export function setIgnored(userId: number, ignored: boolean): void {
  const db = getDb();
  db.prepare("UPDATE users SET is_ignored = ? WHERE id = ?").run(ignored ? 1 : 0, userId);
}
