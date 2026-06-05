import { createBot } from "./telegram/bot.js";
import { getConfig } from "./core/config.js";
import webServer from "./web/server.js";

try {
  getConfig();

  // Start Telegram bot
  const bot = createBot();
  bot.start();

  // Start Hono web server on same process
  const { serve } = await import("bun");
  serve({
    port: webServer.port,
    fetch: webServer.fetch,
  });

  // biome-ignore lint: startup log, must use global console
  console.log(`Web server listening on port ${webServer.port}`);
} catch (err) {
  // biome-ignore lint: startup error, must use global console
  console.error("Failed to start bot:", err);
  process.exit(1);
}