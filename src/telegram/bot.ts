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
  registerHandlers(bot);
  LOG("Handlers registered");
  bot.catch((err) => {
    const msg = err.ctx?.message?.text ?? "unknown";
    // biome-ignore lint: error handler, must use global console for errors
    console.error(`[ERROR] Handling "${msg}":`, String(err.error));
  });
  return bot;
}