import type { Context } from "grammy";
import { getStickerStats, getTopUsers, getUserMessageCount } from "../../services/stats.js";
import { getUserByTelegramId } from "../../data/repos/users.js";
import { formatBold, formatRank, formatUserName } from "../formatters/index.js";

export async function handleStats(ctx: Context): Promise<void> {
  const text = ctx.message && typeof ctx.message.text === "string" ? ctx.message.text : "";
  const m = text.match(/^\/(\S+)/);
  let command = m ? (m[1] ?? "").split("@")[0] : "";
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  const fromId = ctx.from?.id;

  switch (command) {
    case "stats":
    case "my_stats": {
      if (!fromId) return;
      const user = getUserByTelegramId(fromId, chatId);
      if (!user) {
        await ctx.reply("Я тебя не знаю. Напиши что-нибудь сначала.");
        return;
      }
      const messages = getUserMessageCount(chatId, user.id);
      await ctx.reply(
        `${formatBold("Твоя статистика")}\n\n` +
        `✉️ Сообщений: ${messages}\n` +
        `🏷 Ник: ${user.displayName ?? "—"}\n` +
        `📛 Юзернейм: @${user.username ?? "—"}`,
      );
      break;
    }
    case "top_nolifers":
    case "top_pairs": {
      const top = getTopUsers(chatId, 10);
      if (top.length === 0) {
        await ctx.reply("Нет данных.");
        return;
      }
      const lines = top.map(
        (u, i) =>
          `${formatRank(i + 1)} ${formatUserName(u.username, u.displayName)} — ${u.messageCount} сообщ.`,
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
