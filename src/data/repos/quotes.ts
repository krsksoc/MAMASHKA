import { getDb } from "../db.js";
import type { Quote } from "../../core/types.js";

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

function rowToQuote(row: Record<string, unknown>): Quote {
  return {
    id: Number(row["id"]),
    chatId: Number(row["chat_id"]),
    userId: Number(row["user_id"]),
    text: typeof row["text"] === "string" ? row["text"] : "",
    savedByUserId: typeof row["saved_by_user_id"] === "number" ? row["saved_by_user_id"] : null,
    telegramMessageId: typeof row["telegram_message_id"] === "number" ? row["telegram_message_id"] : null,
    createdAt: typeof row["created_at"] === "string" ? row["created_at"] : "",
  };
}

export function getRandomQuote(chatId: number): Quote | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM quotes WHERE chat_id = ? ORDER BY RANDOM() LIMIT 1").get(chatId);
  if (!isRecord(row)) {
    return null;
  }
  return rowToQuote(row);
}

export function getQuotesByUser(chatId: number, userId: number): Quote[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM quotes WHERE chat_id = ? AND saved_by_user_id = ? ORDER BY created_at DESC LIMIT 50"
  ).all(chatId, userId);
  if (!rows || !Array.isArray(rows)) {
    return [];
  }
  return rows.filter(isRecord).map(rowToQuote);
}

export function insertQuote(chatId: number, userId: number, text: string, savedByUserId: number | null): number {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO quotes (chat_id, user_id, text, saved_by_user_id, created_at) VALUES (?, ?, ?, ?, datetime('now'))",
  );
  const result = stmt.run(chatId, userId, text, savedByUserId);
  return Number(result.lastInsertRowid);
}