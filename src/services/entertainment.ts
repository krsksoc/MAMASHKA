import { getRecentMessages } from "../data/repos/messages.js";
import { completeWithFallback, getChain } from "../llm/router.js";
import { buildPromptRequest } from "../prompts/builder.js";
import { getUserReputation } from "./reputation.js";

function formatMessages(messages: Array<{ text: string | null; createdAt: string }>): string {
  return messages
    .filter((m) => m.text)
    .map((m) => `[${m.createdAt}] ${m.text}`)
    .join("\n");
}

export async function generateFact(userId: number, _chatId: number, userName: string | null): Promise<string> {
  const recent = getRecentMessages(userId, 20);
  const context = {
    user_name: userName ?? "someone",
    user_messages_sample: formatMessages(recent),
  };
  const request = buildPromptRequest({
    taskSlug: "task:fact",
    context,
    userMessage: "Tell me an interesting fact.",
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

export async function generateDvach(userId: number, _chatId: number, userName: string | null): Promise<string> {
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

export async function generatePredict(userName: string | null, reputation: number): Promise<string> {
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

export async function generateHoroscope(userName: string | null, sign: string): Promise<string> {
  const context = {
    user_name: userName ?? "curious one",
  };
  const request = buildPromptRequest({
    taskSlug: "task:horoscope",
    context,
    userMessage: `My zodiac sign is ${sign}. Give me today's horoscope.`,
  });
  return completeWithFallback(request, getChain("fast"));
}

export async function rollDice(_userName: string | null): Promise<string> {
  const dice = Math.floor(Math.random() * 6) + 1;
  return `Someone rolled a ${dice}! 🎲`;
}

export async function spinBottle(_userName: string | null, participants: string[]): Promise<string> {
  if (participants.length < 2) {
    return "Not enough people for bottle spin.";
  }
  const winner = participants[Math.floor(Math.random() * participants.length)];
  return `The bottle landed on ${winner}! 🍾`;
}