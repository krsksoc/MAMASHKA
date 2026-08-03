import type { Api, Context } from "grammy";
import { getUserByTelegramId } from "../../data/repos/users.js";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  decideNotify,
  evaluateForUser,
  getAchievementCategory,
  isTrackedChat,
  KRSK_SOC_CHAT_ID,
  notifyInChatEnabled,
  recordNotification,
  setSetting,
  type AchievementCategory,
} from "../../services/achievements.js";
import { formatBold, formatUserName } from "../formatters/index.js";

// === /achievements — list command (with category buttons) ===

/**
 * Render the main /achievements summary.
 * @param ctx grammY context
 * @param editMode if true, edit the current message in place (for inline button callbacks);
 *                 if false, reply with a new message (for the /achievements command itself)
 */
export async function renderAchievementsMain(ctx: Context, editMode: boolean): Promise<void> {
  const chatId = ctx.chat?.id;
  const fromId = ctx.from?.id;
  if (!chatId || !fromId) return;

  // Two places we serve /achievements from:
  //   1. /krsk soc group chat — natural place, evaluate live.
  //   2. Private DM (ЛС) — show progress as if you were in /krsk soc.
  //      DM messages aren't tracked, so we always read from /krsk soc data.
  //   3. Other groups (dev chats) — politely decline.
  const isDM = chatId > 0;
  const isKrsksoc = isTrackedChat(chatId);

  if (!isDM && !isKrsksoc) {
    const text = `🏅 Достижения работают только в /krsk soc. Этот чат — тестовый, тут нет прогресса.`;
    if (editMode) {
      try {
        await ctx.editMessageText(text);
      } catch {
        await ctx.reply(text);
      }
    } else {
      await ctx.reply(text);
    }
    return;
  }

  const targetChatId = isKrsksoc ? chatId : -1001108346327;
  const user = getUserByTelegramId(fromId, targetChatId);
  if (!user) {
    const text = isDM
      ? `🏅 Достижения работают в /krsk soc.\n\n` +
        `Я тебя ещё не знаю в /krsk soc. Напиши что-нибудь в чат, потом повтори /achievements.`
      : `Я тебя не знаю. Напиши что-нибудь в чат сначала.`;
    if (editMode) {
      try {
        await ctx.editMessageText(text);
      } catch {
        await ctx.reply(text);
      }
    } else {
      await ctx.reply(text);
    }
    return;
  }

  // Trigger evaluation so new unlocks show up immediately.
  const { allUnlocked } = evaluateForUser(targetChatId, user.id);

  // Counts per category for button labels
  const counts: Record<AchievementCategory, { total: number; unlocked: number }> = {
    activity: { total: 0, unlocked: 0 },
    social: { total: 0, unlocked: 0 },
    lore: { total: 0, unlocked: 0 },
  };
  for (const a of ACHIEVEMENTS) {
    const c = getAchievementCategory(a.id);
    counts[c].total += 1;
  }
  for (const a of allUnlocked) {
    counts[getAchievementCategory(a.id)].unlocked += 1;
  }

  const total = ACHIEVEMENTS.length;
  const unlockedCount = allUnlocked.length;

  let msg = `${formatBold("🏅 Твои достижения")}\n\n`;
  msg += `Открыто: ${unlockedCount}/${total}\n\n`;
  msg += `Выбери категорию ↓`;

  const buttons = ACHIEVEMENT_CATEGORIES.map((c) => {
    const k = counts[c.id];
    return [
      {
        text: `${c.icon} ${c.title} — ${k.unlocked}/${k.total}`,
        callback_data: `ach:cat:${c.id}`,
      },
    ];
  });
  // Add a button row for /achievements_notify toggle
  const notifyEnabled = notifyInChatEnabled(targetChatId, user.id);
  buttons.push([
    {
      text: notifyEnabled ? "🔔 Уведомления: ВКЛ" : "🔕 Уведомления: ВЫКЛ",
      callback_data: "ach:toggle_notify",
    },
  ]);

  const replyMarkup = { inline_keyboard: buttons };
  if (editMode) {
    try {
      await ctx.editMessageText(msg, { reply_markup: replyMarkup });
    } catch (e) {
      const errStr = String(e);
      if (errStr.includes("message is not modified") || errStr.includes("MESSAGE_NOT_MODIFIED")) {
        return;
      }
      console.error(`[ACH] editMessageText failed in main view: ${errStr}, falling back to reply`);
      await ctx.reply(msg, { reply_markup: replyMarkup });
    }
  } else {
    await ctx.reply(msg, { reply_markup: replyMarkup });
  }
}

export async function handleAchievements(ctx: Context): Promise<void> {
  await renderAchievementsMain(ctx, /* editMode = */ false);
}

/** Render achievements of one category as a single message (used by inline buttons). */
export async function handleAchievementsCategory(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data ?? "";
  const match = data.match(/^ach:cat:(activity|social|lore)$/);
  const cat = match?.[1] as AchievementCategory | undefined;

  const chatId = ctx.chat?.id;
  const fromId = ctx.from?.id;
  if (!chatId || !fromId || !cat) {
    await ctx.answerCallbackQuery("❌ Не удалось разобрать категорию");
    return;
  }

  const isDM = chatId > 0;
  const isKrsksoc = isTrackedChat(chatId);
  if (!isDM && !isKrsksoc) {
    await ctx.answerCallbackQuery("Достижения только в /krsk soc");
    return;
  }
  const targetChatId = isKrsksoc ? chatId : -1001108346327;
  const user = getUserByTelegramId(fromId, targetChatId);
  if (!user) {
    await ctx.answerCallbackQuery("Не знаю тебя в /krsk soc");
    return;
  }

  const { allUnlocked, locked } = evaluateForUser(targetChatId, user.id);

  const catMeta = ACHIEVEMENT_CATEGORIES.find((c) => c.id === cat);
  const catTitle = catMeta ? `${catMeta.icon} ${catMeta.title}` : cat;

  const unlockedInCat = allUnlocked.filter((a) => getAchievementCategory(a.id) === cat);
  const lockedInCat = locked.filter((a) => getAchievementCategory(a.id) === cat);

  let msg = `${formatBold(catTitle)}\n\n`;
  if (unlockedInCat.length > 0) {
    msg += `${formatBold("Открыто")}\n`;
    unlockedInCat
      .sort((a, b) => (a.unlockedAt ?? "").localeCompare(b.unlockedAt ?? ""))
      .forEach((a) => {
        msg += `✅ ${a.icon} ${a.title} — ${a.desc}\n`;
      });
    msg += "\n";
  }
  if (lockedInCat.length > 0) {
    msg += `${formatBold("В процессе")}\n`;
    lockedInCat.forEach((a) => {
      const p = a.progress ? ` — ${a.progress.current}/${a.progress.target}` : "";
      msg += `⏳ ${a.icon} ${a.title}${p}\n   ${a.desc}\n`;
    });
  }

  if (unlockedInCat.length === 0 && lockedInCat.length === 0) {
    msg += `В этой категории пока пусто.\n`;
  }

  await ctx.answerCallbackQuery();
  // Edit the original /achievements message in place to avoid spamming chat with N messages.
  // If the message can't be edited (too old / different chat), fall back to reply.
  try {
    await ctx.editMessageText(msg, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⬅️ Назад к ачивкам",
              callback_data: "ach:back",
            },
          ],
        ],
      },
    });
  } catch (e) {
    const errStr = String(e);
    if (errStr.includes("message is not modified") || errStr.includes("MESSAGE_NOT_MODIFIED")) {
      // Same content as current — no-op, just acknowledge
      return;
    }
    // Fallback: send as new message if edit fails (e.g. message too old)
    console.error(`[ACH] editMessageText failed for category ${cat}: ${errStr}, falling back to reply`);
    await ctx.reply(msg, {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "⬅️ Назад к ачивкам",
              callback_data: "ach:back",
            },
          ],
        ],
      },
    });
  }
}

/** Handle "back" button: re-render the main /achievements summary in place. */
export async function handleAchievementsBack(ctx: Context): Promise<void> {
  // Edit the current message back to the main achievements summary.
  // Falls back to reply if edit fails (e.g. message too old).
  await renderAchievementsMain(ctx, /* editMode = */ true);
}

/** Toggle notify_in_chat setting via inline button. */
export async function handleAchievementsToggleNotify(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const fromId = ctx.from?.id;
  if (!chatId || !fromId) {
    await ctx.answerCallbackQuery("❌ Ошибка");
    return;
  }
  const isDM = chatId > 0;
  const isKrsksoc = isTrackedChat(chatId);
  if (!isDM && !isKrsksoc) {
    await ctx.answerCallbackQuery("Только /krsk soc");
    return;
  }
  const targetChatId = isKrsksoc ? chatId : -1001108346327;
  const user = getUserByTelegramId(fromId, targetChatId);
  if (!user) {
    await ctx.answerCallbackQuery("Не знаю тебя в /krsk soc");
    return;
  }

  const current = notifyInChatEnabled(targetChatId, user.id);
  const next = !current;
  setSetting(targetChatId, user.id, "notify_in_chat", next ? "1" : "0");
  await ctx.answerCallbackQuery(
    next ? "🔔 Уведомления включены" : "🔕 Уведомления выключены",
  );
  // Re-render the main summary so the button label updates — edit in place.
  await renderAchievementsMain(ctx, /* editMode = */ true);
}

// === /achievements_notify on|off ===

export async function handleAchievementsNotify(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  const fromId = ctx.from?.id;
  if (!chatId || !fromId) return;

  // Settings apply to /krsk soc (or DM showing /krsk soc data).
  // Dev group chats are declined.
  const isDM = chatId > 0;
  const isKrsksoc = isTrackedChat(chatId);
  if (!isDM && !isKrsksoc) {
    await ctx.reply("Настройка работает только в /krsk soc.");
    return;
  }
  const targetChatId = isKrsksoc ? chatId : -1001108346327;

  const text = ctx.message && typeof ctx.message.text === "string" ? ctx.message.text : "";
  const args = text.split(/\s+/).slice(1).join(" ").trim().toLowerCase();

  const user = getUserByTelegramId(fromId, targetChatId);
  if (!user) {
    await ctx.reply("Сначала напиши что-нибудь в /krsk soc.");
    return;
  }

  let enabled: boolean;
  if (args === "on" || args === "1" || args === "yes" || args === "вкл") {
    enabled = true;
  } else if (args === "off" || args === "0" || args === "no" || args === "выкл") {
    enabled = false;
  } else if (args === "" || args === "status") {
    const current = notifyInChatEnabled(targetChatId, user.id);
    await ctx.reply(
      `${formatBold("🏅 Уведомления о достижениях")}\n\n` +
        `Сейчас: ${current ? "✅ в чат" : "🔕 выключены"}\n\n` +
        `Включить: /achievements_notify on\n` +
        `Выключить: /achievements_notify off`,
    );
    return;
  } else {
    await ctx.reply(
      "Использование:\n/achievements_notify on — включить уведомления в чат\n/achievements_notify off — выключить",
    );
    return;
  }

  setSetting(targetChatId, user.id, "notify_in_chat", enabled ? "1" : "0");
  await ctx.reply(
    enabled
      ? "✅ Уведомления о новых ачивках в чате включены (с премиальными)."
      : "🔕 Уведомления о новых ачивках в чате выключены.",
  );
}

// === Notifier — called after hook evaluates user ===

export interface NotifyContext {
  api: Api;
  chatId: number;
  userId: number;
  userDisplayName: string | null;
  userUsername: string | null;
}

/** Post unlock notification to chat. Throttled: max 1 post per user per 24h. */
export async function postUnlockNotifications(
  ctx: NotifyContext,
  newlyUnlocked: Array<{ id: string; icon: string; title: string; tier: string }>,
): Promise<void> {
  if (newlyUnlocked.length === 0) return;
  if (!isTrackedChat(ctx.chatId)) return;

  // Tier A: silent (only in webapp + /achievements).
  const notifiable = newlyUnlocked.filter((a) => a.tier === "B" || a.tier === "S");
  if (notifiable.length === 0) return;

  // User opt-out?
  if (!notifyInChatEnabled(ctx.chatId, ctx.userId)) return;

  // Throttle: max 1 post per user per day.
  const decision = decideNotify(ctx.chatId, ctx.userId);
  if (decision.alreadyPostedToday) {
    // Already posted today; record that we considered these unlocks so the
    // hook doesn't keep evaluating on every message.
    return;
  }

  const name = formatUserName(ctx.userUsername, ctx.userDisplayName);
  const titles = notifiable.map((a) => `${a.icon} ${a.title}`).join(", ");

  let body = `🏅 ${name} открыл достижение: ${titles}!`;
  if (notifiable.length > 1) {
    body = `🏅 ${name} сегодня: ${titles}!`;
  }

  try {
    await ctx.api.sendMessage(ctx.chatId, body);
    recordNotification(ctx.chatId, ctx.userId, notifiable.map((a) => a.id));
    // Per-achievement notified_at is updated lazily via markNotified() on next read.
  } catch (e) {
    console.error(`[ACH] failed to post notification:`, e);
  }
}

/** Re-export for callers. */
export { KRSK_SOC_CHAT_ID };
