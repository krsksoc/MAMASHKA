import { createBot } from "./telegram/bot.js";
import { getConfig } from "./core/config.js";

try {
  getConfig();
  const bot = createBot();
  bot.start();
} catch (err) {
  // biome-ignore lint: startup error, must use global console
  console.error("Failed to start bot:", err);
  process.exit(1);
}