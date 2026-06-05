import { Hono } from "hono";
import { validateInitData } from "./auth.js";
import { getConfig } from "../../core/config.js";
import { getActiveUsers } from "../../data/repos/users.js";
import { getReputation } from "../../data/repos/reputation.js";
import { getMyAnons, insertAnonMessage } from "../../data/repos/anon.js";
import { addReputationEvent } from "../../data/repos/reputation.js";
import { getRandomQuote } from "../../data/repos/quotes.js";
import { voteSchema, anonSendSchema } from "./schemas.js";
import type { Context, Next } from "hono";

const app = new Hono();

function authUser(c: Context): number | null {
  const initData = c.req.header("x-init-data");
  if (!initData) return null;
  const config = getConfig();
  const user = validateInitData(initData, config.BOT_TOKEN);
  if (!user) return null;
  return user.id;
}

app.use(async (c: Context, next: Next): Promise<void> => {
  const userId = authUser(c);
  if (userId === null) {
    c.status(401);
    await c.json({ error: "Unauthorized" });
    return;
  }
  await next();
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
  const reputation = getReputation(chatId, randomUser.id);
  const quote = getRandomQuote(chatId);

  return c.json({
    userId: randomUser.id,
    username: randomUser.username,
    displayName: randomUser.displayName,
    reputation,
    quote: quote?.text ?? null,
  });
});

app.post("/reputation/vote", async (c) => {
  const chatId = parseInt(c.req.query("chat_id") ?? "0", 10);
  if (!chatId) return c.json({ error: "chat_id required" }, 400);

  const bodyParsed = voteSchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json({ error: "target_user_id and choice required" }, 400);
  }
  const { target_user_id, choice } = bodyParsed.data;
  const delta = choice === "friend" ? 1 : -1;
  addReputationEvent(chatId, target_user_id, null, delta, "webapp_vote");
  return c.json({ ok: true });
});

app.post("/anon/send", async (c) => {
  const chatId = parseInt(c.req.query("chat_id") ?? "0", 10);
  if (!chatId) return c.json({ error: "chat_id required" }, 400);

  const bodyParsed = anonSendSchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json({ error: "text required" }, 400);
  }
  const senderId = 0; // TODO: get from auth
  const id = insertAnonMessage(chatId, senderId, bodyParsed.data.text);
  return c.json({ ok: true, id });
});

app.get("/anon/my", (c) => {
  const senderId = parseInt(c.req.query("sender_id") ?? "0", 10);
  if (!senderId) return c.json({ error: "sender_id required" }, 400);
  const anons = getMyAnons(senderId);
  return c.json({ anons });
});

export { app as webappRoutes };