import { Bot } from "grammy";
import type { Context } from "grammy";
import { getConfig } from "../core/config.js";
import { registerHandlers } from "./router.js";
import { trackerMiddleware } from "./middleware/tracker.js";
import { ignoreMiddleware } from "./middleware/ignore.js";

const LOG = (msg: string) => {
  // biome-ignore lint: debug logging
  console.error(`[BOT] ${msg}`);
};

export function createBot(): Bot<Context> {
  const config = getConfig();
  LOG("Creating bot with token: " + config.BOT_TOKEN.slice(0, 10) + "...");
  const bot = new Bot<Context>(config.BOT_TOKEN);
  LOG("Bot instance created");
  bot.use(ignoreMiddleware());
  LOG("Ignore middleware registered");
  bot.use(trackerMiddleware());
  LOG("Tracker middleware registered");
  bot.use(async (ctx, next) => {
    const text = ctx.message && "text" in ctx.message ? ctx.message.text : "?";
    // biome-ignore lint: debug
    console.error(`[UPDATE] text="${text}" chat=${ctx.chat?.id} from=${ctx.from?.id}`);
    await next();
  });
  LOG("Debug middleware registered");
  registerHandlers(bot);
  LOG("Handlers registered");
  bot.catch((err) => {
    const msg = err.ctx?.message?.text ?? "unknown";
    // biome-ignore lint: error handler, must use global console for errors
    console.error(`[ERROR] Handling "${msg}":`, String(err.error));
  });
  return bot;
}