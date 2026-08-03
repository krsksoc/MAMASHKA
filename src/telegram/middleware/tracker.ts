import type { Context } from "grammy";
import { insertMessage } from "../../data/repos/messages.js";
import { touchUserChat } from "../../data/repos/user_chats.js";
import { bumpMessage, getOrCreateUserNoBump, isUserIgnored } from "../../data/repos/users.js";
import { getDb } from "../../data/db.js";
import { evaluateForUser, isTrackedChat } from "../../services/achievements.js";
import { handleIntroAnswer, askIntroQuestionPublic } from "../../services/welcome.js";
import { postUnlockNotifications } from "../handlers/achievements.js";

const LOG = (msg: string) => console.error(`[TRACKER] ${msg}`);

// KRSK soc is the only chat with intro flow
const KRSK_SOC_CHAT_ID = -1001108346327;
const INTRO_FIELDS = ["famous_for", "gender_role", "age", "lifestyle", "morals", "sex_role"] as const;

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

    // NoBump first; we bump explicitly below only when the message is actually tracked.
    const user = getOrCreateUserNoBump(telegramId, chatId, username, displayName);

    // Check ignore flag before tracking this message
    if (user && isUserIgnored(user.id)) {
      console.error(`[TRACKER] user=${user.id} is ignored, skipping`);
      await next();
      return;
    }

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

    // Tracker hook: detect "first-time" user (created silently by getOrCreateUserNoBump
    // without is_new=1, e.g. invited before bot joined the chat, or joined via link
    // without triggering new_chat_members webhook). If all intro fields are empty
    // and message_count is 0, this is effectively a new user — kick off onboarding.
    if (
      user &&
      chatId === KRSK_SOC_CHAT_ID &&
      !user.isNew &&
      !user.introCompleted &&
      user.messageCount === 0 &&
      INTRO_FIELDS.every((f) => user[f as keyof typeof user] === null || user[f as keyof typeof user] === undefined || user[f as keyof typeof user] === "")
    ) {
      try {
        const db = getDb();
        db.prepare("UPDATE users SET is_new = 1, intro_step = 0 WHERE id = ?").run(user.id);
        // Update in-memory copy so subsequent checks see isNew=true
        user.isNew = true;
        user.introStep = 0;
        LOG(`Detected fresh user ${user.id} (tg=${telegramId}) — kicking off intro flow`);
        // Fire first intro question. Fire-and-forget so we don't block tracking.
        void askIntroQuestionPublic(ctx, user.id, 0).catch((e) =>
          LOG(`askIntroQuestion failed for user=${user.id}: ${String(e)}`),
        );
      } catch (e) {
        console.error(`[TRACKER] failed to mark fresh user ${user.id} as new:`, e);
      }
    }

    if (user) {
      const msg = ctx.message;
      const text = msg && typeof msg.text === "string" ? msg.text : null;
      const hasSticker = Boolean(msg && "sticker" in msg);
      const stickerEmoji: string | null =
        msg && "sticker" in msg && msg.sticker?.emoji ? msg.sticker.emoji : null;
      const replyToMsg = msg && "reply_to_message" in msg ? msg.reply_to_message : null;
      let replyToUserId: number | null = null;
      if (replyToMsg?.from) {
        // Do NOT bump the reply target's message_count — they didn't speak here.
        const replyUser = getOrCreateUserNoBump(
          replyToMsg.from.id,
          chatId,
          replyToMsg.from.username ?? null,
          replyToMsg.from.first_name ?? null,
        );
        replyToUserId = replyUser?.id ?? null;
      }

      insertMessage(chatId, user.id, text, hasSticker, stickerEmoji, replyToUserId);
      // Single, explicit bump for the actual author of *this* message.
      bumpMessage(user.id);

      // === Achievements hook (only for tracked chats) ===
      if (isTrackedChat(chatId)) {
        try {
          const { unlockedNow } = evaluateForUser(chatId, user.id);
          if (unlockedNow.length > 0) {
            // Fire-and-forget notification — don't block the message pipeline.
            void postUnlockNotifications(
              {
                api: ctx.api,
                chatId,
                userId: user.id,
                userDisplayName: user.displayName ?? null,
                userUsername: user.username ?? null,
              },
              unlockedNow,
            ).catch((e) =>
              console.error(`[TRACKER] ach notify failed for user=${user.id}:`, e),
            );
          }
        } catch (e) {
          console.error(`[TRACKER] ach eval failed for user=${user.id}:`, e);
        }
      }
    }

    await next();
  };
}
