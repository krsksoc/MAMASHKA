import type { Bot, Context } from "grammy";
import { getUserByTelegramId } from "../data/repos/users.js";
import { getTopUsers, getUserMessageCount } from "../services/stats.js";
import { generateMamoolyaNews } from "../services/summary.js";
import {
  generateDvach,
  generateFact,
  generateHoroscope,
  generatePsychologist,
  rollDice,
} from "../services/entertainment.js";
import { formatBold, formatRank, formatUserName } from "./formatters/index.js";
import {
  handleAchievementsBack,
  handleAchievementsCategory,
  handleAchievementsToggleNotify,
} from "./handlers/achievements.js";
import { handleQuotes } from "./handlers/quotes.js";
import { handleIgnoreCallback } from "./middleware/ignore.js";

// Hard-coded predictor (callback has no chat-scoped rep; just generate random).
function predictRandom(): string {
  const list = [
    "Сегодня твой день! ✨",
    "Жди неожиданного сообщения... 📩",
    "Пицца — хорошая идея. 🍕",
    "Кто-то из старого чата вспомнит о тебе. 👀",
    "Не спорь с дураками, сегодня они особенно активны. 🤡",
    "Удача на твоей стороне, дерзай! 🍀",
    "Сделай перерыв, ты заслужил. ☕",
    "Сегодня лучше не рисковать. ⚠️",
  ];
  const p = list[Math.floor(Math.random() * list.length)] ?? list[0] ?? "";
  return `🔮 ${p}`;
}

const WEBAPP_URL = "https://maman.krsksoc.pwtr.dev/?v=12&t=20260802-1755";

// Reply in current chat, keeping keyboard. Used by buttons that previously returned text-only stubs.
async function replyWithMenu(ctx: Context, text: string) {
  await ctx.reply(text, { parse_mode: "HTML", reply_markup: mainMenuKeyboard as any });
}

// Inline keyboards
const mainMenuKeyboard = {
  inline_keyboard: [
    [{ text: "🎴 Открыть Мамулю", web_app: { url: WEBAPP_URL } }],
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
    [{ text: "⬅️ Назад", callback_data: "menu_back" }],
  ],
};

// Utility to answer callback and edit message
async function answerAndEdit(
  ctx: Context,
  text: string,
  keyboard?:
    | { inline_keyboard: { text: string; callback_data?: string; url?: string }[][] }
    | undefined,
) {
  await ctx.answerCallbackQuery();
  if (ctx.callbackQuery?.message) {
    await ctx.editMessageText(text, {
      parse_mode: "HTML",
      reply_markup: keyboard as any,
    });
  } else {
    await ctx.reply(text, { parse_mode: "HTML", reply_markup: keyboard as any });
  }
}

export async function handleCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data ?? "";
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
      const fromId = ctx.from?.id;
      if (!fromId) {
        await ctx.reply("Не удалось определить пользователя.");
        return;
      }
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
    case "menu_top_nolifers": {
      await ctx.answerCallbackQuery("🏆 Собираю топ...");
      const top = getTopUsers(chatId, 10);
      if (top.length === 0) {
        await ctx.reply("Нет данных.");
        return;
      }
      const lines = top.map(
        (u, i) =>
          `${formatRank(i + 1)} ${formatUserName(u.username, u.displayName)} — ${u.messageCount} сообщ.`,
      );
      await ctx.reply(`${formatBold("Топ ноулайферов")}\n\n${lines.join("\n")}`);
      break;
    }
    case "menu_summary": {
      // Available to everyone.
      await ctx.answerCallbackQuery("⏳ Собираю саммари...");
      const summary = await generateMamoolyaNews(chatId, 1000);
      await ctx.reply(`💬 ${formatBold("Саммари чата")}\n\n${summary}`, {
        reply_markup: mainMenuKeyboard,
      });
      break;
    }
    case "menu_fun": {
      await answerAndEdit(
        ctx,
        `${formatBold("🎲 Развлечения")}\n\nВыбери, чем развлечься:`,
        funMenuKeyboard,
      );
      break;
    }

    case "menu_dvach": {
      await ctx.answerCallbackQuery("🃏 Ищу пост...");
      const userId = ctx.from?.id ?? 0;
      const userName = ctx.from?.first_name ?? ctx.from?.username ?? null;
      if (!userId) {
        await ctx.reply("Не удалось определить пользователя.");
        return;
      }
      const result = await generateDvach(userId, chatId, userName);
      await replyWithMenu(ctx, result);
      break;
    }

    case "menu_quotes": {
      await ctx.answerCallbackQuery("📜 Цитаты...");
      // Synthesize a /quotes command-style message so handleQuotes routes properly.
      // Grammy's Context.message is typed readonly; cast through unknown to bypass.
      (ctx as unknown as { message: { text: string; chat: typeof ctx.chat; from: typeof ctx.from } }).message = {
        text: "/quotes",
        chat: ctx.chat,
        from: ctx.from,
      } as never;
      await handleQuotes(ctx);
      break;
    }

    case "menu_help": {
      await answerAndEdit(
        ctx,
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
      await answerAndEdit(
        ctx,
        `${formatBold("🎴 Меню Мамули")}\n\nВыбери, что хочешь:`,
        mainMenuKeyboard,
      );
      break;
    }

    // === Fun submenu ===
    case "menu_roll": {
      await ctx.answerCallbackQuery("🎲 Бросаю...");
      await replyWithMenu(
        ctx,
        `🎲 Выпало: <b>${await rollDice(ctx.from?.first_name ?? null)}</b>`,
      );
      break;
    }
    case "menu_predict": {
      await ctx.answerCallbackQuery("🔮 Гадаю...");
      await replyWithMenu(ctx, predictRandom());
      break;
    }
    case "menu_psychologist": {
      await ctx.answerCallbackQuery("🧠 Анализирую...");
      const userId = ctx.from?.id ?? 0;
      const userName = ctx.from?.first_name ?? ctx.from?.username ?? null;
      if (!userId) {
        await ctx.reply("Не удалось определить пользователя.");
        return;
      }
      const msg = ""; // no specific user message in callback context
      await replyWithMenu(ctx, await generatePsychologist(userId, chatId, userName, msg));
      break;
    }
    case "menu_fact": {
      await ctx.answerCallbackQuery("🧐 Ищу факт...");
      const userId = ctx.from?.id ?? 0;
      const userName = ctx.from?.first_name ?? ctx.from?.username ?? null;
      if (!userId) {
        await ctx.reply("Не удалось определить пользователя.");
        return;
      }
      await replyWithMenu(ctx, await generateFact(userId, chatId, userName));
      break;
    }
    case "menu_horoscope": {
      await ctx.answerCallbackQuery("♈ Смотрю звёзды...");
      const userId = ctx.from?.id ?? 0;
      const userName = ctx.from?.first_name ?? ctx.from?.username ?? null;
      if (!userId) {
        await ctx.reply("Не удалось определить пользователя.");
        return;
      }
      // generateHoroscope(userName, sign, userId, chatId) — pass empty sign to let DB resolve.
      await replyWithMenu(ctx, await generateHoroscope(userName, "", userId, chatId));
      break;
    }
    case "menu_imitate": {
      await ctx.answerCallbackQuery("👤 Анализирую стиль...");
      // Forward to /imitate handler (which expects a username arg). Tell user to type it.
      await replyWithMenu(
        ctx,
        "👤 <b>Имитация</b>\n\nЧтобы я подделал стиль юзера, ответь на сообщение в чате командой <code>/imitate</code> или напиши <code>/imitate @username</code>.",
      );
      break;
    }
    case "menu_back": {
      await answerAndEdit(
        ctx,
        `${formatBold("🎴 Меню Мамули")}\n\nВыбери, что хочешь:`,
        mainMenuKeyboard,
      );
      break;
    }

    default: {
      // Achievement inline buttons: ach:cat:<id>, ach:back, ach:toggle_notify
      if (data.startsWith("ach:cat:")) {
        await handleAchievementsCategory(ctx);
        break;
      }
      if (data === "ach:back") {
        await handleAchievementsBack(ctx);
        break;
      }
      if (data === "ach:toggle_notify") {
        await handleAchievementsToggleNotify(ctx);
        break;
      }
      // Ignore inline buttons: ignore:on, ignore:off, ignore:cancel, ignore:noop
      if (data.startsWith("ignore:")) {
        await handleIgnoreCallback(ctx);
        break;
      }
      await ctx.answerCallbackQuery("❓ Неизвестная кнопка");
    }
  }
}
export function registerCallbacks(bot: Bot<Context>): void {
  bot.on("callback_query:data", handleCallback);
}
