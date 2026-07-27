import type { Context, Next } from "hono";
import { Hono } from "hono";
import { getConfig } from "../../core/config.js";
import { getMyAnons, insertAnonMessage } from "../../data/repos/anon.js";
import { getRandomQuote } from "../../data/repos/quotes.js";
import { addReputationEvent, getReputationSummary } from "../../data/repos/reputation.js";
import { getUserChatsByTelegramId } from "../../data/repos/user_chats.js";
import { getActiveUsers, getUserByTelegramId } from "../../data/repos/users.js";
import { getUserMessageCount } from "../../services/stats.js";
import { validateInitData } from "./auth.js";
import { anonSendSchema, voteSchema } from "./schemas.js";

const app = new Hono();

interface AuthContext {
  userId: number;
  telegramId: number;
  firstName: string;
  username: string | undefined;
}

function authUser(c: Context): AuthContext | null {
  const initData = c.req.header("x-init-data");
  if (!initData) {
    console.error("[AUTH] No x-init-data header");
    return null;
  }
  const config = getConfig();
  const user = validateInitData(initData, config.BOT_TOKEN);
  if (!user) {
    console.error("[AUTH] validateInitData failed for initData length", initData.length);
    return null;
  }
  return {
    userId: 0,
    telegramId: user.id,
    firstName: user.first_name,
    username: user.username,
  };
}

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
  const chatId = parseInt(c.req.query("chat_id") ?? "0", 10);
  if (!chatId) return c.json({ error: "chat_id required" }, 400);

  const user = getUserByTelegramId(auth.telegramId, chatId);
  if (!user) return c.json({ error: "User not found in chat" }, 404);

  const reputation = getReputationSummary(chatId, user.id);
  const messages = getUserMessageCount(chatId, user.id);

  return c.json({
    userId: user.id,
    displayName: user.displayName,
    username: user.username,
    messageCount: messages,
    reputation: reputation.totalDelta ?? 0,
    friendCount: reputation.friendCount ?? 0,
    foeCount: reputation.foeCount ?? 0,
  });
});

app.get("/reputation/next-card", (c) => {
  const chatId = parseInt(c.req.query("chat_id") ?? "0", 10);
  if (!chatId) return c.json({ error: "chat_id required" }, 400);

  const users = getActiveUsers(chatId, 30);
  if (users.length === 0) {
    return c.json({ empty: true });
  }

  const idx = Math.floor(Math.random() * users.length);
  const randomUser = users[idx];
  if (!randomUser) {
    return c.json({ empty: true });
  }
  const reputation = getReputationSummary(chatId, randomUser.id);
  const quote = getRandomQuote(chatId);

  return c.json({
    userId: randomUser.id,
    username: randomUser.username,
    displayName: randomUser.displayName,
    reputation: reputation.totalDelta ?? 0,
    quote: quote?.text ?? null,
  });
});

app.post("/reputation/vote", async (c) => {
  const auth = getAuth(c);
  const chatId = parseInt(c.req.query("chat_id") ?? "0", 10);
  if (!chatId) return c.json({ error: "chat_id required" }, 400);

  const bodyParsed = voteSchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json({ error: "target_user_id and choice required" }, 400);
  }
  const { target_user_id, choice } = bodyParsed.data;
  const delta = choice === "friend" ? 1 : -1;
  const voter = getUserByTelegramId(auth.telegramId, chatId);
  addReputationEvent(chatId, target_user_id, voter?.id ?? null, delta, "webapp_vote");
  return c.json({ ok: true });
});

app.post("/anon/send", async (c) => {
  const auth = getAuth(c);
  const chatId = parseInt(c.req.query("chat_id") ?? "0", 10);
  if (!chatId) return c.json({ error: "chat_id required" }, 400);

  const bodyParsed = anonSendSchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json({ error: "text required" }, 400);
  }
  const sender = getUserByTelegramId(auth.telegramId, chatId);
  const senderId = sender?.id ?? 0;
  const id = insertAnonMessage(chatId, senderId, bodyParsed.data.text);
  return c.json({ ok: true, id });
});

app.get("/anon/my", (c) => {
  const auth = getAuth(c);
  const chatId = parseInt(c.req.query("chat_id") ?? "0", 10);
  const sender = chatId ? getUserByTelegramId(auth.telegramId, chatId) : null;
  const senderId = sender?.id ?? 0;
  const anons = getMyAnons(senderId);
  return c.json({ anons });
});

export { app as webappRoutes };
