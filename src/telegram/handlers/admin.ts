import type { Context } from "grammy";
import { generateSummary } from "../../services/summary.js";
import { getAnonQueue } from "../../services/anon.js";
import { getAdminIds, getConfig } from "../../core/config.js";
import { formatBold } from "../formatters/index.js";

function getCommandArg(match: string | RegExpMatchArray | undefined): string {
  if (match === undefined) return "";
  if (typeof match === "string") return match;
  return match[1] ?? match[0] ?? "";
}

function isAdmin(ctx: Context): boolean {
  const config = getConfig();
  const adminIds = getAdminIds(config);
  return adminIds.includes(ctx.from?.id ?? 0);
}

export async function handleAdmin(ctx: Context): Promise<void> {
  const command = getCommandArg(ctx.match);
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  switch (command) {
    case "summary":
    case "summary_week": {
      if (!isAdmin(ctx)) {
        await ctx.reply("⛔ Админская команда.");
        return;
      }
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const summary = await generateSummary(
        chatId,
        weekAgo.toISOString(),
        now.toISOString(),
      );
      await ctx.reply(formatBold("Саммари за неделю") + "\n\n" + summary);
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
        formatBold("Анонимки в очереди") + "\n\n" +
        queue.map((a) => `#${a.id}: ${a.text.slice(0, 100)}`).join("\n")
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
    default:
      await ctx.reply("Неизвестная команда.");
  }
}