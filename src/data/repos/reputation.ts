import type { ReputationSummary } from "../../core/types.js";
import { getDb } from "../db.js";

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

/**
 * Atomic "vote once per UTC day" insert.
 *
 * Uses the `uniq_reputation_daily` partial unique index (chat_id, source_user_id,
 * target_user_id, date(created_at)) to enforce one vote per (voter → target) per
 * calendar day at the DB level. Returns:
 *   - { inserted: true,  eventId, delta }    — vote was recorded
 *   - { inserted: false, existingDelta }     — duplicate; existing vote's delta
 *
 * Use this from any path that wants at-most-once-per-day voting semantics. The
 * single-INSERT form is safe under SQLite's writer-serialization model (Bun
 * SQLite is single-threaded per connection).
 */
export function addReputationEventIfAbsent(
  chatId: number,
  targetUserId: number,
  sourceUserId: number,
  delta: number,
  reason: string,
): { inserted: true; eventId: number; delta: number } | { inserted: false; existingDelta: number } {
  if (sourceUserId == null) {
    // Caller passed null; we require a non-null voter for daily-uniqueness. Fall back
    // to plain INSERT (no conflict can occur — partial index WHERE source_user_id IS NOT NULL).
    const id = addReputationEvent(chatId, targetUserId, null, delta, reason);
    return { inserted: true, eventId: id, delta };
  }

  const db = getDb();
  // Look up existing same-day vote FIRST to return its delta. The transaction
  // boundary around both this read and the INSERT below ensures atomicity —
  // see recordVoteTransaction() for the production path that uses both ops together.
  const existing = db
    .prepare(
      `SELECT delta FROM reputation_events
       WHERE chat_id = ? AND source_user_id = ? AND target_user_id = ?
         AND date(created_at) = date('now')
       ORDER BY id DESC LIMIT 1`,
    )
    .get(chatId, sourceUserId, targetUserId) as { delta: number } | undefined;

  if (existing) {
    return { inserted: false, existingDelta: Number(existing.delta) };
  }

  // No existing vote — INSERT with ON CONFLICT DO NOTHING as a safety net against
  // any race that slipped past the read above (e.g. another writer committed
  // between SELECT and INSERT in a hypothetical multi-writer scenario).
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO reputation_events
       (chat_id, target_user_id, source_user_id, delta, reason, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`,
  );
  const result = stmt.run(chatId, targetUserId, sourceUserId, delta, reason);
  if (result.changes === 0) {
    // UNIQUE conflict — another writer beat us. Re-read for the existing delta.
    const race = db
      .prepare(
        `SELECT delta FROM reputation_events
         WHERE chat_id = ? AND source_user_id = ? AND target_user_id = ?
           AND date(created_at) = date('now')
         ORDER BY id DESC LIMIT 1`,
      )
      .get(chatId, sourceUserId, targetUserId) as { delta: number } | undefined;
    return { inserted: false, existingDelta: Number(race?.delta ?? delta) };
  }
  return { inserted: true, eventId: Number(result.lastInsertRowid), delta };
}

export function getReputation(chatId: number, userId: number): number {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COALESCE(SUM(delta), 0) total FROM reputation_events WHERE chat_id = ? AND target_user_id = ?",
    )
    .get(chatId, userId);
  if (!isRecord(row)) {
    return 0;
  }
  return Number(row.total);
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
  return rows.filter(isRecord).map((row) => ({
    userId: Number(row.userId),
    reputation: Number(row.reputation),
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
    totalDelta: Number(row.total_delta),
    friendCount: Number(row.friend_count),
    foeCount: Number(row.foe_count),
  };
}

export function userExistsInChat(chatId: number, userId: number): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT 1 AS ok FROM users WHERE id = ? AND chat_id = ? LIMIT 1")
    .get(userId, chatId);
  return isRecord(row) && Number(row.ok) === 1;
}

// Voted today? Returns the delta of today's vote (1 friend, -1 foe) or null if none.
// Uses Telegram's "today" = last 24h to avoid TZ bugs at midnight boundary.
export function getTodaysVote(
  chatId: number,
  voterId: number,
  targetUserId: number,
): number | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT delta FROM reputation_events
       WHERE chat_id = ? AND source_user_id = ? AND target_user_id = ?
         AND created_at >= datetime('now', '-24 hours')
       ORDER BY id DESC LIMIT 1`,
    )
    .get(chatId, voterId, targetUserId);
  if (!isRecord(row)) return null;
  const d = Number(row.delta);
  return d === 0 ? null : d;
}

export function listVotedTargets24h(
  chatId: number,
  voterId: number,
): Array<{ targetUserId: number }> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT target_user_id FROM reputation_events
       WHERE chat_id = ? AND source_user_id = ?
         AND created_at >= datetime('now', '-24 hours')`,
    )
    .all(chatId, voterId);
  if (!rows || !Array.isArray(rows)) return [];
  return rows.filter(isRecord).map((row) => ({ targetUserId: Number(row.target_user_id) }));
}
