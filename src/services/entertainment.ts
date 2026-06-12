import { getRecentMessages } from "../data/repos/messages.js";
import { getUser, getUserByTelegramId } from "../data/repos/users.js";
import { completeWithFallback, getChain } from "../llm/router.js";
import { buildPromptRequest } from "../prompts/builder.js";
import { getUserReputation } from "./reputation.js";

function formatMessages(messages: Array<{ text: string | null; createdAt: string }>): string {
  return messages
    .filter((m) => m.text)
    .map((m) => `[${m.createdAt}] ${m.text}`)
    .join("\n");
}

function getZodiacSign(month: number, day: number): string {
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return "Овен";
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return "Телец";
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return "Близнецы";
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return "Рак";
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return "Лев";
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return "Дева";
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return "Весы";
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return "Скорпион";
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return "Стрелец";
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return "Козерог";
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return "Водолей";
  return "Рыбы";
}

export async function generateFact(
  userId: number,
  _chatId: number,
  userName: string | null,
): Promise<string> {
  const recent = getRecentMessages(userId, 30);
  const user = getUser(userId);
  const context = {
    user_name: userName ?? user?.displayName ?? "someone",
    user_messages_sample: formatMessages(recent),
    message_count: user?.messageCount ?? recent.length,
  };
  const request = buildPromptRequest({
    taskSlug: "task:fact",
    context,
    userMessage: `Мемный факт о ${userName ?? "пользователе"} на основе его сообщений.`,
  });
  return completeWithFallback(request, getChain("default"));
}

export async function generatePsychologist(
  userId: number,
  chatId: number,
  userName: string | null,
  userMessage: string,
): Promise<string> {
  const reputation = getUserReputation(chatId, userId);
  const context = {
    user_name: userName ?? "someone",
    reputation,
    user_message: userMessage,
  };
  const request = buildPromptRequest({
    taskSlug: "task:psychologist",
    context,
    userMessage: userMessage,
  });
  return completeWithFallback(request, getChain("default"));
}

export async function generateDvach(
  userId: number,
  _chatId: number,
  userName: string | null,
): Promise<string> {
  const recent = getRecentMessages(userId, 10);
  const context = {
    user_name: userName ?? "anon",
    recent_messages: formatMessages(recent),
  };
  const request = buildPromptRequest({
    taskSlug: "task:dvach",
    context,
    userMessage: "Generate a 2ch-style random post.",
  });
  return completeWithFallback(request, getChain("fast"));
}

export async function generatePredict(
  userName: string | null,
  reputation: number,
): Promise<string> {
  const context = {
    user_name: userName ?? "mysterious one",
    reputation,
  };
  const request = buildPromptRequest({
    taskSlug: "task:predict",
    context,
    userMessage: "What does the future hold?",
  });
  return completeWithFallback(request, getChain("fast"));
}

export async function generateHoroscope(
  userName: string | null,
  sign: string,
  userId: number | null,
  chatId: number | null,
): Promise<string> {
  // Try to determine zodiac sign from user's birth date in DB
  let zodiacSign = sign;
  if (userId && chatId && (zodiacSign === "aries" || zodiacSign === "")) {
    const user = getUserByTelegramId(Number(userId), Number(chatId));
    if (user?.birthMonth) {
      // Use 15th of month as default day
      zodiacSign = getZodiacSign(user.birthMonth, 15);
    }
  }

  const context = {
    user_name: userName ?? "curious one",
  };
  const request = buildPromptRequest({
    taskSlug: "task:horoscope",
    context,
    userMessage: `My zodiac sign is ${zodiacSign}. Give me today's horoscope.`,
  });
  return completeWithFallback(request, getChain("fast"));
}

export async function rollDice(_userName: string | null): Promise<string> {
  const dice = Math.floor(Math.random() * 6) + 1;
  return `Someone rolled a ${dice}! 🎲`;
}

export async function spinBottle(
  _userName: string | null,
  participants: string[],
): Promise<string> {
  if (participants.length < 2) {
    return "Not enough people for bottle spin.";
  }
  const winner = participants[Math.floor(Math.random() * participants.length)];
  return `The bottle landed on ${winner}! 🍾`;
}
