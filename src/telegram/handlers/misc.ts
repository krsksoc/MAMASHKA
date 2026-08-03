import type { Context } from "grammy";
import { generateMamoolyaNews } from "../../services/summary.js";
import { formatBold } from "../formatters/index.js";

/**
 * Public /summary — open to everyone (was admin-only). Generates a chat
 * digest from the latest 1000 messages via LLM. Same backend as the
 * "💬 Саммари чата" button in /menu (callback `menu_summary`).
 *
 * Rate-limit at the LLM tier is sufficient for typical chat traffic.
 */
export async function handleSummary(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  await ctx.reply("⏳ Собираю последние 1000 сообщений...");
  try {
    const summary = await generateMamoolyaNews(chatId, 1000);
    await ctx.reply(`${formatBold("Саммари чата")}\n\n${summary}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[SUMMARY] error for chat=${chatId}:`, msg);
    await ctx.reply(`❌ Ошибка генерации саммари: ${msg.slice(0, 200)}`);
  }
}

export async function handleMisc(ctx: Context): Promise<void> {
  const text = ctx.update.message?.text ?? "";
  const match = text.match(/^\/([a-zA-Z0-9_]+)/);
  let cmd = match ? (match[1] ?? "") : "";
  // Strip @BotName suffix (group commands)
  if (cmd.includes("@")) {
    cmd = cmd.split("@")[0] ?? "";
  }
  console.error(`[MISC] text="${text}" cmd="${cmd}" chat=${ctx.chat?.id} from=${ctx.from?.id}`);

  switch (cmd) {
    case "start": {
      // Welcome / onboarding for new users.
      await ctx.reply(
        `${formatBold("Привет! Я Мамуля 👋")}\n\n` +
          `Я мемный бот-терапевт для чата /krsk soc. Веду статистику, ` +
          `собираю цитаты, развлекаю, имитирую твой стиль.\n\n` +
          `Что умею:\n` +
          `📊 /my_stats — твоя статистика\n` +
          `🏅 /achievements — твои достижения\n` +
          `🎴 Открыть Мамулю — приложение с голосованием и анонимками\n` +
          `💬 /quote — сохранить цитату\n` +
          `🎲 /dvach — случайный пост\n` +
          `🔮 /predict — предсказание на день\n\n` +
          `Полный список команд: /help`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎴 Открыть Мамулю", web_app: { url: "https://maman.krsksoc.pwtr.dev/?v=12&t=20260802-1755" } }],
            ],
          },
        },
      );
      break;
    }
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
          `/achievements — достижения\n` +
          `/summary — саммари чата\n` +
          `/menu — меню\n` +
          `/help — помощь`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎴 Открыть Мамулю", web_app: { url: "https://maman.krsksoc.pwtr.dev/?v=12&t=20260802-1755" } }],
            ],
          },
        },
      );
      break;
    }
    case "menu": {
      await ctx.reply(`${formatBold("🎴 Меню Мамули")}\n\nВыбери, что хочешь:`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🎴 Открыть Мамулю", web_app: { url: "https://maman.krsksoc.pwtr.dev/?v=12&t=20260802-1755" } }],
            [
              { text: "📊 Моя статистика", callback_data: "menu_my_stats" },
              { text: "🏆 Топ ноулайферов", callback_data: "menu_top_nolifers" },
            ],
            [
              { text: "💬 Саммари чата", callback_data: "menu_summary" },
              { text: "🎲 Развлечения", callback_data: "menu_fun" },
            ],
            [
              { text: "🃏 Случайный пост", callback_data: "menu_dvach" },
              { text: "📜 Цитаты", callback_data: "menu_quotes" },
            ],
            [
              { text: "ℹ️ Помощь", callback_data: "menu_help" },
              { text: "🔄 Обновить", callback_data: "menu_refresh" },
            ],
          ],
        },
      });
      break;
    }
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
          inline_keyboard: [
            [{ text: "🌐 Открыть веб-приложение", web_app: { url: "https://maman.krsksoc.pwtr.dev/?v=12&t=20260802-1755" } }],
          ],
        },
      });
      break;
    }
    default:
      await ctx.reply("Неизвестная команда. /help");
  }
}
