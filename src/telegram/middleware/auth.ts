import type { Context } from "grammy";
import { getAdminIds, getConfig } from "../../core/config.js";

type NextFunction = () => Promise<void>;

export function adminOnly() {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const config = getConfig();
    const adminIds = getAdminIds(config);
    const userId = ctx.from?.id;
    if (!userId || adminIds.length === 0) {
      await ctx.reply("⛔ Недостаточно прав.");
      return;
    }
    if (!adminIds.includes(userId)) {
      await ctx.reply("⛔ Недостаточно прав.");
      return;
    }
    await next();
  };
}