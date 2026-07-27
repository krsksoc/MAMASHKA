import { getDb } from "../data/db.js";
import { getChatMessages } from "../data/repos/messages.js";
import { getUser, getUsersByChat } from "../data/repos/users.js";

export interface UserStats {
  userId: number;
  username: string | null;
  displayName: string | null;
  messageCount: number;
  reputation: number;
}

export interface ChatStats {
  totalUsers: number;
  totalMessages: number;
  messages24h: number;
  topUsers: UserStats[];
  topStickers: Array<{ emoji: string; count: number }>;
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

export function getStickerStats(
  chatId: number,
  limit: number,
): Array<{ emoji: string; count: number }> {
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

export function getChatStats(chatId: number): ChatStats {
  const db = getDb();

  // Total users
  const totalUsers =
    (
      db
        .prepare("SELECT COUNT(DISTINCT user_id) AS cnt FROM user_chats WHERE chat_id = ?")
        .get(chatId) as { cnt: number }
    )?.cnt ?? 0;

  // Total messages in chat
  const totalMessages =
    (
      db.prepare("SELECT COUNT(*) AS cnt FROM messages WHERE chat_id = ?").get(chatId) as {
        cnt: number;
      }
    )?.cnt ?? 0;

  // Messages in last 24h
  const yesterday = new Date(Date.now() - 86400000).toISOString();
  const messages24h =
    (
      db
        .prepare("SELECT COUNT(*) AS cnt FROM messages WHERE chat_id = ? AND created_at > ?")
        .get(chatId, yesterday) as { cnt: number }
    )?.cnt ?? 0;

  // Top users
  const topUsers = getTopUsers(chatId, 3);

  // Top stickers
  const topStickers = getStickerStats(chatId, 3);

  return { totalUsers, totalMessages, messages24h, topUsers, topStickers };
}
