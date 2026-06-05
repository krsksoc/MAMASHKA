import type { Context } from "grammy";
import { getOrCreateUser, updateBirthDate } from "../../data/repos/users.js";
import { insertMessage } from "../../data/repos/messages.js";

type NextFunction = () => Promise<void>;

export function trackerMiddleware() {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    if (!ctx.from || !ctx.chat) {
      await next();
      return;
    }

    const chatId = ctx.chat.id;
    const telegramId = ctx.from.id;
    const username = ctx.from.username ?? null;
    const displayName = ctx.from.first_name ?? null;

    const user = getOrCreateUser(telegramId, chatId, username, displayName);

    // Save birth date from Telegram if available
    const from = ctx.from as { birth_date?: string } | null;
    if (user && from?.birth_date) {
      const parts = from.birth_date.split("-");
      const year = parts[0] ? parseInt(parts[0], 10) : null;
      const month = parts[1] ? parseInt(parts[1], 10) : null;
      updateBirthDate(user.id, year, month);
    }

    if (user) {
      const msg = ctx.message;
      const text = msg && "text" in msg ? msg.text : null;
      const hasSticker = Boolean(msg && "sticker" in msg);
      const stickerEmoji: string | null = msg && "sticker" in msg && msg.sticker?.emoji ? msg.sticker.emoji : null;
      const replyToMsg = msg && "reply_to_message" in msg ? msg.reply_to_message : null;
      let replyToUserId: number | null = null;
      if (replyToMsg && replyToMsg.from) {
        const replyUser = getOrCreateUser(
          replyToMsg.from.id,
          chatId,
          replyToMsg.from.username ?? null,
          replyToMsg.from.first_name ?? null,
        );
        replyToUserId = replyUser?.id ?? null;
      }

      insertMessage(
        chatId,
        user.id,
        text,
        hasSticker,
        stickerEmoji,
        replyToUserId,
      );
    }

    await next();
  };
}