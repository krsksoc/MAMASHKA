import type { AnonMessage } from "../../core/types.js";
import { getDb } from "../db.js";

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

function isValidAnonStatus(val: unknown): val is AnonMessage["status"] {
  return val === "pending" || val === "published" || val === "rejected";
}

function rowToAnonMessage(row: Record<string, unknown>): AnonMessage {
  return {
    id: Number(row.id),
    chatId: Number(row.chat_id),
    senderId: Number(row.sender_id),
    text: typeof row.text === "string" ? row.text : "",
    status: isValidAnonStatus(row.status) ? row.status : "pending",
    publishedAt: typeof row.published_at === "string" ? row.published_at : null,
    createdAt: typeof row.created_at === "string" ? row.created_at : "",
  };
}

export function insertAnonMessage(chatId: number, senderId: number, text: string): number {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO anon_messages (chat_id, sender_id, text, status, created_at) VALUES (?, ?, ?, 'pending', datetime('now'))",
  );
  const result = stmt.run(chatId, senderId, text);
  return Number(result.lastInsertRowid);
}

export function getPendingAnons(chatId: number): AnonMessage[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM anon_messages WHERE chat_id = ? AND status = 'pending' ORDER BY created_at ASC",
    )
    .all(chatId);
  if (!rows || !Array.isArray(rows)) {
    return [];
  }
  return rows.filter(isRecord).map(rowToAnonMessage);
}

export function publishAnon(id: number): void {
  const db = getDb();
  db.prepare(
    "UPDATE anon_messages SET status = 'published', published_at = datetime('now') WHERE id = ?",
  ).run(id);
}

export function rejectAnon(id: number): void {
  const db = getDb();
  db.prepare("UPDATE anon_messages SET status = 'rejected' WHERE id = ?").run(id);
}

export function getMyAnons(senderId: number): AnonMessage[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT * FROM anon_messages WHERE sender_id = ? ORDER BY created_at DESC")
    .all(senderId);
  if (!rows || !Array.isArray(rows)) {
    return [];
  }
  return rows.filter(isRecord).map(rowToAnonMessage);
}
