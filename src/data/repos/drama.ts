import { getDb } from "../db.js";

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

export function getDaysWithoutDrama(chatId: number): number {
  const db = getDb();
  const row = db.prepare("SELECT last_drama_at, record_days FROM drama_tracker WHERE chat_id = ?").get(chatId);
  if (!isRecord(row)) {
    return 0;
  }
  const lastDramaAt = typeof row["last_drama_at"] === "string" ? row["last_drama_at"] : null;
  const recordDays = Number(row["record_days"]) || 0;
  if (!lastDramaAt) {
    return recordDays;
  }
  const lastDramaDate = new Date(lastDramaAt);
  const now = new Date();
  const diffMs = now.getTime() - lastDramaDate.getTime();
  const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  return diffDays;
}

export function recordDrama(chatId: number): void {
  const db = getDb();
  const now = new Date().toISOString();
  const existing = db.prepare("SELECT record_days FROM drama_tracker WHERE chat_id = ?").get(chatId);
  if (existing) {
    const current = Number((existing as Record<string, unknown>)["record_days"]) || 0;
    db.prepare("UPDATE drama_tracker SET last_drama_at = ?, record_days = ? WHERE chat_id = ?")
      .run(now, current, chatId);
  } else {
    db.prepare("INSERT INTO drama_tracker (chat_id, last_drama_at, record_days) VALUES (?, ?, 0)")
      .run(chatId, now);
  }
}