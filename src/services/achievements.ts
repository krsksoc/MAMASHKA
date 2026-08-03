// Achievements system for @mamoolyaBot.
//
// 16 achievements across 3 tiers:
//   - Tier A (basic):  always notify to user (in /achievements list), never to chat
//   - Tier B (premium): notify to chat (throttled, opt-out)
//   - Tier S (special): notify to chat immediately on unlock
//
// Only /krsk soc (KRSK_SOC_CHAT_ID) is tracked. Маменькины сынки (dev) is
// excluded by `isTrackedChat()`.
//
// Conditions:
//   - All conditions are PURE reads over data.db + user_achievements table
//   - Returns { unlocked: Achievement[], locked: Achievement[] } for UI display
//   - For locked ones, returns current progress (current, target)

import type { Database } from "bun:sqlite";
import { getDb } from "../data/db.js";

// === Config ===

/** Production chat — achievements are recorded here only. */
export const KRSK_SOC_CHAT_ID = -1001108346327;

export const NOTIFY_BUCKET_CAPACITY = 5;
export const NOTIFY_REFILL_MS = 60_000;
const tokenBuckets = new Map<string, { tokens: number; resetAt: number }>();

function takeToken(key: string): { ok: boolean; retrySec: number } {
  const now = Date.now();
  let bucket = tokenBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { tokens: NOTIFY_BUCKET_CAPACITY, resetAt: now + NOTIFY_REFILL_MS };
    tokenBuckets.set(key, bucket);
  }
  if (bucket.tokens > 0) {
    bucket.tokens--;
    return { ok: true, retrySec: 0 };
  }
  return { ok: false, retrySec: Math.ceil((bucket.resetAt - now) / 1000) };
}

export function checkEvaluateRate(userId: number): { ok: boolean; retrySec: number } {
  return takeToken(`evaluate:${userId}`);
}

/** Only /krsk soc tracks achievements. Dev chats (e.g. Маменькины сынки) are excluded. */
export function isTrackedChat(chatId: number): boolean {
  return chatId === KRSK_SOC_CHAT_ID;
}

// === Types ===

export type AchievementTier = "A" | "B" | "S";

export type AchievementCategory = "activity" | "social" | "lore";

/** Display order and metadata for the 3 category buttons under /achievements. */
export const ACHIEVEMENT_CATEGORIES: ReadonlyArray<{
  id: AchievementCategory;
  icon: string;
  title: string;
}> = [
  { id: "activity", icon: "📊", title: "Активность" },
  { id: "social", icon: "💞", title: "Социальные" },
  { id: "lore", icon: "💬", title: "Стиль и лор" },
];

/** Mapping from achievement id → category. */
const ACHIEVEMENT_CATEGORY: Record<string, AchievementCategory> = {
  // Activity
  first_word: "activity",
  chatterbox: "activity",
  voice: "activity",
  megaphone: "activity",
  voice_of_krasnoyarsk: "activity",
  night_owl: "activity",
  early_bird: "activity",
  streak_3: "activity",
  streak_7: "activity",
  // Social
  friendly: "social",
  soul_of_chat: "social",
  judge: "social",
  mutual_sympathy: "social",
  authority: "social",
  first_swipe: "social",
  // Style & lore
  emoji_master: "lore",
  said_ishak: "lore",
  said_doska: "lore",
  said_zalupoches: "lore",
  said_do_otkaza: "lore",
  said_balahta: "lore",
  said_femtselki: "lore",
};

export function getAchievementCategory(id: string): AchievementCategory {
  return ACHIEVEMENT_CATEGORY[id] ?? "activity";
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  desc: string;
  tier: AchievementTier;
  /** Returns true if user qualifies. Called with chat_id, user_id. */
  check: (db: Database, chatId: number, userId: number) => boolean;
  /** Optional: progress for locked achievements. */
  progress?: (db: Database, chatId: number, userId: number) => {
    current: number;
    target: number;
  };
}

export interface AchievementWithStatus {
  id: string;
  icon: string;
  title: string;
  desc: string;
  tier: AchievementTier;
  unlocked: boolean;
  unlockedAt: string | null;
  progress: { current: number; target: number } | null;
}

// === Helpers ===

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

function countMessages(db: Database, chatId: number, userId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) c FROM messages WHERE chat_id = ? AND user_id = ?")
    .get(chatId, userId);
  return isRecord(row) ? Number(row.c) : 0;
}

function countFriendVotes(db: Database, chatId: number, userId: number): number {
  const row = db
    .prepare(
      "SELECT COUNT(*) c FROM reputation_events WHERE chat_id = ? AND target_user_id = ? AND delta > 0",
    )
    .get(chatId, userId);
  return isRecord(row) ? Number(row.c) : 0;
}

function countDistinctVotesGiven(db: Database, chatId: number, userId: number): number {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT target_user_id) c
       FROM reputation_events
       WHERE chat_id = ? AND source_user_id = ?`,
    )
    .get(chatId, userId);
  return isRecord(row) ? Number(row.c) : 0;
}

function countEmojis(db: Database, chatId: number, userId: number): number {
  // Count emoji-like characters in messages.text via Unicode ranges.
  // Approx: \p{Extended_Pictographic} but SQLite without ICU just uses regex on
  // a curated emoji subset — we count bytes that look like emoji codepoints.
  const row = db
    .prepare(
      `SELECT text FROM messages WHERE chat_id = ? AND user_id = ? AND text IS NOT NULL`,
    )
    .all(chatId, userId);
  if (!Array.isArray(row)) return 0;
  let total = 0;
  // Emoji ranges: 0x1F300-0x1FAFF (symbols+pictographic), 0x2600-0x27BF (misc symbols)
  // 0x1F000-0x1F1FF (mahjong/playing), 0xFE0F (variation selector)
  const emojiRe = /[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}]/gu;
  for (const r of row) {
    if (!isRecord(r) || typeof r.text !== "string") continue;
    const matches = r.text.match(emojiRe);
    if (matches) total += matches.length;
  }
  return total;
}

function countNightMessages(db: Database, chatId: number, userId: number): {
  night: number;
  total: number;
} {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) total,
         COUNT(CASE WHEN CAST(strftime('%H', created_at) AS INTEGER) >= 23
                     OR CAST(strftime('%H', created_at) AS INTEGER) < 6
                    THEN 1 END) night
       FROM messages
       WHERE chat_id = ? AND user_id = ?`,
    )
    .get(chatId, userId);
  if (!isRecord(row)) return { night: 0, total: 0 };
  return { night: Number(row.night), total: Number(row.total) };
}

function countMorningMessages(db: Database, chatId: number, userId: number): {
  morning: number;
  total: number;
} {
  const row = db
    .prepare(
      `SELECT
         COUNT(*) total,
         COUNT(CASE WHEN CAST(strftime('%H', created_at) AS INTEGER) >= 6
                     AND CAST(strftime('%H', created_at) AS INTEGER) < 10
                    THEN 1 END) morning
       FROM messages
       WHERE chat_id = ? AND user_id = ?`,
    )
    .get(chatId, userId);
  if (!isRecord(row)) return { morning: 0, total: 0 };
  return { morning: Number(row.morning), total: Number(row.total) };
}

// (maxStreakDays omitted — we only track current streak ending today/yesterday)

function currentStreakDays(db: Database, chatId: number, userId: number): number {
  // Streak ending today (UTC) or yesterday (UTC) — if yesterday only, still counts as active.
  const rows = db
    .prepare(
      `SELECT DISTINCT date(created_at) d
       FROM messages
       WHERE chat_id = ? AND user_id = ?
       ORDER BY d DESC
       LIMIT 30`,
    )
    .all(chatId, userId);
  if (!Array.isArray(rows) || rows.length === 0) return 0;
  let streak = 0;
  let expected: string;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const yesterdayMs = today.getTime() - 24 * 60 * 60 * 1000;
  const yesterdayStr = new Date(yesterdayMs).toISOString().slice(0, 10);
  const first = isRecord(rows[0]) && typeof rows[0].d === "string" ? rows[0].d : null;
  if (first === todayStr) {
    expected = todayStr;
  } else if (first === yesterdayStr) {
    expected = yesterdayStr;
  } else {
    return 0;
  }
  for (const r of rows) {
    if (!isRecord(r) || typeof r.d !== "string") break;
    if (r.d === expected) {
      streak += 1;
      const nextMs = Date.parse(`${expected}T00:00:00Z`) - 24 * 60 * 60 * 1000;
      expected = new Date(nextMs).toISOString().slice(0, 10);
    } else {
      break;
    }
  }
  return streak;
}

function isMutualFriend(db: Database, chatId: number, userId: number): boolean {
  // True if at least one other user has both given a friend vote to userId
  // AND userId has given a friend vote to them.
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT a.source_user_id) c
       FROM reputation_events a
       INNER JOIN reputation_events b
         ON a.chat_id = b.chat_id
         AND a.source_user_id = b.target_user_id
         AND a.target_user_id = b.source_user_id
       WHERE a.chat_id = ?
         AND a.target_user_id = ?
         AND a.delta > 0
         AND b.delta > 0`,
    )
    .get(chatId, userId);
  return isRecord(row) ? Number(row.c) > 0 : false;
}

function isInTopReputation(
  db: Database,
  chatId: number,
  userId: number,
  topN: number,
): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS rank FROM (
         SELECT target_user_id, SUM(delta) rep
         FROM reputation_events
         WHERE chat_id = ?
         GROUP BY target_user_id
         HAVING rep > COALESCE(
           (SELECT SUM(delta) FROM reputation_events
            WHERE chat_id = ? AND target_user_id = ?), 0
         )
       )`,
    )
    .get(chatId, chatId, userId);
  if (!isRecord(row)) return false;
  return Number(row.rank) < topN;
}

function userIsInChat(db: Database, chatId: number, userId: number): boolean {
  const row = db
    .prepare("SELECT 1 AS ok FROM users WHERE id = ? AND chat_id = ? LIMIT 1")
    .get(userId, chatId);
  return isRecord(row) && Number(row.ok) === 1;
}

function hasGivenAnyWebappVote(db: Database, chatId: number, userId: number): boolean {
  // Webapp-votes go via /reputation/vote, same table as webapp_votes; source_user_id populated.
  // Tier A: counted if user has any webapp_vote source (current schema: reputation_events with source).
  const row = db
    .prepare(
      `SELECT COUNT(*) c FROM reputation_events
       WHERE chat_id = ? AND source_user_id = ?`,
    )
    .get(chatId, userId);
  return isRecord(row) ? Number(row.c) > 0 : false;
}

function hasBeenVotedOn(db: Database, chatId: number, userId: number): boolean {
  const row = db
    .prepare(
      `SELECT COUNT(*) c FROM reputation_events
       WHERE chat_id = ? AND target_user_id = ?`,
    )
    .get(chatId, userId);
  return isRecord(row) ? Number(row.c) > 0 : false;
}

/** Count messages by user in chat that contain any of `keywords` as a whole word (case-insensitive).
 * Word boundary = whitespace, string start, or string end.
 * Use multiple keyword forms to catch inflections (e.g. доска, доски, доску).
 */
function countKeywordOccurrences(
  db: Database,
  chatId: number,
  userId: number,
  keywords: string[],
): number {
  if (keywords.length === 0) return 0;
  // Escape SQL LIKE wildcards inside each keyword
  const escaped = keywords
    .map((k) => k.trim().toLowerCase())
    .filter((k) => k.length > 0)
    .map((k) => k.replace(/[\\%_]/g, (c) => `\\${c}`));
  if (escaped.length === 0) return 0;

  // Build OR conditions for each form
  const conds: string[] = [];
  const params: string[] = [];
  for (const e of escaped) {
    const padded = ` %${e}% `;
    conds.push(`' ' || LOWER(text) || ' ' LIKE ? ESCAPE '\\'`);
    params.push(padded);
  }

  const sql = `SELECT COUNT(*) c FROM messages
       WHERE chat_id = ? AND user_id = ? AND text IS NOT NULL
         AND (${conds.join(" OR ")})`;

  const row = db.prepare(sql).get(chatId, userId, ...params);
  return isRecord(row) ? Number(row.c) : 0;
}

function makeKeywordAchievement(
  id: string,
  icon: string,
  title: string,
  wordForms: string[],
  target = 10,
  tier: AchievementTier = "A",
): Achievement {
  const displayKw = wordForms[0] ?? "";
  return {
    id,
    icon,
    title,
    desc: `Сказал «${displayKw}» ${target} раз (в любом падеже)`,
    tier,
    check: (db, chatId, userId) =>
      countKeywordOccurrences(db, chatId, userId, wordForms) >= target,
    progress: (db, chatId, userId) => ({
      current: Math.min(countKeywordOccurrences(db, chatId, userId, wordForms), target),
      target,
    }),
  };
}

// === Achievements ===

export const ACHIEVEMENTS: Achievement[] = [
  // --- Tier A (basic; never post to chat) ---
  {
    id: "first_word",
    icon: "🌱",
    title: "Первое слово",
    desc: "Отправил своё первое сообщение в чате",
    tier: "A",
    check: (db, chatId, userId) => countMessages(db, chatId, userId) >= 1,
    progress: (db, chatId, userId) => ({
      current: Math.min(countMessages(db, chatId, userId), 1),
      target: 1,
    }),
  },
  {
    id: "chatterbox",
    icon: "💬",
    title: "Болтун",
    desc: "100 сообщений в чате",
    tier: "A",
    check: (db, chatId, userId) => countMessages(db, chatId, userId) >= 100,
    progress: (db, chatId, userId) => ({
      current: countMessages(db, chatId, userId),
      target: 100,
    }),
  },
  {
    id: "voice",
    icon: "🗣",
    title: "Заводной",
    desc: "1 000 сообщений в чате",
    tier: "A",
    check: (db, chatId, userId) => countMessages(db, chatId, userId) >= 1000,
    progress: (db, chatId, userId) => ({
      current: countMessages(db, chatId, userId),
      target: 1000,
    }),
  },
  {
    id: "night_owl",
    icon: "🌙",
    title: "Ночная сова",
    desc: "30%+ сообщений между 23:00 и 06:00",
    tier: "A",
    check: (db, chatId, userId) => {
      const n = countNightMessages(db, chatId, userId);
      return n.total >= 30 && n.night / n.total >= 0.3;
    },
    progress: (db, chatId, userId) => {
      const n = countNightMessages(db, chatId, userId);
      const pct = n.total === 0 ? 0 : Math.round((n.night / n.total) * 100);
      return { current: pct, target: 30 };
    },
  },
  {
    id: "early_bird",
    icon: "☕",
    title: "Ранняя пташка",
    desc: "30%+ сообщений между 06:00 и 10:00",
    tier: "A",
    check: (db, chatId, userId) => {
      const m = countMorningMessages(db, chatId, userId);
      return m.total >= 30 && m.morning / m.total >= 0.3;
    },
    progress: (db, chatId, userId) => {
      const m = countMorningMessages(db, chatId, userId);
      const pct = m.total === 0 ? 0 : Math.round((m.morning / m.total) * 100);
      return { current: pct, target: 30 };
    },
  },
  {
    id: "friendly",
    icon: "💚",
    title: "Дружелюбный",
    desc: "Получил 10 «friend» голосов",
    tier: "A",
    check: (db, chatId, userId) => countFriendVotes(db, chatId, userId) >= 10,
    progress: (db, chatId, userId) => ({
      current: countFriendVotes(db, chatId, userId),
      target: 10,
    }),
  },
  {
    id: "first_swipe",
    icon: "🎴",
    title: "Первый свайп",
    desc: "Проголосовал через webapp",
    tier: "A",
    check: (db, chatId, userId) => hasGivenAnyWebappVote(db, chatId, userId),
    progress: (db, chatId, userId) => ({
      current: hasGivenAnyWebappVote(db, chatId, userId) ? 1 : 0,
      target: 1,
    }),
  },
  // --- Tier B (premium; throttled chat notification) ---
  {
    id: "megaphone",
    icon: "📢",
    title: "Мегафон",
    desc: "10 000 сообщений в чате",
    tier: "B",
    check: (db, chatId, userId) => countMessages(db, chatId, userId) >= 10000,
    progress: (db, chatId, userId) => ({
      current: countMessages(db, chatId, userId),
      target: 10000,
    }),
  },
  {
    id: "streak_3",
    icon: "🔥",
    title: "Три дня в огне",
    desc: "Сообщения 3 дня подряд (текущая серия)",
    tier: "B",
    check: (db, chatId, userId) => currentStreakDays(db, chatId, userId) >= 3,
    progress: (db, chatId, userId) => ({
      current: currentStreakDays(db, chatId, userId),
      target: 3,
    }),
  },
  {
    id: "soul_of_chat",
    icon: "💚💚",
    title: "Душа компании",
    desc: "Получил 50 «friend» голосов",
    tier: "B",
    check: (db, chatId, userId) => countFriendVotes(db, chatId, userId) >= 50,
    progress: (db, chatId, userId) => ({
      current: countFriendVotes(db, chatId, userId),
      target: 50,
    }),
  },
  {
    id: "judge",
    icon: "⚖️",
    title: "Судья",
    desc: "Проголосовал за 50 разных юзеров",
    tier: "B",
    check: (db, chatId, userId) => countDistinctVotesGiven(db, chatId, userId) >= 50,
    progress: (db, chatId, userId) => ({
      current: countDistinctVotesGiven(db, chatId, userId),
      target: 50,
    }),
  },
  {
    id: "emoji_master",
    icon: "😏",
    title: "Эмодзи-мастер",
    desc: "Отправил 500 эмодзи",
    tier: "B",
    check: (db, chatId, userId) => countEmojis(db, chatId, userId) >= 500,
    progress: (db, chatId, userId) => ({
      current: countEmojis(db, chatId, userId),
      target: 500,
    }),
  },
  // --- Tier S (special; post to chat immediately) ---
  {
    id: "voice_of_krasnoyarsk",
    icon: "🎙",
    title: "Голос Красноярска",
    desc: "50 000 сообщений в чате",
    tier: "S",
    check: (db, chatId, userId) => countMessages(db, chatId, userId) >= 50000,
    progress: (db, chatId, userId) => ({
      current: countMessages(db, chatId, userId),
      target: 50000,
    }),
  },
  {
    id: "streak_7",
    icon: "🔥🔥",
    title: "Неделя в огне",
    desc: "Сообщения 7 дней подряд (текущая серия)",
    tier: "S",
    check: (db, chatId, userId) => currentStreakDays(db, chatId, userId) >= 7,
    progress: (db, chatId, userId) => ({
      current: currentStreakDays(db, chatId, userId),
      target: 7,
    }),
  },
  {
    id: "mutual_sympathy",
    icon: "🌹",
    title: "Взаимная симпатия",
    desc: "Кто-то и тебя friend, и ты его friend",
    tier: "S",
    check: (db, chatId, userId) => {
      // Both must have at least one reputation event for this to make sense.
      if (!hasBeenVotedOn(db, chatId, userId)) return false;
      return isMutualFriend(db, chatId, userId);
    },
    progress: (db, chatId, userId) => ({
      current: isMutualFriend(db, chatId, userId) ? 1 : 0,
      target: 1,
    }),
  },
  {
    id: "authority",
    icon: "🏆",
    title: "Авторитет",
    desc: "Твоя репутация в топ-5 чата",
    tier: "S",
    check: (db, chatId, userId) => {
      if (!userIsInChat(db, chatId, userId)) return false;
      return isInTopReputation(db, chatId, userId, 5);
    },
    progress: (db, chatId, userId) => ({
      current: isInTopReputation(db, chatId, userId, 5) ? 1 : 0,
      target: 1,
    }),
  },
  // --- Local lore (Tier A; basic, no chat notification) ---
  // Each entry lists the canonical word + its inflected forms (падежи).
  makeKeywordAchievement("said_ishak", "🫏", "Ишак", ["ишак", "ишака", "ишаку", "ишаком", "ишаки", "ишаков", "ишакам", "ишаками", "ишаках"]),
  makeKeywordAchievement("said_doska", "🪵", "Доска", ["доска", "доски", "доску", "доской", "доскою", "доске", "доски", "досок", "доскам", "досками", "досках"]),
  makeKeywordAchievement("said_zalupoches", "🌀", "Залупочес", ["залупочес", "залупочеса", "залупочесу", "залупочесом", "залупочесы", "залупочесов", "залупочесам", "залупочесами", "залупочесах"]),
  makeKeywordAchievement("said_do_otkaza", "💥", "До отказа", ["до отказа"]),
  makeKeywordAchievement("said_balahta", "🍺", "Балахта", ["балахта", "балахты", "балахте", "балахту", "балахтой", "балахтою", "балахте", "балахтенский", "балахтенская", "балахтинский"]),
  // «Фемцелка» — неологизм от «фемочка». Покрываем все падежи + короткую форму «фемочка».
  // Иконка 🌸 — символ весны/девочки; вписывается в ряд с 🍺/🫏/🪵/🌀.
  makeKeywordAchievement("said_femtselki", "🌸", "Фемцелка", [
    "фемцелка", "фемцелки", "фемцелке", "фемцелку", "фемцелкой", "фемцелкою",
    "фемцелок", "фемцелкам", "фемцелками", "фемцелках",
    "фемочка", "фемочки", "фемочке", "фемочку", "фемочкой", "фемочкою",
    "фемочек", "фемочкам", "фемочками", "фемочках",
  ]),
];

// === Persistence ===

export function getUnlockedIds(
  db: Database,
  chatId: number,
  userId: number,
): Map<string, string> {
  const rows = db
    .prepare(
      `SELECT achievement_id, unlocked_at FROM user_achievements
       WHERE chat_id = ? AND user_id = ?`,
    )
    .all(chatId, userId);
  const out = new Map<string, string>();
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (isRecord(r) && typeof r.achievement_id === "string") {
        out.set(r.achievement_id, String(r.unlocked_at ?? ""));
      }
    }
  }
  return out;
}

export function insertUnlocked(
  db: Database,
  chatId: number,
  userId: number,
  achievementId: string,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO user_achievements (chat_id, user_id, achievement_id)
     VALUES (?, ?, ?)`,
  ).run(chatId, userId, achievementId);
}

export function markNotified(
  db: Database,
  chatId: number,
  userId: number,
  achievementId: string,
): void {
  db.prepare(
    `UPDATE user_achievements SET notified_at = datetime('now')
     WHERE chat_id = ? AND user_id = ? AND achievement_id = ?`,
  ).run(chatId, userId, achievementId);
}

// === Main entrypoints ===

export interface EvaluationResult {
  /** Newly unlocked achievements (since last call). */
  unlockedNow: Achievement[];
  /** All unlocked achievements for user. */
  allUnlocked: AchievementWithStatus[];
  /** Locked achievements with progress. */
  locked: AchievementWithStatus[];
}

export function evaluateForUser(
  chatId: number,
  userId: number,
): EvaluationResult {
  if (!isTrackedChat(chatId)) {
    return { unlockedNow: [], allUnlocked: [], locked: [] };
  }
  const db = getDb();
  const unlockedMap = getUnlockedIds(db, chatId, userId);

  const unlockedNow: Achievement[] = [];
  for (const ach of ACHIEVEMENTS) {
    if (unlockedMap.has(ach.id)) continue;
    try {
      if (ach.check(db, chatId, userId)) {
        insertUnlocked(db, chatId, userId, ach.id);
        unlockedMap.set(ach.id, new Date().toISOString());
        unlockedNow.push(ach);
      }
    } catch (e) {
      console.error(`[ACH] check failed for ${ach.id}:`, e);
    }
  }

  const allUnlocked: AchievementWithStatus[] = [];
  const locked: AchievementWithStatus[] = [];
  for (const ach of ACHIEVEMENTS) {
    const unlockedAt = unlockedMap.get(ach.id) ?? null;
    const item: AchievementWithStatus = {
      id: ach.id,
      icon: ach.icon,
      title: ach.title,
      desc: ach.desc,
      tier: ach.tier,
      unlocked: unlockedAt !== null,
      unlockedAt,
      progress: null,
    };
    if (unlockedAt) {
      allUnlocked.push(item);
    } else {
      const progress = ach.progress
        ? safeProgress(ach.progress, db, chatId, userId)
        : null;
      locked.push({ ...item, progress });
    }
  }
  locked.sort((a, b) => {
    // Sort locked by progress percent desc (closest to unlock first)
    const ap = a.progress ? a.progress.current / a.progress.target : 0;
    const bp = b.progress ? b.progress.current / b.progress.target : 0;
    return bp - ap;
  });

  return { unlockedNow, allUnlocked, locked };
}

function safeProgress(
  fn: NonNullable<Achievement["progress"]>,
  db: Database,
  chatId: number,
  userId: number,
): { current: number; target: number } | null {
  try {
    const r = fn(db, chatId, userId);
    if (r && typeof r.current === "number" && typeof r.target === "number") {
      return r;
    }
    return null;
  } catch (e) {
    console.error(`[ACH] progress failed:`, e);
    return null;
  }
}

// === Throttling for chat notifications ===

export interface NotifyDecision {
  /** True if chat notification should be sent right now (Tier B/S). */
  shouldPostToChat: boolean;
  /** True if we already posted about this user today (any Tier B/S). */
  alreadyPostedToday: boolean;
  /** Hours until next allowed post for this user (UTC). */
  retryInHours: number;
}

export function decideNotify(
  chatId: number,
  userId: number,
): NotifyDecision {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT MAX(posted_at) last_posted
       FROM achievement_notifications
       WHERE chat_id = ? AND user_id = ?
         AND posted_at > datetime('now', '-1 day')`,
    )
    .get(chatId, userId);
  const alreadyPostedToday = isRecord(row) && row.last_posted != null;
  const retryInHours = alreadyPostedToday ? 24 : 0;
  return {
    shouldPostToChat: true,
    alreadyPostedToday,
    retryInHours,
  };
}

export function recordNotification(
  chatId: number,
  userId: number,
  achievementIds: string[],
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO achievement_notifications (chat_id, user_id, achievements_json)
     VALUES (?, ?, ?)`,
  ).run(chatId, userId, JSON.stringify(achievementIds));
}

export function getSetting(
  chatId: number,
  userId: number,
  key: string,
): string | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT value FROM user_settings
       WHERE chat_id = ? AND user_id = ? AND key = ?`,
    )
    .get(chatId, userId, key);
  return isRecord(row) && typeof row.value === "string" ? row.value : null;
}

export function setSetting(
  chatId: number,
  userId: number,
  key: string,
  value: string,
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO user_settings (chat_id, user_id, key, value, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(chat_id, user_id, key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`,
  ).run(chatId, userId, key, value);
}

/** True if user wants chat notifications about their achievements. Default true. */
export function notifyInChatEnabled(chatId: number, userId: number): boolean {
  const v = getSetting(chatId, userId, "notify_in_chat");
  if (v === null) return true;
  return v === "1";
}
