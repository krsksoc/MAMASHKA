import { getConfig } from "./core/config.js";
import { closeDb } from "./data/db.js";
import { stopMemberPolling } from "./services/welcome.js";
import { createBot } from "./telegram/bot.js";
import webServer from "./web/server.js";

async function main() {
  try {
    getConfig();

    // Start Telegram bot
    const bot = createBot();
    bot.start({
      allowed_updates: ["message", "chat_member", "my_chat_member", "callback_query"],
    });

    // Start Hono web server on same process
    const { serve } = await import("bun");
    const server = serve({
      port: webServer.port,
      fetch: webServer.fetch,
    });

    console.log(`Web server listening on port ${webServer.port}`);

    // Start member count polling fallback for leave detection
    // NOTE: Disabled — chat_member updates handle farewell natively
    // startMemberPolling(bot);

    // Initial scan for existing members in known chats
    await scanKnownChats(bot);

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      console.error(`[SHUTDOWN] ${signal} received, shutting down...`);
      try {
        bot.stop();
        server.stop();
        stopMemberPolling();
        closeDb();
        console.error("[SHUTDOWN] Clean exit");
      } catch (e) {
        console.error("[SHUTDOWN] Error during cleanup:", e);
      }
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));
  } catch (err) {
    console.error("Failed to start bot:", err);
    closeDb();
    process.exit(1);
  }
}

async function scanKnownChats(_bot: import("grammy").Bot): Promise<void> {
  // We can't enumerate all chats automatically in Telegram Bot API
  // This is a placeholder — users will be registered lazily via tracker middleware
  // when they send messages. For immediate scan, bot must be in the chat.
  console.error(
    "[STARTUP] Lazy user registration via tracker. Chats will be scanned on my_chat_member events.",
  );
}

main();
