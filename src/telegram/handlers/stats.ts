import type { Context } from "grammy";
import { getTopUsers, getStickerStats } from "../../services/stats.js";
import { formatBold, formatRank, formatUserName } from "../formatters/index.js";



export async function handleStats(ctx: Context): Promise<void> {
  const text = ctx.message && typeof ctx.message.text === "string" ? ctx.message.text : "";
  const m = text.match(/^\/([a-zA-Z0-9_]+)/);
  let command = m ? m[1] ?? "" : "";
  if (command.includes("@")) command = command.split("@")[0]!;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  switch (command) {
    case "my_stats": {
      await ctx.reply(`${formatBold("Твоя статистика")}\nПока нет данных.`);
      break;
    }
    case "top_nolifers":
    case "top_pairs": {
      const top = getTopUsers(chatId, 10);
      if (top.length === 0) {
        await ctx.reply("Нет данных.");
        return;
      }
      const lines = top.map((u, i) =>
        `${formatRank(i + 1)} ${formatUserName(u.username, u.displayName)} — ${u.messageCount} сообщ.`
      );
      await ctx.reply(formatBold("Топ ноулайферов") + "\n\n" + lines.join("\n"));
      break;
    }
    case "sticker_stats": {
      const stats = getStickerStats(chatId, 10);
      if (stats.length === 0) {
        await ctx.reply("Нет стикеров.");
        return;
      }
      const lines = stats.map((s, i) => `${formatRank(i + 1)} ${s.emoji} — ${s.count}`);
      await ctx.reply(formatBold("Топ стикеров") + "\n\n" + lines.join("\n"));
      break;
    }
    default:
      await ctx.reply("Неизвестная команда.");
  }
}