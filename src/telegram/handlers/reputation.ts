import type { Context } from "grammy";
import { getUserReputation, getTopReputation } from "../../services/reputation.js";
import { getDaysWithoutDrama } from "../../data/repos/drama.js";
import { formatBold, formatReputation, formatRank, formatUserName } from "../formatters/index.js";

function getCommandArg(match: string | RegExpMatchArray | undefined): string {
  if (match === undefined) return "";
  if (typeof match === "string") return match;
  return match[1] ?? match[0] ?? "";
}

export async function handleReputation(ctx: Context): Promise<void> {
  const command = getCommandArg(ctx.match);
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
      const lines = top.map((u, i) =>
        `${formatRank(i + 1)} ${formatUserName(u.username, u.displayName)} ${formatReputation(u.reputation)}`
      );
      await ctx.reply(formatBold("Топ репутации") + "\n\n" + lines.join("\n"));
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