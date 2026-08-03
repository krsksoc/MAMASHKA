import type { Context, Next } from "hono";
import { Hono } from "hono";
import { getConfig } from "../../core/config.js";
import { deleteMyAnon, getMyAnons, insertAnonMessage } from "../../data/repos/anon.js";
import { getRandomQuote } from "../../data/repos/quotes.js";
import { getActiveUsers, getUser, getUserByTelegramId } from "../../data/repos/users.js";
import {
  addReputationEventIfAbsent,
  getReputationSummary,
  listVotedTargets24h,
  userExistsInChat,
} from "../../data/repos/reputation.js";
import { getUserChatsByTelegramId } from "../../data/repos/user_chats.js";
import { KRSK_SOC_CHAT_ID, evaluateForUser } from "../../services/achievements.js";
import { getTopUsers, getUserMessageCount, getChatActivityStats, getTopEmojis } from "../../services/stats.js";
import { getDb } from "../../data/db.js";
import { validateInitData } from "./auth.js";
import { anonSendSchema, voteSchema } from "./schemas.js";

const app = new Hono();

// Token bucket per-voter for /reputation/vote and /anon/send — basic spam shield.
const tokenBuckets = new Map<string, { tokens: number; resetAt: number }>();
const TOKEN_BUCKET_CAPACITY = 5;
const TOKEN_BUCKET_REFILL_MS = 60_000;
const ANON_BUCKET_CAPACITY = 3;

function takeToken(key: string, capacity: number): { ok: boolean; retrySec: number } {
  const now = Date.now();
  let bucket = tokenBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { tokens: capacity, resetAt: now + TOKEN_BUCKET_REFILL_MS };
    tokenBuckets.set(key, bucket);
  }
  if (bucket.tokens > 0) {
    bucket.tokens--;
    return { ok: true, retrySec: 0 };
  }
  return { ok: false, retrySec: Math.ceil((bucket.resetAt - now) / 1000) };
}

interface AuthContext {
  userId: number;
  telegramId: number;
  firstName: string;
  username: string | undefined;
  /**
   * Chat ID from validated initData.chat field, if Telegram included it.
   * - When non-null: WebApp was launched from this specific chat. Routes can
   *   enforce that any chat_id query param matches this value to prevent
   *   cross-chat data access via replayed/crafted initData.
   * - When null: launched from menu button / direct link; routes fall back
   *   to a per-user allow-list (user_chats membership + KRSK_SOC_CHAT_ID).
   */
  initDataChatId: number | null;
}

/**
 * Enforce chat scope consistency between query param and validated initData.
 * - If initData has `chat.id` set, the route's chat_id MUST match it. Otherwise: 403.
 * - If initData.chat.id is null (menu button launch), fall back to checking
 *   the user is actually a member of the requested chat (via user_chats).
 * - Chatless endpoints (e.g. /chats) skip this check.
 *
 * Returns the parsed chat_id on success, or a Response on failure.
 */
function enforceChatScope(
  c: Context,
  auth: AuthContext,
  requestedChatId: number | null,
): { ok: true; chatId: number } | { ok: false; response: Response } {
  if (requestedChatId === null || requestedChatId === 0) {
    return {
      ok: false,
      response: c.json({ error: "chat_id required" }, 400) as Response,
    };
  }

  if (auth.initDataChatId !== null) {
    // Strict mode: initData.chat must match requested chat_id.
    if (auth.initDataChatId !== requestedChatId) {
      console.error(
        `[AUTH] chat_id mismatch: initData.chat.id=${auth.initDataChatId}, requested=${requestedChatId}, telegramId=${auth.telegramId}`,
      );
      return {
        ok: false,
        response: c.json(
          { error: "chat_id_mismatch", expected: auth.initDataChatId },
          403,
        ) as Response,
      };
    }
    return { ok: true, chatId: requestedChatId };
  }

  // Permissive mode: no initData.chat field (menu button launch).
  // Allow if: KRSK_SOC_CHAT_ID, OR user is a member of this chat per user_chats.
  if (requestedChatId === KRSK_SOC_CHAT_ID) {
    return { ok: true, chatId: requestedChatId };
  }

  const userChats = getUserChatsByTelegramId(auth.telegramId);
  const memberOf = userChats.some((ch) => ch.chat_id === requestedChatId);
  if (!memberOf) {
    console.error(
      `[AUTH] chat_id ${requestedChatId} not in user_chats for telegramId=${auth.telegramId}`,
    );
    return {
      ok: false,
      response: c.json({ error: "not_a_member" }, 403) as Response,
    };
  }
  return { ok: true, chatId: requestedChatId };
}

function authUser(c: Context): AuthContext | null {
  const initData = c.req.header("x-init-data");
  if (!initData) {
    console.error("[AUTH] No x-init-data header");
    return null;
  }
  // Diagnostic: log the keys we receive so we can spot mismatches with the reference impl.
  const peekKeys = initData
    .split("&")
    .map((p) => p.split("=")[0] ?? "")
    .filter(Boolean)
    .sort()
    .join(",");
  console.error(`[AUTH] initData len=${initData.length} keys=[${peekKeys}]`);

  const config = getConfig();
  const user = validateInitData(initData, config.BOT_TOKEN);
  if (!user) {
    // Log the raw first 300 chars so we can see if it's URL-encoded, decoded, truncated, etc.
    console.error(
      `[AUTH] validateInitData failed. Peek: ${JSON.stringify(initData.slice(0, 300))}`,
    );
    return null;
  }
  return {
    userId: 0,
    telegramId: user.id,
    firstName: user.first_name,
    username: user.username,
    initDataChatId: user.chat_id,
  };
}

// Diagnostic endpoint — registered BEFORE the auth middleware so it works
// even when initData is missing. Returns the received initData state so we
// can diagnose why TWA requests come through empty.
//
// Security: gated behind NODE_ENV !== "production" to prevent log poisoning
// in production. The endpoint logs UA/platform info to stdout; an unauthenticated
// public endpoint can be used by attackers to flood logs with arbitrary content.
app.post("/__diag__", async (c) => {
  if (process.env.NODE_ENV === "production") {
    return c.json({ ok: true });
  }
  const initData = c.req.header("x-init-data") ?? "";
  let body: Record<string, unknown> = {};
  try {
    body = await c.req.json();
  } catch {
    // empty body is fine
  }
  // IMPORTANT: never log full initData or `href` (which contains tgWebAppData hash).
  // Only metadata that's safe to log.
  console.error(
    `[DIAG] ua=${String(body["ua"] ?? "").slice(0, 80)} platform=${body["platform"]} ver=${body["version"]} hasTg=${body["hasTg"]} initDataLen=${body["initDataLen"]} path=${body["path"]} headerLen=${initData.length}`,
  );
  return c.json({ ok: true });
});

app.use(async (c: Context, next: Next): Promise<Response | undefined> => {
  const auth = authUser(c);
  if (auth === null) {
    c.status(401);
    return c.json({ error: "Unauthorized" });
  }
  (c as unknown as Record<string, unknown>)["__auth"] = auth;
  await next();
  return undefined;
});

function getAuth(c: Context): AuthContext {
  return (c as unknown as Record<string, unknown>)["__auth"] as AuthContext;
}

// Get user's chats
app.get("/chats", (c) => {
  const auth = getAuth(c);
  const chats = getUserChatsByTelegramId(auth.telegramId);
  return c.json({ chats });
});

// Get user stats for a chat
app.get("/stats", (c) => {
  const auth = getAuth(c);
  const scope = enforceChatScope(c, auth, parseInt(c.req.query("chat_id") ?? "0", 10));
  if (!scope.ok) return scope.response;
  const chatId = scope.chatId;

  const user = getUserByTelegramId(auth.telegramId, chatId);
  if (!user) return c.json({ error: "User not found in chat" }, 404);

  const reputation = getReputationSummary(chatId, user.id);
  const messages = getUserMessageCount(chatId, user.id);
  const db = getDb();

  // ── Additional stats ──
  // Avg message length (chars)
  const avgLen = (db
    .prepare(
      `SELECT COALESCE(AVG(LENGTH(text)), 0) AS avg_len
       FROM messages
       WHERE user_id = ? AND chat_id = ? AND text IS NOT NULL AND length(text) > 0`,
    )
    .get(user.id, chatId) as { avg_len: number | null }).avg_len ?? 0;

  // Active days (unique calendar dates in messages.created_at)
  const activeDaysRow = db
    .prepare(
      `SELECT COUNT(DISTINCT date(created_at)) AS days
       FROM messages WHERE user_id = ? AND chat_id = ?`,
    )
    .get(user.id, chatId) as { days: number };
  const activeDays = activeDaysRow.days ?? 0;

  // Days since first message
  const firstMsgRow = db
    .prepare(
      `SELECT MIN(created_at) AS first FROM messages WHERE user_id = ? AND chat_id = ?`,
    )
    .get(user.id, chatId) as { first: string | null };
  const firstSeen = firstMsgRow?.first ?? user.firstSeenAt ?? null;
  let tenureDays = 0;
  if (firstSeen) {
    const ms = Date.now() - new Date(firstSeen.replace(" ", "T") + "Z").getTime();
    tenureDays = Math.max(1, Math.floor(ms / 86_400_000));
  }

  // Best day (max messages in a single calendar date)
  const bestDayRow = db
    .prepare(
      `SELECT date(created_at) AS dt, COUNT(*) AS cnt
       FROM messages WHERE user_id = ? AND chat_id = ?
       GROUP BY date(created_at) ORDER BY cnt DESC LIMIT 1`,
    )
    .get(user.id, chatId) as { dt: string; cnt: number } | undefined;

  // Best hour (when user is most active)
  const bestHourRow = db
    .prepare(
      `SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hr, COUNT(*) AS cnt
       FROM messages WHERE user_id = ? AND chat_id = ?
       GROUP BY hr ORDER BY cnt DESC LIMIT 1`,
    )
    .get(user.id, chatId) as { hr: number; cnt: number } | undefined;

  // Rep share (% of total rep given out in this chat)
  const totalRepRow = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN delta > 0 THEN delta ELSE 0 END), 0) AS total_positive
       FROM reputation_events WHERE chat_id = ?`,
    )
    .get(chatId) as { total_positive: number };
  const myRepPos = (reputation.totalDelta ?? 0) > 0 ? (reputation.totalDelta ?? 0) : 0;
  const repShare = totalRepRow.total_positive > 0
    ? +(myRepPos / totalRepRow.total_positive * 100).toFixed(2)
    : 0;

  // Last message time + hours since
  const lastMsgRow = db
    .prepare(
      `SELECT MAX(created_at) AS last FROM messages WHERE user_id = ? AND chat_id = ?`,
    )
    .get(user.id, chatId) as { last: string | null };
  let lastMessageHoursAgo: number | null = null;
  if (lastMsgRow?.last) {
    const ms = Date.now() - new Date(lastMsgRow.last.replace(" ", "T") + "Z").getTime();
    lastMessageHoursAgo = +(ms / 3_600_000).toFixed(1);
  }

  return c.json({
    userId: user.id,
    displayName: user.displayName,
    username: user.username,
    messageCount: messages,
    reputation: reputation.totalDelta ?? 0,
    friendCount: reputation.friendCount ?? 0,
    foeCount: reputation.foeCount ?? 0,
    avgMessageLength: Math.round(avgLen),
    activeDays,
    tenureDays,
    avgPerDay: tenureDays > 0 ? +(messages / tenureDays).toFixed(2) : 0,
    avgPerActiveDay: activeDays > 0 ? +(messages / activeDays).toFixed(2) : 0,
    bestDay: bestDayRow ? { date: bestDayRow.dt, count: bestDayRow.cnt } : null,
    bestHour: bestHourRow ? { hour: bestHourRow.hr, count: bestHourRow.cnt } : null,
    repShareOfChat: repShare,
    lastMessageHoursAgo,
  });
});

/**
 * Compact achievement payload for /member/:userId profile view.
 * Returns unlocked + nearest-to-unlock (top 3) so the client can render a small grid.
 * Outside KRSK_SOC_CHAT_ID achievements are off — return empty arrays to keep shape stable.
 */
async function loadMemberAchievements(
  chatId: number,
  userId: number,
): Promise<{
  unlocked: Array<{ id: string; icon: string; title: string; tier: string; unlockedAt: string | null }>;
  nearest: Array<{ id: string; icon: string; title: string; desc: string; progress: { current: number; target: number } }>;
  unlockedCount: number;
  totalCount: number;
}> {
  if (chatId !== KRSK_SOC_CHAT_ID) {
    return { unlocked: [], nearest: [], unlockedCount: 0, totalCount: 0 };
  }
  try {
    const result = evaluateForUser(chatId, userId);
    return {
      unlocked: result.allUnlocked.map((a) => ({
        id: a.id,
        icon: a.icon,
        title: a.title,
        tier: a.tier,
        unlockedAt: a.unlockedAt,
      })),
      // Top 3 locked sorted by closest-to-unlock (evaluateForUser already sorts).
      nearest: result.locked.slice(0, 3).map((a) => ({
        id: a.id,
        icon: a.icon,
        title: a.title,
        desc: a.desc,
        progress: a.progress,
      })),
      unlockedCount: result.allUnlocked.length,
      totalCount: result.allUnlocked.length + result.locked.length,
    };
  } catch (e) {
    console.error(`[MEMBER] achievements eval failed for ${userId}:`, e);
    return { unlocked: [], nearest: [], unlockedCount: 0, totalCount: 0 };
  }
}

app.get("/member/:userId", async (c) => {
  const auth = getAuth(c);
  const scope = enforceChatScope(c, auth, parseInt(c.req.query("chat_id") ?? "0", 10));
  if (!scope.ok) return scope.response;
  const chatId = scope.chatId;
  const userId = parseInt(c.req.param("userId") ?? "0", 10);
  if (!userId) return c.json({ error: "bad userId" }, 400);

  const member = getUser(userId);
  if (!member || member.chatId !== chatId) {
    return c.json({ error: "member not found" }, 404);
  }
  const db = getDb();

  // Same stats as /stats but for any user, not the viewer.
  const messages = getUserMessageCount(chatId, userId);
  const reputation = getReputationSummary(chatId, userId);

  const avgLen = (db
    .prepare(
      `SELECT COALESCE(AVG(LENGTH(text)), 0) AS avg_len
       FROM messages
       WHERE user_id = ? AND chat_id = ? AND text IS NOT NULL AND length(text) > 0`,
    )
    .get(userId, chatId) as { avg_len: number | null }).avg_len ?? 0;

  const activeDaysRow = db
    .prepare(
      `SELECT COUNT(DISTINCT date(created_at)) AS days
       FROM messages WHERE user_id = ? AND chat_id = ?`,
    )
    .get(userId, chatId) as { days: number };

  const firstMsgRow = db
    .prepare(
      `SELECT MIN(created_at) AS first FROM messages WHERE user_id = ? AND chat_id = ?`,
    )
    .get(userId, chatId) as { first: string | null };
  const firstSeen = firstMsgRow?.first ?? member.firstSeenAt ?? null;
  let tenureDays = 0;
  if (firstSeen) {
    const ms = Date.now() - new Date(firstSeen.replace(" ", "T") + "Z").getTime();
    tenureDays = Math.max(1, Math.floor(ms / 86_400_000));
  }

  const bestDayRow = db
    .prepare(
      `SELECT date(created_at) AS dt, COUNT(*) AS cnt
       FROM messages WHERE user_id = ? AND chat_id = ?
       GROUP BY date(created_at) ORDER BY cnt DESC LIMIT 1`,
    )
    .get(userId, chatId) as { dt: string; cnt: number } | undefined;

  const bestHourRow = db
    .prepare(
      `SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hr, COUNT(*) AS cnt
       FROM messages WHERE user_id = ? AND chat_id = ?
       GROUP BY hr ORDER BY cnt DESC LIMIT 1`,
    )
    .get(userId, chatId) as { hr: number; cnt: number } | undefined;

  const lastMsgRow = db
    .prepare(
      `SELECT MAX(created_at) AS last FROM messages WHERE user_id = ? AND chat_id = ?`,
    )
    .get(userId, chatId) as { last: string | null };

  // Rank within chat by message_count
  const rankRow = db
    .prepare(
      `SELECT 1 + COUNT(*) AS rank FROM users
       WHERE chat_id = ? AND message_count > ?`,
    )
    .get(chatId, member.messageCount) as { rank: number };

  // Top 5 emojis for this user (most-used in their messages).
  // Use the Unicode-aware extractor from services/stats so we catch all real emoji,
  // not just stickers. (sticker_emoji only populates for actual sticker messages.)
  const topEmojis = getTopEmojis(chatId, 10, userId);

  return c.json({
    id: member.id,
    displayName: member.displayName,
    username: member.username,
    photoUrl: member.avatarUrl ? `/avatar/${member.id}` : null,
    messageCount: messages,
    reputation: reputation.totalDelta ?? 0,
    friendCount: reputation.friendCount ?? 0,
    foeCount: reputation.foeCount ?? 0,
    avgMessageLength: Math.round(avgLen),
    activeDays: activeDaysRow.days ?? 0,
    tenureDays,
    avgPerDay: tenureDays > 0 ? +(messages / tenureDays).toFixed(2) : 0,
    bestDay: bestDayRow ? { date: bestDayRow.dt, count: bestDayRow.cnt } : null,
    bestHour: bestHourRow ? { hour: bestHourRow.hr, count: bestHourRow.cnt } : null,
    rank: rankRow?.rank ?? null,
    lastMessageAt: lastMsgRow?.last ?? null,
    topEmojis,
    achievements: await loadMemberAchievements(chatId, member.id),
  });
});

app.get("/reputation/next-card", async (c) => {
  const auth = getAuth(c);
  const scope = enforceChatScope(c, auth, parseInt(c.req.query("chat_id") ?? "0", 10));
  if (!scope.ok) return scope.response;
  const chatId = scope.chatId;
  const voter = getUserByTelegramId(auth.telegramId, chatId);
  const voterId = voter?.id ?? 0;

  // Pool of valid candidates: active users, excluding self, excluding already-voted-today.
  const voted = listVotedTargets24h(chatId, voterId);
  const votedSet = new Set(voted.map((v) => v.targetUserId));
  const exclude = new Set<number>([voterId, ...votedSet]);

  const candidatePool = getActiveUsers(chatId, 30).filter(
    (u) => !exclude.has(u.id) && !u.isIgnored,
  );
  if (candidatePool.length === 0) {
    return c.json({ empty: true });
  }
  const idx = Math.floor(Math.random() * candidatePool.length);
  const randomUser = candidatePool[idx];
  if (!randomUser) {
    return c.json({ empty: true });
  }
  const reputation = getReputationSummary(chatId, randomUser.id);
  const quote = getRandomQuote(chatId);

  // === Avatar (lazy-refresh from Telegram if cache is stale) ===
  // Best-effort: failures keep the (possibly null) cached value, so a transient
  // Telegram API hiccup never blocks the user from getting a card.
  let photoUrl: string | null = randomUser.avatarUrl;
  try {
    const { refreshAvatarIfStale } = await import("../../services/avatars.js");
    const fresh = await refreshAvatarIfStale(randomUser);
    if (fresh !== undefined) {
      photoUrl = fresh;
    }
  } catch (e) {
    console.error(`[NEXT-CARD] avatar refresh failed:`, e);
  }

  return c.json({
    userId: randomUser.id,
    username: randomUser.username,
    displayName: randomUser.displayName,
    // photoUrl now points to our own /avatar/<id> endpoint, not Telegram.
    // The bot token never leaves the server. null = no public profile photo.
    photoUrl: photoUrl ? `/avatar/${randomUser.id}` : null,
    reputation: reputation.totalDelta ?? 0,
    quote: quote?.text ?? null,
  });
});

app.post("/reputation/vote", async (c) => {
  const auth = getAuth(c);
  const scope = enforceChatScope(c, auth, parseInt(c.req.query("chat_id") ?? "0", 10));
  if (!scope.ok) return scope.response;
  const chatId = scope.chatId;

  // Spam shield.
  const bucket = takeToken(`vote:${auth.telegramId}`, TOKEN_BUCKET_CAPACITY);
  if (!bucket.ok) {
    c.status(429);
    return c.json({ error: "rate_limited", retry_in_sec: bucket.retrySec });
  }

  const bodyParsed = voteSchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json({ error: "target_user_id and choice required" }, 400);
  }
  const { target_user_id, choice } = bodyParsed.data;

  const voter = getUserByTelegramId(auth.telegramId, chatId);
  const voterId = voter?.id ?? 0;
  if (!voterId) return c.json({ error: "user_not_in_chat" }, 404);

  // Self-vote prevention.
  if (target_user_id === voterId) {
    return c.json({ error: "cannot_vote_self" }, 400);
  }
  if (!userExistsInChat(chatId, target_user_id)) {
    return c.json({ error: "target_user_not_in_chat" }, 404);
  }

  const delta = choice === "friend" ? 1 : -1;

  // === Atomic vote record (race-safe via UNIQUE index) ===
  // addReputationEventIfAbsent uses the partial UNIQUE index uniq_reputation_daily
  // (chat_id, source_user_id, target_user_id, date(created_at)) and INSERT OR IGNORE
  // to guarantee at-most-once-per-UTC-day. Returns existing vote's delta on conflict.
  const voteResult = addReputationEventIfAbsent(
    chatId,
    target_user_id,
    voterId,
    delta,
    "webapp_vote",
  );

  if (!voteResult.inserted) {
    return c.json({
      ok: true,
      already_voted: true,
      previous_choice: voteResult.existingDelta > 0 ? "friend" : "foe",
    });
  }

  // === Achievements hook (voter + target) ===
  let voterUnlocks: Array<{ id: string; icon: string; title: string }> = [];
  let targetUnlocks: Array<{ id: string; icon: string; title: string }> = [];
  try {
    const { evaluateForUser } = await import("../../services/achievements.js");
    if (chatId === KRSK_SOC_CHAT_ID) {
      const v = evaluateForUser(chatId, voterId);
      voterUnlocks = v.unlockedNow.map((a) => ({ id: a.id, icon: a.icon, title: a.title }));
      const t = evaluateForUser(chatId, target_user_id);
      targetUnlocks = t.unlockedNow.map((a) => ({ id: a.id, icon: a.icon, title: a.title }));
    }
  } catch (e) {
    console.error("[VOTE] ach eval failed:", e);
  }

  return c.json({
    ok: true,
    delta,
    event_id: voteResult.eventId,
    voter_unlocks: voterUnlocks,
    target_unlocks: targetUnlocks,
  });
});

app.post("/anon/send", async (c) => {
  const auth = getAuth(c);
  const scope = enforceChatScope(c, auth, parseInt(c.req.query("chat_id") ?? "0", 10));
  if (!scope.ok) return scope.response;
  const chatId = scope.chatId;

  // Spam shield — tighter bucket than voting.
  const bucket = takeToken(`anon:${auth.telegramId}`, ANON_BUCKET_CAPACITY);
  if (!bucket.ok) {
    c.status(429);
    return c.json({ error: "rate_limited", retry_in_sec: bucket.retrySec });
  }

  const bodyParsed = anonSendSchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json({ error: "text required" }, 400);
  }
  // Length cap defensively (zod handles string, but 4KB cap keeps DB sane).
  const text = String(bodyParsed.data.text).slice(0, 4000);
  const sender = getUserByTelegramId(auth.telegramId, chatId);
  const senderId = sender?.id ?? 0;
  const id = insertAnonMessage(chatId, senderId, text);
  return c.json({ ok: true, id });
});

app.get("/anon/my", (c) => {
  const auth = getAuth(c);
  const scope = enforceChatScope(c, auth, parseInt(c.req.query("chat_id") ?? "0", 10));
  if (!scope.ok) return scope.response;
  const chatId = scope.chatId;
  const sender = getUserByTelegramId(auth.telegramId, chatId);
  const senderId = sender?.id ?? 0;
  const anons = getMyAnons(senderId);
  return c.json({ anons });
});

// Delete a pending anon. Only the original sender can delete, and only while
// status='pending' (published/rejected are admin-immutable). Body:
//   { id: number }
// Idempotent: returns { ok: true } even if the row doesn't exist anymore.
app.delete("/anon/:id", (c) => {
  const auth = getAuth(c);
  const scope = enforceChatScope(c, auth, parseInt(c.req.query("chat_id") ?? "0", 10));
  if (!scope.ok) return scope.response;
  const chatId = scope.chatId;
  const sender = getUserByTelegramId(auth.telegramId, chatId);
  const senderId = sender?.id ?? 0;
  const id = parseInt(c.req.param("id") ?? "0", 10);
  if (!id || !senderId) return c.json({ error: "bad_request" }, 400);
  const deleted = deleteMyAnon(id, senderId);
  return c.json({ ok: true, deleted });
});

// Activity stats — daily message counts + emoji breakdown.
// ?chat_id=...&days=7 (default 7, max 30)
app.get("/stats/history", (c) => {
  const auth = getAuth(c);
  const scope = enforceChatScope(c, auth, parseInt(c.req.query("chat_id") ?? "0", 10));
  if (!scope.ok) return scope.response;
  const chatId = scope.chatId;
  const days = Math.min(30, Math.max(1, parseInt(c.req.query("days") ?? "7", 10)));

  const user = getUserByTelegramId(auth.telegramId, chatId);
  if (!user) return c.json({ error: "user_not_in_chat" }, 404);

  const stats = getChatActivityStats(chatId, days, user.id);
  return c.json(stats);
});

// Votes cast by the current user (outgoing reputation).
// ?chat_id=...
app.get("/stats/my-votes", (c) => {
  const auth = getAuth(c);
  const scope = enforceChatScope(c, auth, parseInt(c.req.query("chat_id") ?? "0", 10));
  if (!scope.ok) return scope.response;
  const chatId = scope.chatId;

  const user = getUserByTelegramId(auth.telegramId, chatId);
  if (!user) return c.json({ error: "user_not_in_chat" }, 404);

  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         COUNT(CASE WHEN delta > 0 THEN 1 END) AS friends_given,
         COUNT(CASE WHEN delta < 0 THEN 1 END) AS foes_given,
         COUNT(*) AS total_votes,
         MAX(created_at) AS last_vote_at
       FROM reputation_events
       WHERE chat_id = ? AND source_user_id = ?`,
    )
    .get(chatId, user.id) as
    | { friends_given: number; foes_given: number; total_votes: number; last_vote_at: string | null }
    | undefined;

  return c.json({
    userId: user.id,
    friendsGiven: rows?.friends_given ?? 0,
    foesGiven: rows?.foes_given ?? 0,
    totalVotes: rows?.total_votes ?? 0,
    lastVoteAt: rows?.last_vote_at ?? null,
  });
});

// Achievements — list user's unlocked + locked (with progress).
// ?chat_id=...
app.get("/achievements", async (c) => {
  const auth = getAuth(c);
  const scope = enforceChatScope(c, auth, parseInt(c.req.query("chat_id") ?? "0", 10));
  if (!scope.ok) return scope.response;
  const chatId = scope.chatId;

  const user = getUserByTelegramId(auth.telegramId, chatId);
  if (!user) return c.json({ error: "user_not_in_chat" }, 404);

  const { evaluateForUser, ACHIEVEMENTS, notifyInChatEnabled } = await import(
    "../../services/achievements.js"
  );
  const { allUnlocked, locked } = evaluateForUser(chatId, user.id);

  // Sort unlocked by tier then by time
  const tierOrder: Record<string, number> = { S: 0, B: 1, A: 2 };
  allUnlocked.sort((a, b) => {
    const ta = tierOrder[a.tier] ?? 9;
    const tb = tierOrder[b.tier] ?? 9;
    if (ta !== tb) return ta - tb;
    return (a.unlockedAt ?? "").localeCompare(b.unlockedAt ?? "");
  });

  return c.json({
    userId: user.id,
    chatId,
    total: ACHIEVEMENTS.length,
    unlockedCount: allUnlocked.length,
    unlocked: allUnlocked.map((a) => ({
      id: a.id,
      icon: a.icon,
      title: a.title,
      desc: a.desc,
      tier: a.tier,
      unlockedAt: a.unlockedAt,
    })),
    locked: locked.map((a) => ({
      id: a.id,
      icon: a.icon,
      title: a.title,
      desc: a.desc,
      tier: a.tier,
      progress: a.progress,
    })),
    notifyInChat: notifyInChatEnabled(chatId, user.id),
  });
});

// Top users — leaderboard by message count.
// `?limit=N` caps the result (default 100, max 500). Pass `?limit=all` for the
// full list (warning: chats with thousands of users will produce a large JSON).
app.get("/top", (c) => {
  const auth = getAuth(c);
  const scope = enforceChatScope(c, auth, parseInt(c.req.query("chat_id") ?? "0", 10));
  if (!scope.ok) return scope.response;
  const chatId = scope.chatId;
  const rawLimit = c.req.query("limit");
  const limit =
    rawLimit === "all"
      ? 10_000
      : Math.min(500, Math.max(1, parseInt(rawLimit ?? "100", 10)));

  const top = getTopUsers(chatId, limit);
  return c.json({
    total: top.length,
    users: top.map((u, idx) => ({
      rank: idx + 1,
      id: u.userId,
      displayName: u.displayName,
      username: u.username,
      messageCount: u.messageCount,
    })),
  });
});

// Drama days — longest stretch without drama events for this chat.
app.get("/drama", (c) => {
  const auth = getAuth(c);
  const scope = enforceChatScope(c, auth, parseInt(c.req.query("chat_id") ?? "0", 10));
  if (!scope.ok) return scope.response;
  const chatId = scope.chatId;

  const db = getDb();
  const row = db
    .prepare("SELECT record_days FROM drama_tracker WHERE chat_id = ?")
    .get(chatId) as { record_days: number } | undefined;

  return c.json({
    recordDays: row?.record_days ?? 0,
  });
});

export { app as webappRoutes };
