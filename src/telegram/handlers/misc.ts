import type { Context } from "grammy";
import { formatBold } from "../formatters/index.js";

function getCommandArg(match: string | RegExpMatchArray | undefined): string {
  if (match === undefined) return "";
  if (typeof match === "string") return match;
  // For RegExpMatchArray, use the first captured group or full match
  return match[1] ?? match[0] ?? "";
}

export async function handleMisc(ctx: Context): Promise<void> {
  const command = getCommandArg(ctx.match);

  switch (command) {
    case "start":
    case "help": {
      await ctx.reply(
        `${formatBold("Мамуля — мемный бот-терапевт")}\n\n` +
        `Команды:\n` +
        `/my_stats — твоя статистика\n` +
        `/top_nolifers — самые активные\n` +
        `/dvach — случайный пост\n` +
        `/psychologist — иди к психологу\n` +
        `/fact — интересный факт\n` +
        `/predict — предсказание\n` +
        `/quote — сохранить цитату\n` +
        `/horoscope — гороскоп\n` +
        `/roll — бросить кубик\n` +
        `/help — помощь`,
      );
      break;
    }
    case "menu":
      await ctx.reply("Меню скоро будет!");
      break;
    case "m_version":
      await ctx.reply("Мамуля v0.1.0");
      break;
    case "ignore_me": {
      await ctx.reply("Ты в игноре. Чтобы вернуться — напиши админу.");
      break;
    }
    case "notice_me": {
      await ctx.reply("Это сообщение ничего не делает, но ты молодец.");
      break;
    }
    case "webapp": {
      await ctx.reply("WebApp скоро будет!");
      break;
    }
    default:
      await ctx.reply("Неизвестная команда. /help");
  }
}