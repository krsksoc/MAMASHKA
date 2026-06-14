import type { Context } from "grammy";
import { Bot } from "grammy";
import { handleChatMember, handleLeftChatMember, handleNewChatMembers, startMemberPolling, stopMemberPolling } from "../services/welcome.js";
import { getConfig } from "../core/config.js";
import { registerCallbacks } from "./callback-router.js";
import { ignoreMiddleware } from "./middleware/ignore.js";
import { rateLimitMiddleware } from "./middleware/rate-limit.js";
import { trackerMiddleware } from "./middleware/tracker.js";
import { registerHandlers } from "./router.js";

const LOG = (msg: string) => {
  console.error(`[BOT] ${msg}`);
};

export function createBot(): Bot<Context> {
  const config = getConfig();
  LOG("Creating bot with token: " + config.BOT_TOKEN.slice(0, 10) + "...");
  const bot = new Bot<Context>(config.BOT_TOKEN);
  LOG("Bot instance created");

  // Native grammy filters for join/leave — more reliable than middleware
  bot.on("message:new_chat_members", handleNewChatMembers);
  LOG("new_chat_members handler registered");
  bot.on("message:left_chat_member", handleLeftChatMember);
  LOG("left_chat_member handler registered");
  bot.on("chat_member", handleChatMember);
  LOG("chat_member handler registered");

  bot.use(ignoreMiddleware());
  LOG("Ignore middleware registered");
  bot.use(trackerMiddleware());
  LOG("Tracker middleware registered");
  bot.use(async (ctx, next) => {
    const text = ctx.message && typeof ctx.message.text === "string" ? ctx.message.text : null;
    // biome-ignore lint: debug
    console.error(`[UPDATE] text="${text}" chat=${ctx.chat?.id} from=${ctx.from?.id}`);
    await next();
  });
  LOG("Debug middleware registered");
  bot.use(rateLimitMiddleware());
  LOG("Rate limit middleware registered");

  // Reply to bot messages — LLM-powered conversation
  bot.on("message", async (ctx, next) => {
    const msg = ctx.message;
    if (!msg || !msg.reply_to_message) {
      await next();
      return;
    }
    if (msg.reply_to_message.from?.id !== ctx.me.id) {
      await next();
      return;
    }
    const text = msg.text ?? "";
    if (!text.trim()) {
      await next();
      return;
    }

    const chatId = ctx.chat?.id;
    const userId = ctx.from?.id;
    const userName = ctx.from?.first_name ?? ctx.from?.username ?? null;
    if (!chatId || !userId) {
      await next();
      return;
    }

    const replyText = msg.reply_to_message.text ?? null;
    const replyUserName = msg.reply_to_message.from?.first_name ?? msg.reply_to_message.from?.username ?? null;

    try {
      const { generateReply } = await import("../services/llm_reply.js");
      const response = await generateReply(chatId, userId, userName, text, replyText, replyUserName);
      await ctx.reply(response);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[REPLY] error:`, msg);
      await next();
    }
  });

  registerHandlers(bot);
  LOG("Handlers registered");
  registerCallbacks(bot);
  LOG("Callbacks registered");
  bot.catch((err) => {
    const msg = err.ctx?.message?.text ?? "unknown";
    const error = err.error;
    const stack = error instanceof Error ? error.stack : String(error);
    console.error(`[ERROR] Handling "${msg}":`, stack);
  });
  return bot;
}
