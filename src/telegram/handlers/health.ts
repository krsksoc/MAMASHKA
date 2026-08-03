import type { Context } from "grammy";
import { getConfig } from "../../core/config.js";
import { getDb } from "../../data/db.js";

export async function handleHealth(ctx: Context): Promise<void> {
  const config = getConfig();
  const db = getDb();

  const messagesRow = db.prepare("SELECT COUNT(*) as cnt FROM messages").get() as {
    cnt: number;
  } | null;
  const usersRow = db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number } | null;

  const uptime = Math.floor(process.uptime());
  const uptimeStr =
    uptime < 60
      ? `${uptime}s`
      : uptime < 3600
        ? `${Math.floor(uptime / 60)}m`
        : `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`;

  const mem = process.memoryUsage();
  const rss = Math.round(mem.rss / 1024 / 1024);

  const providers = [
    config.WORM_KEY ? "🟢 wormsoft" : "⚫ wormsoft",
    config.OPENAI_API_KEY ? "🟢 openai" : "⚫ openai",
    config.ANTHROPIC_API_KEY ? "🟢 anthropic" : "⚫ anthropic",
    config.OPENROUTER_API_KEY ? "🟢 openrouter" : "⚫ openrouter",
    config.OLLAMA_BASE_URL ? "🟢 ollama" : "⚫ ollama",
  ].join("\n");

  const lines = [
    "<b>Health Check</b>",
    "",
    `📊 <b>DB:</b> ${Number(messagesRow?.cnt ?? 0)} msgs | ${Number(usersRow?.cnt ?? 0)} users`,
    `🧠 <b>Mem:</b> ${rss}MB RSS`,
    `⏱️ <b>Uptime:</b> ${uptimeStr}`,
    "",
    "<b>Providers:</b>",
    providers,
  ];

  await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
}
