import type { Bot, Context } from "grammy";
import { handleAdmin } from "./handlers/admin.js";
import { handleAsk } from "./handlers/ask.js";
import { handleFun } from "./handlers/fun.js";
import { handleHealth } from "./handlers/health.js";
import { handleMisc } from "./handlers/misc.js";
import { handleQuotes } from "./handlers/quotes.js";
import { handleReputation } from "./handlers/reputation.js";
import { handleStats } from "./handlers/stats.js";

import { adminOnly } from "./middleware/auth.js";

export function registerHandlers(bot: Bot<Context>): void {
  bot.command("my_stats", handleStats);
  bot.command("stats", handleStats);
  bot.command("top_nolifers", handleStats);
  bot.command("top_pairs", handleStats);
  bot.command("sticker_stats", handleStats);
  bot.command("friend_foe_stats", handleReputation);
  bot.command("friend_foe_top", handleReputation);
  bot.command("days_without_drama", handleReputation);
  bot.command("drama", handleReputation);
  bot.command("dvach", handleFun);
  bot.command("psychologist", handleFun);
  bot.command("fact", handleFun);
  bot.command("predict", handleFun);
  bot.command("imitate", handleFun);
  bot.command("horoscope", handleFun);
  bot.command("bottle", handleFun);
  bot.command("roll", handleFun);
  bot.command("quote", handleQuotes);
  bot.command("quotes", handleQuotes);
  bot.command("randomquote", handleQuotes);
  bot.command("summary", handleAdmin);
  bot.command("ask", handleAsk);
  bot.command("summary_week", adminOnly(), handleAdmin);
  bot.command("ban_vote", adminOnly(), handleAdmin);
  bot.command("publish_anons", adminOnly(), handleAdmin);
  bot.command("anon_sender", adminOnly(), handleAdmin);
  bot.command("start", handleMisc);
  bot.command("help", handleMisc);
  bot.command("menu", handleMisc);
  bot.command("m_version", handleMisc);
  bot.command("ignore_me", handleMisc);
  bot.command("notice_me", handleMisc);
  bot.command("webapp", handleMisc);
  bot.command("health", handleHealth);
}
