import type { Context } from "grammy";
import { getConfig } from "../../core/config.js";

type NextFunction = () => Promise<void>;

interface UserBucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<number, UserBucket>();

export function rateLimitMiddleware() {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const config = getConfig();
    const limit = Number.parseInt(config.RATE_LIMIT_PER_MINUTE, 10);
    if (!Number.isFinite(limit) || limit <= 0) {
      await next();
      return;
    }

    const userId = ctx.from?.id;
    if (!userId) {
      await next();
      return;
    }

    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    let bucket = buckets.get(userId);

    if (!bucket || now - bucket.windowStart > windowMs) {
      bucket = { count: 1, windowStart: now };
      buckets.set(userId, bucket);
      await next();
      return;
    }

    bucket.count++;
    if (bucket.count > limit) {
      // Silently drop or reply with cooldown
      const remaining = Math.ceil((bucket.windowStart + windowMs - now) / 1000);
      console.error(`[RATE LIMIT] user=${userId} exceeded ${limit}/min, cooldown ${remaining}s`);
      if (ctx.message || ctx.callbackQuery) {
        await ctx.reply(`⏳ Слишком быстро. Подожди ${remaining}с.`, {
          reply_to_message_id: ctx.message?.message_id,
        });
      }
      return;
    }

    await next();
  };
}

// Cleanup old buckets every 5 minutes
setInterval(() => {
  const now = Date.now();
  const cutoff = 2 * 60 * 1000; // remove after 2 min of inactivity
  for (const [userId, bucket] of buckets) {
    if (now - bucket.windowStart > cutoff) {
      buckets.delete(userId);
    }
  }
}, 5 * 60 * 1000);
