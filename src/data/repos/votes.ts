import type { Vote } from "../../core/types.js";
import { getDb } from "../db.js";

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

function isValidVoteStatus(val: unknown): val is Vote["status"] {
  return val === "active" || val === "passed" || val === "failed" || val === "expired";
}

function rowToVote(row: Record<string, unknown>): Vote {
  return {
    id: Number(row["id"]),
    chatId: Number(row["chat_id"]),
    type: typeof row["type"] === "string" ? row["type"] : "",
    targetUserId: typeof row["target_user_id"] === "number" ? row["target_user_id"] : null,
    initiatedBy: Number(row["initiated_by"]),
    status: isValidVoteStatus(row["status"]) ? row["status"] : "active",
    votesRequired: Number(row["votes_required"]),
    expiresAt: typeof row["expires_at"] === "string" ? row["expires_at"] : "",
    createdAt: typeof row["created_at"] === "string" ? row["created_at"] : "",
  };
}

export function createVote(
  chatId: number,
  type: string,
  targetUserId: number,
  initiatedBy: number,
  votesRequired: number,
  expiresAt: string,
): number {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO votes (chat_id, type, target_user_id, initiated_by, votes_required, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))",
  );
  const result = stmt.run(chatId, type, targetUserId, initiatedBy, votesRequired, expiresAt);
  return Number(result.lastInsertRowid);
}

export function getActiveVotes(chatId: number): Vote[] {
  const db = getDb();
  const rows = db
    .prepare(
      "SELECT * FROM votes WHERE chat_id = ? AND status = 'active' AND expires_at > datetime('now')",
    )
    .all(chatId);
  if (!rows || !Array.isArray(rows)) {
    return [];
  }
  return rows.filter(isRecord).map(rowToVote);
}

export function addVoteEntry(voteId: number, userId: number, choice: "yes" | "no"): boolean {
  const db = getDb();
  const stmt = db.prepare(
    "INSERT INTO vote_entries (vote_id, user_id, choice, created_at) VALUES (?, ?, ?, datetime('now'))",
  );
  try {
    stmt.run(voteId, userId, choice);
    return true;
  } catch {
    return false;
  }
}

export function getVoteCount(voteId: number, choice: "yes" | "no"): number {
  const db = getDb();
  const row = db
    .prepare("SELECT COUNT(*) count FROM vote_entries WHERE vote_id = ? AND choice = ?")
    .get(voteId, choice);
  if (!isRecord(row)) {
    return 0;
  }
  return Number(row["count"]);
}

export function hasUserVoted(voteId: number, userId: number): boolean {
  const db = getDb();
  const row = db
    .prepare("SELECT 1 FROM vote_entries WHERE vote_id = ? AND user_id = ?")
    .get(voteId, userId);
  return isRecord(row);
}

export function updateVoteStatus(voteId: number, status: "passed" | "failed"): void {
  const db = getDb();
  db.prepare("UPDATE votes SET status = ? WHERE id = ?").run(status, voteId);
}
