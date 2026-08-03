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

export interface DailyActivity {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface EmojiStat {
  emoji: string;
  count: number;
}

export interface ChatActivityStats {
  days: DailyActivity[];
  totalMessages: number;
  myMessages: number;
  mySharePercent: number;
  topEmojis: EmojiStat[];
  myEmojis: EmojiStat[];
  peakDay: DailyActivity | null;
}

/**
 * Activity over the last N days for a chat (and optionally a user).
 * Returns [{ date: "2026-07-28", count: 47 }, ...]
 */
export function getChatActivity(
  chatId: number,
  days: number,
  userId?: number,
): DailyActivity[] {
  const db = getDb();
  const since = new Date(Date.now() - days * 86400000);
  const sinceStr = since.toISOString().slice(0, 10); // YYYY-MM-DD

  const sql = userId
    ? `SELECT date(created_at) AS day, COUNT(*) AS cnt
       FROM messages
       WHERE chat_id = ? AND user_id = ? AND date(created_at) >= ?
       GROUP BY day ORDER BY day ASC`
    : `SELECT date(created_at) AS day, COUNT(*) AS cnt
       FROM messages
       WHERE chat_id = ? AND date(created_at) >= ?
       GROUP BY day ORDER BY day ASC`;

  const rows = userId
    ? (db.prepare(sql).all(chatId, userId, sinceStr) as Array<{ day: string; cnt: number }>)
    : (db.prepare(sql).all(chatId, sinceStr) as Array<{ day: string; cnt: number }>);

  // Fill missing days with 0 so the sparkline is continuous.
  const map = new Map(rows.map((r) => [r.day, r.cnt]));
  const out: DailyActivity[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ date: d, count: map.get(d) ?? 0 });
  }
  return out;
}

/**
 * Count emojis in messages. Returns top N emoji+count.
 * Uses a regex over Unicode emoji ranges — fast enough for 1k-10k messages.
 */
export function getTopEmojis(
  chatId: number,
  limit: number,
  userId?: number,
): EmojiStat[] {
  const db = getDb();
  const sql = userId
    ? `SELECT text FROM messages WHERE chat_id = ? AND user_id = ? AND text IS NOT NULL ORDER BY id DESC LIMIT 5000`
    : `SELECT text FROM messages WHERE chat_id = ? AND text IS NOT NULL ORDER BY id DESC LIMIT 5000`;

  const rows = userId
    ? (db.prepare(sql).all(chatId, userId) as Array<{ text: string | null }>)
    : (db.prepare(sql).all(chatId) as Array<{ text: string | null }>);

  // Match emoji presentation chars (rough — covers most common ranges).
  // Avoids surrogate-pair splitting by matching per-codepoint clusters.
  const emojiRe = /\p{Extended_Pictographic}/gu;
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.text) continue;
    const matches = r.text.match(emojiRe);
    if (!matches) continue;
    for (const m of matches) {
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .map(([emoji, count]) => ({ emoji, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function getChatActivityStats(
  chatId: number,
  days: number,
  userId: number,
): ChatActivityStats {
  const myDays = getChatActivity(chatId, days, userId);
  const allDays = getChatActivity(chatId, days);
  const totalMessages = allDays.reduce((s, d) => s + d.count, 0);
  const myMessages = myDays.reduce((s, d) => s + d.count, 0);
  const mySharePercent =
    totalMessages > 0 ? Math.round((myMessages / totalMessages) * 1000) / 10 : 0;

  const peakDay =
    allDays.length > 0
      ? allDays.reduce((max, d) => (d.count > max.count ? d : max), allDays[0]!)
      : null;

  return {
    days: myDays.length > 0 ? myDays : allDays,
    totalMessages,
    myMessages,
    mySharePercent,
    topEmojis: getTopEmojis(chatId, 5),
    myEmojis: getTopEmojis(chatId, 5, userId),
    peakDay: peakDay && peakDay.count > 0 ? peakDay : null,
  };
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
