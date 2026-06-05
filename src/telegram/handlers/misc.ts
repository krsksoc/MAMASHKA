import type { Context } from "grammy";
import { formatBold } from "../formatters/index.js";

export async function handleMisc(ctx: Context): Promise<void> {
  const text = ctx.update.message?.text ?? "";
  const match = text.match(/^\/([a-zA-Z0-9_]+)/);
  let cmd = match ? match[1] ?? "" : "";
  // Strip @BotName suffix (group commands)
  if (cmd.includes("@")) cmd = cmd.split("@")[0]!;
  // biome-ignore lint: debug
  console.error(`[MISC] text="${text}" cmd="${cmd}"`);

  switch (cmd) {
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
        {
          reply_markup: {
            inline_keyboard: [[{ text: "🎴 Открыть Мамулю", web_app: { url: "https://mamoolya.duckdns.org:8443/" } }]],
          },
        },
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
      await ctx.reply("🌐 Открыть Мамулю:", {
        reply_markup: {
          inline_keyboard: [[{ text: "🌐 Открыть веб-приложение", web_app: { url: "https://mamoolya.duckdns.org:8443/" } }]],
        },
      });
      break;
    }
    default:
      await ctx.reply("Неизвестная команда. /help");
  }
}