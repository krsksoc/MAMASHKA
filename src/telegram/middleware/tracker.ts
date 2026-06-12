import type { Context } from "grammy";
import { insertMessage } from "../../data/repos/messages.js";
import { touchUserChat } from "../../data/repos/user_chats.js";
import { getOrCreateUser, updateBirthDate } from "../../data/repos/users.js";
import { handleIntroAnswer } from "../../services/welcome.js";

type NextFunction = () => Promise<void>;

export function trackerMiddleware() {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    if (!ctx.from || !ctx.chat) {
      console.error(`[TRACKER] no ctx.from or ctx.chat, skipping`);
      await next();
      return;
    }

    const chatId = ctx.chat.id;
    const telegramId = ctx.from.id;
    const text = ctx.message && typeof ctx.message.text === "string" ? ctx.message.text : null;
    console.error(`[TRACKER] text="${text}" chat=${chatId} from=${telegramId}`);
    const username = ctx.from.username ?? null;
    const displayName = ctx.from.first_name ?? null;

    const user = getOrCreateUser(telegramId, chatId, username, displayName);

    // Track user's chat membership for WebApp
    const chatTitle = ctx.chat.type === "private" ? null : (ctx.chat.title ?? null);
    if (user) {
      touchUserChat(user.id, chatId, chatTitle);
    }

    // Check if this is an intro answer from a new user
    if (text && (await handleIntroAnswer(ctx))) {
      await next();
      return;
    }

    if (user) {
      const msg = ctx.message;
      const text = msg && typeof msg.text === "string" ? msg.text : null;
      const hasSticker = Boolean(msg && "sticker" in msg);
      const stickerEmoji: string | null =
        msg && "sticker" in msg && msg.sticker?.emoji ? msg.sticker.emoji : null;
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

      insertMessage(chatId, user.id, text, hasSticker, stickerEmoji, replyToUserId);
    }

    await next();
  };
}
