import type { Context } from "grammy";
import { getUserByTelegramId, isUserIgnored, setIgnored } from "../../data/repos/users.js";
import { formatBold } from "../formatters/index.js";

type NextFunction = () => Promise<void>;

export function ignoreMiddleware() {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    if (!ctx.from || !ctx.chat) {
      await next();
      return;
    }

    // For non-message updates (callbacks, etc.), check ignore without bumping message_count
    if (!ctx.message) {
      const user = getUserByTelegramId(ctx.from.id, ctx.chat.id);
      if (user && isUserIgnored(user.id)) {
        return;
      }
      await next();
      return;
    }

    // For messages, defer to trackerMiddleware which creates the user and checks ignore
    await next();
  };
}

// === /ignore_me — let user mute themselves ===

export async function handleIgnoreMe(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const fromId = ctx.from?.id;
  if (!chatId || !fromId) return;

  const user = getUserByTelegramId(fromId, chatId);
  if (!user) {
    await ctx.reply("Сначала напиши что-нибудь в чат, потом /ignore_me.");
    return;
  }

  if (isUserIgnored(user.id)) {
    // Already ignored — offer to unignore
    await ctx.reply(
      `${formatBold("Ты уже в режиме игнора")}\n\n` +
        `Бот не считает твои сообщения, не показывает в статистике, ` +
        `не открывает тебе ачивки за активность.\n\n` +
        `Хочешь вернуться?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "✅ Вернуться", callback_data: "ignore:off" }],
            [{ text: "❌ Остаться в игноре", callback_data: "ignore:noop" }],
          ],
        },
      },
    );
    return;
  }

  // Not ignored yet — confirm
  await ctx.reply(
    `${formatBold("Встать в режим игнора?")}\n\n` +
      `Что это значит:\n` +
      `— Бот перестанет считать твои сообщения\n` +
      `— Ты выпадаешь из /top_nolifers и /my_stats\n` +
      `— Новые ачивки за активность не открываются\n` +
      `— /achievements и /ignore_me (отключение) продолжают работать\n\n` +
      `Вернуться можно в любой момент через /ignore_me.`,
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Да, в игнор", callback_data: "ignore:on" }],
          [{ text: "❌ Не надо", callback_data: "ignore:cancel" }],
        ],
      },
    },
  );
}

export async function handleIgnoreCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data ?? "";
  const chatId = ctx.chat?.id;
  const fromId = ctx.from?.id;
  if (!chatId || !fromId) return;

  const user = getUserByTelegramId(fromId, chatId);
  if (!user) {
    await ctx.answerCallbackQuery("Не знаю тебя в этом чате");
    return;
  }

  switch (data) {
    case "ignore:on": {
      setIgnored(user.id, true);
      await ctx.answerCallbackQuery("🔕 Ты в игноре");
      // Edit the original message in place
      try {
        await ctx.editMessageText(
          `${formatBold("Готово. Ты в игноре.")}\n\n` +
            `Сообщения больше не считаются. Вернуться: /ignore_me.`,
        );
      } catch {
        await ctx.reply(
          `${formatBold("Готово. Ты в игноре.")}\n\nВернуться: /ignore_me.`,
        );
      }
      break;
    }
    case "ignore:off": {
      setIgnored(user.id, false);
      await ctx.answerCallbackQuery("🔔 С возвращением");
      try {
        await ctx.editMessageText(
          `${formatBold("С возвращением.")}\n\n` +
            `Сообщения снова считаются, статистика работает.`,
        );
      } catch {
        await ctx.reply(`${formatBold("С возвращением.")}\n\nСтатистика снова работает.`);
      }
      break;
    }
    case "ignore:cancel": {
      await ctx.answerCallbackQuery("Ок, не трогаем");
      try {
        await ctx.editMessageText(`${formatBold("Ок. Не трогаем.")}`);
      } catch {
        await ctx.reply(`${formatBold("Ок. Не трогаем.")}`);
      }
      break;
    }
    case "ignore:noop": {
      await ctx.answerCallbackQuery("Ок, остаёшься");
      try {
        await ctx.editMessageText(`${formatBold("Ок, остаёшься в игноре.")}`);
      } catch {
        await ctx.reply(`${formatBold("Ок, остаёшься в игноре.")}`);
      }
      break;
    }
    default:
      await ctx.answerCallbackQuery("Не понял");
  }
}
