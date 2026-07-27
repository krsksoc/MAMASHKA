import type { Context } from "grammy";
import { getAdminIds, getConfig } from "../../core/config.js";
import { getAnonQueue } from "../../services/anon.js";
import { generateMamoolyaNews } from "../../services/summary.js";
import { formatBold } from "../formatters/index.js";

function isAdmin(ctx: Context): boolean {
  const config = getConfig();
  const adminIds = getAdminIds(config);
  return adminIds.includes(ctx.from?.id ?? 0);
}

export async function handleAdmin(ctx: Context): Promise<void> {
  console.error(`[ADMIN] triggered, chat=${ctx.chat?.id}, from=${ctx.from?.id}`);
  const text = ctx.message && typeof ctx.message.text === "string" ? ctx.message.text : "";
  const m = text.match(/^\/([a-zA-Z0-9_]+)/);
  let command = m ? (m[1] ?? "") : "";
  if (command.includes("@")) {
    command = command.split("@")[0] ?? "";
  }
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  switch (command) {
    case "summary": {
      await ctx.reply("⏳ Собираю последние 1000 сообщений...");
      try {
        const summary = await generateMamoolyaNews(chatId, 1000);
        await ctx.reply(summary);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[ADMIN] summary error for chat=${chatId}:`, msg);
        await ctx.reply(`❌ Ошибка генерации саммари: ${msg.slice(0, 200)}`);
      }
      break;
    }
    case "summary_week": {
      if (!isAdmin(ctx)) {
        await ctx.reply("⛔ Админская команда.");
        return;
      }
      await ctx.reply("⏳ Собираю саммари за неделю...");
      const summary = await generateMamoolyaNews(chatId, 500);
      await ctx.reply(`${formatBold("Саммари за неделю")}\n\n${summary}`);
      break;
    }
    case "publish_anons": {
      if (!isAdmin(ctx)) {
        await ctx.reply("⛔ Админская команда.");
        return;
      }
      const queue = getAnonQueue(chatId);
      if (queue.length === 0) {
        await ctx.reply("Нет анонимок в очереди.");
        return;
      }
      await ctx.reply(
        formatBold("Анонимки в очереди") +
          "\n\n" +
          queue.map((a) => `#${a.id}: ${a.text.slice(0, 100)}`).join("\n"),
      );
      break;
    }
    case "ban_vote": {
      await ctx.reply("Голосование пока не реализовано.");
      break;
    }
    case "anon_sender": {
      await ctx.reply("Раскрытие автора пока не реализовано.");
      break;
    }
    default: {
      // intentionally empty
    }
  }
}
