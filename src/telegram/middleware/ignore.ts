import type { Context } from "grammy";
import { getUserByTelegramId, isUserIgnored } from "../../data/repos/users.js";

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
