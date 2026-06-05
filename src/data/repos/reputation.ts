import { getDb } from "../db.js";
import type { ReputationSummary } from "../../core/types.js";

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

export function addReputationEvent(
  chatId: number,
  targetUserId: number,
  sourceUserId: number | null,
  delta: number,
  reason: string,
): number {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO reputation_events (chat_id, target_user_id, source_user_id, delta, reason, created_at) VALUES (?, ?, ?, ?, ?, datetime('now'))",
  );
  const result = stmt.run(chatId, targetUserId, sourceUserId, delta, reason);
  return Number(result.lastInsertRowid);
}

export function getReputation(chatId: number, userId: number): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COALESCE(SUM(delta), 0) total FROM reputation_events WHERE chat_id = ? AND target_user_id = ?")
    .get(chatId, userId);
  if (!isRecord(row)) {
    return 0;
  }
  return Number(row["total"]);
}

export function getReputationRanking(
  chatId: number,
  limit: number,
): Array<{ userId: number; reputation: number }> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT target_user_id, SUM(delta) reputation
       FROM reputation_events
       WHERE chat_id = ?
       GROUP BY target_user_id
       ORDER BY reputation DESC
       LIMIT ?`,
    )
    .all(chatId, limit);
  if (!rows || !Array.isArray(rows)) {
    return [];
  }
  return rows
    .filter(isRecord)
    .map((row) => ({
      userId: Number(row["userId"]),
      reputation: Number(row["reputation"]),
    }));
}

export function getReputationSummary(chatId: number, userId: number): ReputationSummary {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         COUNT(CASE WHEN delta > 0 THEN 1 END) friend_count,
         COUNT(CASE WHEN delta < 0 THEN 1 END) foe_count,
         COALESCE(SUM(delta), 0) total_delta
       FROM reputation_events
       WHERE chat_id = ? AND target_user_id = ?`,
    )
    .get(chatId, userId);
  if (!isRecord(row)) {
    return { userId, totalDelta: 0, friendCount: 0, foeCount: 0 };
  }
  return {
    userId,
    totalDelta: Number(row["total_delta"]),
    friendCount: Number(row["friend_count"]),
    foeCount: Number(row["foe_count"]),
  };
}