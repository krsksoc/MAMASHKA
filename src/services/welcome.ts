import type { Context } from "grammy";
import type { User as DbUser } from "../core/types.js";
import { getDb } from "../data/db.js";
import {
  getOrCreateUser,
  getUserByTelegramId,
  markIntroCompleted,
  registerExistingUser,
  updateProfileField,
} from "../data/repos/users.js";
import { formatBold, formatItalic } from "../telegram/formatters/index.js";

const LOG = (msg: string) => console.error(`[WELCOME] ${msg}`);

// ── Member count polling fallback ──
const memberCountMap = new Map<number, { count: number; names: Map<number, string> }>();
let pollingInterval: ReturnType<typeof setInterval> | null = null;

export function startMemberPolling(bot: any) {
  LOG("startMemberPolling called");
  if (pollingInterval) {
    LOG("Polling already running, skipping");
    return;
  }
  // Initialize counts for known chats from DB
  const db = getDb();
  const rows = db.prepare("SELECT DISTINCT chat_id FROM users").all() as Array<{ chat_id: number }>;
  LOG(`Found ${rows.length} chats in DB for polling init`);
  for (const { chat_id } of rows) {
    bot.api.getChatMemberCount(chat_id).then((count: number) => {
      memberCountMap.set(chat_id, { count, names: new Map() });
      LOG(`Init member count for chat ${chat_id}: ${count}`);
    }).catch((e: unknown) => {
      LOG(`Failed init count for chat ${chat_id}: ${String(e)}`);
    });
  }
  LOG("Starting 10s polling interval");
  pollingInterval = setInterval(async () => {
    const db2 = getDb();
    const rows2 = db2.prepare("SELECT DISTINCT chat_id FROM users").all() as Array<{ chat_id: number }>;
    for (const { chat_id } of rows2) {
      try {
        const count = await bot.api.getChatMemberCount(chat_id);
        const prev = memberCountMap.get(chat_id);
        if (prev && count < prev.count) {
          // Wait for Telegram to update member status
          await new Promise(r => setTimeout(r, 2000));
          const left = await findLeftMember(bot, chat_id);
          const farewell = randomFarewell();
          const mention = left?.name.startsWith("@")
            ? left.name
            : (left ? left.name : null);
          const text = mention
            ? `${farewell}\n\nУшёл: ${mention}`
            : farewell;
          await bot.api.sendMessage(chat_id, text, { parse_mode: "HTML" });
          LOG(`Farewell in chat ${chat_id} (count ${prev.count} → ${count})` + (left ? ` user=${left.name}` : " unknown"));
        }
        memberCountMap.set(chat_id, { count, names: new Map() });
      } catch (e) {
        LOG(`Error getting count for ${chat_id}: ${String(e)}`);
      }
    }
  }, 10000);
  LOG("Polling interval started");
}

async function findLeftMember(bot: any, chatId: number): Promise<{ id: number; name: string } | null> {
  const db = getDb();
  const users = db.prepare(
    "SELECT id, telegram_id, display_name, username FROM users WHERE chat_id = ?"
  ).all(chatId) as Array<{
    id: number;
    telegram_id: number;
    display_name: string | null;
    username: string | null;
  }>;

  for (const user of users) {
    try {
      const member = await bot.api.getChatMember(chatId, user.telegram_id);
      if (member.status === "left" || member.status === "kicked") {
        const name = user.username
          ? `@${user.username}`
          : (user.display_name || `id${user.telegram_id}`);
        return { id: user.id, name };
      }
    } catch (e) {
      const msg = String(e);
      if (msg.includes("USER_NOT_FOUND") || msg.includes("user not found") || msg.includes("Chat not found") || msg.includes("USER_ID_INVALID") || msg.includes("Bad Request")) {
        const name = user.username
          ? `@${user.username}`
          : (user.display_name || `id${user.telegram_id}`);
        return { id: user.id, name };
      }
    }
  }
  return null;
}

export function stopMemberPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

// ── Questions flow ──
const QUESTIONS = [
  { field: "famous_for", text: "Чем знаменит?" },
  { field: "gender_role", text: "Тян? Кун?" },
  { field: "age", text: "Годиков сколько?" },
  { field: "lifestyle", text: "ЗОЖ или бухаешь?" },
  { field: "morals", text: "Бабульку через дорогу переведёшь?" },
  { field: "sex_role", text: "В жопу ебёшься или хуй сосёшь?" },
] as const;

// ── Helpers ──
function getDisplayName(member: {
  first_name?: string;
  last_name?: string;
  username?: string;
}): string {
  if (member.first_name) {
    const last = member.last_name ? ` ${member.last_name}` : "";
    return `${member.first_name}${last}`;
  }
  if (member.username) return `@${member.username}`;
  return "Незнакомец";
}

function getChatTitle(ctx: Context): string {
  const chat = ctx.chat;
  if (!chat) return "этот чат";
  if (chat.type === "private") return "личку";
  return chat.title ?? "этот чат";
}

// ── Personalized greeting for existing users ──
function buildPersonalGreeting(user: DbUser, name: string, topic: string): string {
  const parts: string[] = [];
  parts.push(formatBold(`С возвращением, ${name}!`));
  parts.push(`Рад тебя видеть в ${topic}.`);

  const known: string[] = [];
  if (user.famousFor) known.push(`знаменит тем, что ${user.famousFor}`);
  if (user.genderRole) known.push(`позиционируешь себя как ${user.genderRole}`);
  if (user.age) known.push(`${user.age} годков`);
  if (user.lifestyle) known.push(`стиль жизни: ${user.lifestyle}`);
  if (user.morals) known.push(`мораль: ${user.morals}`);
  if (user.sexRole) known.push(`сексуальная ориентация: ${user.sexRole}`);

  if (known.length > 0) {
    parts.push(`Напомню: ты ${known.join(", ")}.`);
  }
  return parts.join("\n");
}

// ── Standard new-user welcome ──
function buildNewWelcome(name: string, topic: string): string {
  return `${formatBold(`SUP, ${name}`)}\n\nДобро пожаловать в ${topic}\nДрузей не приводить.`;
}

// ── Farewell messages (ironic/snarky) ──
const FAREWELLS = [
  "Ушёл? Ну и ладно, скучать не будем.",
  "Пока-пока. Обратная дорога открыта… но мы не ждём.",
  "А, ну да. Как всегда — пришёл, насрал в чате, ушёл.",
  "Один дегенерат меньше. Статистика радует.",
  "Ушёл искать себя? Не ищи долго, тебя никто не терял.",
  "Прощай. Будем помнить тебя… ну, минут пять.",
  "Ну что, следующий? Уходи, освобождай место.",
  "Ага, сбежал. Как и предсказывали.",
  "Ещё один герой покинул нас. Траур объявляю… на 3 секунды.",
  "Ушёл, но след остался. В мусорке.",
  "Прощай, незнакомец. Да, незнакомец — мы так и не запомнили имя.",
  "Сделал свой вклад: ноль. И ушёл.",
  "Удалился? Или просто осознал уровень чата?",
  "Пополняй ряды 'бывших'. Мы тебя не забудем. Ложь.",
  "Вышел — значит проиграл. До свидания.",
  "Мамуля примет тебя обратно. Нет, не примет.",
  "Арrivederci, товарищ. В смысле, никто не скучает.",
  "Чат стал чище на одного человека. Спасибо.",
  "Ушёл в закат. Только закат уже кончился.",
  "Покинул чат с гордо поднятой… ну, просто покинул.",
];

function randomFarewell(): string {
  const idx = Math.floor(Math.random() * FAREWELLS.length);
  return FAREWELLS[idx] ?? "Ну и проваливай.";
}

// ── Public: handle chat_member update (exact status change) ──
export async function handleChatMember(ctx: Context): Promise<void> {
  const update = ctx.update as any;
  const chatMember = update.chat_member;
  if (!chatMember) return;

  console.error("[CHAT_MEMBER DEBUG]", JSON.stringify(chatMember, null, 2));

  // In Telegram API, user is in new_chat_member.user or old_chat_member.user
  const newMember = chatMember.new_chat_member || {};
  const user = newMember.user || chatMember.user || {};
  if (user.is_bot) return;

  const oldStatus = chatMember.old_chat_member?.status;
  const newStatus = newMember.status;

  if (newStatus === "left" || newStatus === "kicked") {
    if (oldStatus === "member" || oldStatus === "administrator" || oldStatus === "creator" || oldStatus === "restricted") {
      // Fallback to DB if username not in update (privacy settings)
      let username = user.username;
      if (!username) {
        const dbUser = getUserByTelegramId(user.id, chatMember.chat.id);
        if (dbUser?.username) {
          username = dbUser.username;
        }
      }
      const name = username
        ? `@${username}`
        : (user.first_name || `id${user.id}`);
      const farewell = randomFarewell();
      const mention = name.startsWith("@")
        ? name  // raw @username — clickable link, no markdown needed
        : formatItalic(name);
      await ctx.api.sendMessage(
        chatMember.chat.id,
        `${farewell}\n\nУшёл: ${mention}`,
        { parse_mode: "HTML" },
      );
      LOG(`Farewell via chat_member for ${user.id} (${name})`);
    }
  }
}

// ── Public: scan chat on bot join ──
export async function scanChatMembers(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;
  LOG(`Scanning chat ${chatId} for existing members`);

  try {
    const admins = await ctx.getChatAdministrators();
    for (const member of admins) {
      const m = member.user;
      if (m.is_bot) continue;
      registerExistingUser(m.id, chatId, m.username ?? null, getDisplayName(m));
    }

    // For small groups, try fetching all members via getChatMemberCount + getChatMember
    const count = await ctx.getChatMemberCount();
    LOG(`Chat has ${count} members (including bots)`);

    // Telegram API limitation: getChatMemberList is not available in regular groups
    // We register who we can from admins, rest will be caught by tracker on first message
  } catch (err) {
    LOG(`Failed to scan chat: ${String(err)}`);
  }
}

// ── Public: handle new_chat_members ──
export async function handleNewChatMembers(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  const msg = ctx.message;
  if (!msg || !("new_chat_members" in msg)) return;
  const newMembers = msg.new_chat_members as Array<{
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    is_bot: boolean;
  }>;

  const topic = getChatTitle(ctx);

  for (const member of newMembers) {
    if (member.is_bot) continue;

    const name = getDisplayName(member);
    const existing = getUserByTelegramId(member.id, chatId);

    if (existing && existing.messageCount > 0) {
      // User was actually active in chat → returning
      const greeting = buildPersonalGreeting(existing, name, topic);
      await ctx.reply(greeting, { parse_mode: "HTML" });
      LOG(`Greeted returning user ${member.id} (${name})`);
      continue;
    }

    // New user (or scanned-only placeholder) → create/reset as new
    const user = getOrCreateUser(member.id, chatId, member.username ?? null, name);
    if (!user) continue;

    const welcome = buildNewWelcome(name, topic);
    await ctx.reply(welcome, { parse_mode: "HTML" });
    LOG(`Welcomed new user ${member.id} (${name})`);

    // Mark user as seen, no intro questions
    const db = (await import("../data/db.js")).getDb();
    db.prepare("UPDATE users SET is_new = 1, intro_completed = 1, intro_step = 99, first_seen_at = datetime('now') WHERE id = ?").run(user.id);
  }
}

// ── Public: handle left_chat_member ──
export async function handleLeftChatMember(ctx: Context): Promise<void> {
  console.error(`[FAREWALL DEBUG] handler called, msg keys=${Object.keys(ctx.message ?? {}).join(",")}`);
  const msg = ctx.message;
  if (!msg || !("left_chat_member" in msg)) {
    console.error("[FAREWALL DEBUG] no left_chat_member in msg, returning");
    return;
  }
  const member = msg.left_chat_member as {
    id: number;
    first_name?: string;
    last_name?: string;
    username?: string;
    is_bot: boolean;
  };

  if (member.is_bot) return;
  const name = getDisplayName(member);
  const farewell = randomFarewell();
  await ctx.reply(`${farewell}`, {
    parse_mode: "HTML",
    reply_to_message_id: ctx.message?.message_id,
  });
  LOG(`Farewell for ${member.id} (${name})`);
}

// ── Intro question asker ──
async function askIntroQuestion(ctx: Context, userId: number, step: number): Promise<void> {
  if (step >= QUESTIONS.length) {
    markIntroCompleted(userId);
    await ctx.reply(formatItalic("Знакомство завершено. Добро пожаловать в ад."), {
      parse_mode: "HTML",
    });
    LOG(`Intro completed for user ${userId}`);
    return;
  }

  const q = QUESTIONS[step];
  const db = (await import("../data/db.js")).getDb();
  db.prepare("UPDATE users SET intro_step = ? WHERE id = ?").run(step, userId);

  await ctx.reply(formatItalic(q.text), { parse_mode: "HTML" });
  LOG(`Asked question ${step} (${q.field}) to user ${userId}`);
}

// ── Public: handle possible intro answer from text message ──
export async function handleIntroAnswer(ctx: Context): Promise<boolean> {
  const chatId = ctx.chat?.id;
  const telegramId = ctx.from?.id;
  if (!chatId || !telegramId) return false;

  const text = ctx.message && typeof ctx.message.text === "string" ? ctx.message.text.trim() : null;
  if (!text) return false;

  const user = getUserByTelegramId(telegramId, chatId);
  if (!user?.isNew || user.introCompleted) return false;

  // Check if text is a command — skip
  if (text.startsWith("/")) return false;

  const step = (user.introStep) ?? 0;
  if (step >= QUESTIONS.length) return false;

  const q = QUESTIONS[step];

  // Skip if field already filled (shouldn't happen with proper flow, but safety)
  const alreadyFilled =
    user[q.field as keyof User] !== null && user[q.field as keyof User] !== undefined;
  if (alreadyFilled) {
    // Move to next unfilled
    const nextStep = findNextUnfilledStep(user, step + 1);
    if (nextStep < QUESTIONS.length) {
      await askIntroQuestion(ctx, user.id, nextStep);
      return true;
    }
    markIntroCompleted(user.id);
    return true;
  }

  // Save answer
  const value = q.field === "age" ? parseInt(text, 10) : text;
  updateProfileField(user.id, q.field, Number.isNaN(value as number) ? text : value);

  LOG(`Saved ${q.field}="${text}" for user ${user.id}`);

  // Next question
  await askIntroQuestion(ctx, user.id, step + 1);
  return true;
}

function findNextUnfilledStep(user: DbUser, startStep: number): number {
  for (let i = startStep; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    if (!q) continue;
    const field = q.field;
    const val = user[field as keyof DbUser];
    if (val === null || val === undefined || val === "") return i;
  }
  return QUESTIONS.length;
}
