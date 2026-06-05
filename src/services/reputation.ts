import { addReputationEvent, getReputation, getReputationRanking } from "../data/repos/reputation.js";
import { getUser } from "../data/repos/users.js";

export function voteFriend(chatId: number, targetUserId: number, sourceUserId: number | null): number {
  return addReputationEvent(chatId, targetUserId, sourceUserId, 1, "friend");
}

export function voteFoe(chatId: number, targetUserId: number, sourceUserId: number | null): number {
  return addReputationEvent(chatId, targetUserId, sourceUserId, -1, "foe");
}

export function getUserReputation(chatId: number, userId: number): number {
  return getReputation(chatId, userId);
}

export function getTopReputation(
  chatId: number,
  limit: number,
): Array<{ userId: number; displayName: string | null; username: string | null; reputation: number }> {
  const ranking = getReputationRanking(chatId, limit);
  return ranking.map((r) => {
    const user = getUser(r.userId);
    return {
      userId: r.userId,
      displayName: user?.displayName ?? null,
      username: user?.username ?? null,
      reputation: r.reputation,
    };
  });
}