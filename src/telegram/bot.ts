import { Bot } from "grammy";
import type { Context } from "grammy";
import { getConfig } from "../core/config.js";
import { registerHandlers } from "./router.js";
import { trackerMiddleware } from "./middleware/tracker.js";
import { ignoreMiddleware } from "./middleware/ignore.js";

export function createBot(): Bot<Context> {
  const config = getConfig();
  const bot = new Bot<Context>(config.BOT_TOKEN);
  bot.use(ignoreMiddleware());
  bot.use(trackerMiddleware());
  registerHandlers(bot);
  bot.catch((err) => {
    const msg = err.ctx?.message?.text ?? "unknown";
    // biome-ignore lint: error handler, must use global console for errors
    console.error(`Error handling ${msg}:`, err.error);
  });
  return bot;
}