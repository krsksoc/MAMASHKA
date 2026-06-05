import { getUsersByChat, getUser } from "../data/repos/users.js";
import { getChatMessages } from "../data/repos/messages.js";

export interface UserStats {
  userId: number;
  username: string | null;
  displayName: string | null;
  messageCount: number;
  reputation: number;
}

export function getTopUsers(chatId: number, limit: number): UserStats[] {
  const users = getUsersByChat(chatId).slice(0, limit);
  return users.map((u) => ({
    userId: u.id,
    username: u.username,
    displayName: u.displayName,
    messageCount: u.messageCount,
    reputation: 0,
  }));
}

export function getStickerStats(chatId: number, limit: number): Array<{ emoji: string; count: number }> {
  const messages = getChatMessages(chatId, 5000);
  const counts = new Map<string, number>();
  for (const msg of messages) {
    if (msg.hasSticker && msg.stickerEmoji) {
      counts.set(msg.stickerEmoji, (counts.get(msg.stickerEmoji) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function getUserMessageCount(_chatId: number, userId: number): number {
  const user = getUser(userId);
  return user?.messageCount ?? 0;
}