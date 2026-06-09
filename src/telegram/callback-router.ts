import type { Bot, Context } from "grammy";
import { formatBold } from "./formatters/index.js";
import { generateMamoolyaNews } from "../services/summary.js";
import { getTopUsers, getStickerStats } from "../services/stats.js";
import { formatRank, formatUserName } from "./formatters/index.js";

const WEBAPP_URL = "https://mamoolya.duckdns.org:8443/";

// Inline keyboards
const mainMenuKeyboard = {
  inline_keyboard: [
    [
      { text: "🎴 Открыть Мамулю", url: WEBAPP_URL },
    ],
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
};

const funMenuKeyboard = {
  inline_keyboard: [
    [
      { text: "🎲 Бросить кубик", callback_data: "menu_roll" },
      { text: "🔮 Предсказание", callback_data: "menu_predict" },
    ],
    [
      { text: "🧠 Психолог", callback_data: "menu_psychologist" },
      { text: "🧐 Факт", callback_data: "menu_fact" },
    ],
    [
      { text: "♈ Гороскоп", callback_data: "menu_horoscope" },
      { text: "👤 Имитировать", callback_data: "menu_imitate" },
    ],
    [
      { text: "⬅️ Назад", callback_data: "menu_back" },
    ],
  ],
};

// Utility to answer callback and edit message
async function answerAndEdit(ctx: Context, text: string, keyboard?: object) {
  await ctx.answerCallbackQuery();
  if (ctx.callbackQuery?.message) {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard });
  }
}

export async function handleCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data ?? "";
  // biome-ignore lint: debug
  console.error(`[CALLBACK] data="${data}" chat=${ctx.chat?.id} from=${ctx.from?.id}`);

  const chatId = ctx.chat?.id;
  if (!chatId) {
    await ctx.answerCallbackQuery("❌ Нет chat_id");
    return;
  }

  switch (data) {
    // === Main menu items ===
    case "menu_my_stats": {
      await ctx.answerCallbackQuery("📊 Собираю статистику...");
      await ctx.reply(`${formatBold("Твоя статистика")}\n\nПока нет данных.`);
      break;
    }
    case "menu_top_nolifers": {
      await ctx.answerCallbackQuery("🏆 Собираю топ...");
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
    case "menu_summary": {
      await ctx.answerCallbackQuery("⏳ Собираю саммари...");
      const summary = await generateMamoolyaNews(chatId, 1000);
      await ctx.reply(`💬 ${formatBold("Саммари чата")}\n\n${summary}`, {
        reply_markup: {
          inline_keyboard: [[{ text: "🔄 Ещё раз", callback_data: "menu_summary" }]],
        },
      });
      break;
    }
    case "menu_fun": {
      await answerAndEdit(ctx, `${formatBold("🎲 Развлечения")}\n\nВыбери, чем развлечься:`, funMenuKeyboard);
      break;
    }
    case "menu_dvach": {
      await ctx.answerCallbackQuery("🃏 Ищу пост...");
      // dvach command is handled by fun handler, route there
      await ctx.reply("Используй команду /dvach для случайного поста.");
      break;
    }
    case "menu_quotes": {
      await ctx.answerCallbackQuery("📜 Ищу цитату...");
      await ctx.reply("Используй команду /quote для сохранения цитаты, /quotes для списка.");
      break;
    }
    case "menu_help": {
      await answerAndEdit(ctx,
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
        `/summary — саммари последних сообщений\n` +
        `/menu — открыть меню`,
        mainMenuKeyboard,
      );
      break;
    }
    case "menu_refresh": {
      await answerAndEdit(ctx, `${formatBold("🎴 Меню Мамули")}\n\nВыбери, что хочешь:`, mainMenuKeyboard);
      break;
    }

    // === Fun submenu ===
    case "menu_roll": {
      await ctx.answerCallbackQuery("🎲 Бросаю...");
      const roll = Math.floor(Math.random() * 6) + 1;
      await ctx.reply(`🎲 Выпало: <b>${roll}</b>`, { parse_mode: "HTML" });
      break;
    }
    case "menu_predict": {
      await ctx.answerCallbackQuery("🔮 Гадаю...");
      const predictions = [
        "Сегодня твой день! ✨",
        "Жди неожиданного сообщения... 📩",
        "Пицца — хорошая идея. 🍕",
        "Кто-то из старого чата вспомнит о тебе. 👀",
        "Не спорь с дураками, сегодня они особенно активны. 🤡",
        "Удача на твоей стороне, дерзай! 🍀",
        "Сделай перерыв, ты заслужил. ☕",
        "Сегодня лучше не рисковать. ⚠️",
      ];
      const p = predictions[Math.floor(Math.random() * predictions.length)];
      await ctx.reply(`🔮 ${p}`);
      break;
    }
    case "menu_psychologist": {
      await ctx.answerCallbackQuery("🧠 Анализирую...");
      await ctx.reply("🧠 Ты пришёл к мемному боту за психологической помощью?\n\nЛадно, вот совет: закрой телеграм и погуляй 20 минут. Вернёшься — будет легче.");
      break;
    }
    case "menu_fact": {
      await ctx.answerCallbackQuery("🧐 Ищу факт...");
      const facts = [
        "Осьминоги имеют три сердца и синюю кровь. 🐙",
        "Медведи-панды кактуса не едят, бамбук — да. 🐼",
        "Человеческий мозг потребляет 20% энергии тела. 🧠",
        "В космосе нельзя плакать — слёзы не текут, а собираются в шарики. 🚀",
        "Бананы — ягоды, а клубника — нет. 🍌",
      ];
      const f = facts[Math.floor(Math.random() * facts.length)];
      await ctx.reply(`🧐 ${f}`);
      break;
    }
    case "menu_horoscope": {
      await ctx.answerCallbackQuery("♈ Смотрю звёзды...");
      const horoscopes = [
        "♈ Овен: Сегодня твоя энергия зашкаливает. Направь её на дело, а не на срачи в чате.",
        "♉ Телец: Финансовая удача близко. Не трать всё на стикеры.",
        "♊ Близнецы: Двойственность — твой конёк. Сегодня оба твоих лица будут правы.",
        "♋ Рак: Эмоции на пределе. Лучше не читать треды с 50+ сообщений.",
        "♌ Лев: В центре внимания. Сделай мем, он зайдёт.",
        "♍ Дева: Перфекционизм мешает. Отправь сообщение с опечаткой — освободись.",
      ];
      const h = horoscopes[Math.floor(Math.random() * horoscopes.length)];
      await ctx.reply(`♈ ${h}`);
      break;
    }
    case "menu_imitate": {
      await ctx.answerCallbackQuery("👤 Анализирую стиль...");
      await ctx.reply("👤 Напиши /imitate @username — я попробую писать в стиле этого человека.");
      break;
    }
    case "menu_back": {
      await answerAndEdit(ctx, `${formatBold("🎴 Меню Мамули")}\n\nВыбери, что хочешь:`, mainMenuKeyboard);
      break;
    }

    default: {
      await ctx.answerCallbackQuery("❓ Неизвестная кнопка");
    }
  }
}

export function registerCallbacks(bot: Bot<Context>): void {
  bot.on("callback_query:data", handleCallback);
}
