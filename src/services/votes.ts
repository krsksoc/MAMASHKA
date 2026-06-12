import {
  addVoteEntry,
  createVote,
  getActiveVotes,
  getVoteCount,
  hasUserVoted,
  updateVoteStatus,
} from "../data/repos/votes.js";

export function startBanVote(chatId: number, targetUserId: number, initiatedBy: number): number {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
  return createVote(chatId, "ban", targetUserId, initiatedBy, 3, expiresAt);
}

export function castVote(voteId: number, userId: number, choice: "yes" | "no"): boolean {
  if (hasUserVoted(voteId, userId)) return false;
  return addVoteEntry(voteId, userId, choice);
}

export function checkVoteResolution(voteId: number): "pending" | "passed" | "failed" {
  const yes = getVoteCount(voteId, "yes");
  const no = getVoteCount(voteId, "no");
  if (yes >= 3) return "passed";
  if (no >= 3) return "failed";
  return "pending";
}

export function resolveVote(voteId: number, status: "passed" | "failed"): void {
  updateVoteStatus(voteId, status);
}

export function getActiveVoteForUser(chatId: number, targetUserId: number): number | null {
  const votes = getActiveVotes(chatId);
  for (const v of votes) {
    if (v.targetUserId === targetUserId) return v.id;
  }
  return null;
}
