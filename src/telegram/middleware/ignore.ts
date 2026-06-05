import type { Context } from "grammy";
import { isUserIgnored } from "../../data/repos/users.js";
import { getOrCreateUser } from "../../data/repos/users.js";

type NextFunction = () => Promise<void>;

export function ignoreMiddleware() {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    if (!ctx.from || !ctx.chat) {
      await next();
      return;
    }
    const user = getUserFromCtx(ctx);
    if (user && isUserIgnored(user.id)) {
      return;
    }
    await next();
  };
}

function getUserFromCtx(ctx: Context) {
  const chatId = ctx.chat?.id;
  const telegramId = ctx.from?.id;
  if (!chatId || !telegramId) return null;
  return getOrCreateUser(telegramId, chatId, ctx.from.username ?? null, ctx.from.first_name ?? null);
}