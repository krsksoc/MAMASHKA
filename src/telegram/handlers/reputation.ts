import type { Context } from "grammy";
import { getDaysWithoutDrama } from "../../data/repos/drama.js";
import { getTopReputation, getUserReputation } from "../../services/reputation.js";
import { formatBold, formatRank, formatReputation, formatUserName } from "../formatters/index.js";

export async function handleReputation(ctx: Context): Promise<void> {
  const text = ctx.message && typeof ctx.message.text === "string" ? ctx.message.text : "";
  const m = text.match(/^\/([a-zA-Z0-9_]+)/);
  let command = m ? (m[1] ?? "") : "";
  if (command.includes("@")) command = command.split("@")[0] ?? command;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  switch (command) {
    case "friend_foe_stats": {
      const userId = ctx.from?.id;
      if (!userId) return;
      const rep = getUserReputation(chatId, userId);
      await ctx.reply(`${formatBold("Репутация")}\n${formatReputation(rep)}`);
      break;
    }
    case "friend_foe_top": {
      const top = getTopReputation(chatId, 10);
      if (top.length === 0) {
        await ctx.reply("Нет данных.");
        return;
      }
      const lines = top.map(
        (u, i) =>
          `${formatRank(i + 1)} ${formatUserName(u.username, u.displayName)} ${formatReputation(u.reputation)}`,
      );
      await ctx.reply(`${formatBold("Топ репутации")}\n\n${lines.join("\n")}`);
      break;
    }
    case "days_without_drama": {
      const days = getDaysWithoutDrama(chatId);
      await ctx.reply(`${formatBold("Дней без драмы")}\n${days} дней 🍿`);
      break;
    }
    case "drama": {
      await ctx.reply("⚠️ Драма зафиксирована!");
      break;
    }
    default:
      await ctx.reply("Неизвестная команда.");
  }
}
