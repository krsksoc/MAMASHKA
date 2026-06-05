import { getMessagesByDateRange } from "../data/repos/messages.js";
import { completeWithFallback, getChain } from "../llm/router.js";
import { buildPromptRequest } from "../prompts/builder.js";

function formatMessages(messages: Array<{ text: string | null; createdAt: string }>): string {
  return messages
    .filter((m) => m.text)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((m) => `[${m.createdAt}] ${m.text}`)
    .join("\n");
}

export async function generateSummary(chatId: number, startDate: string, endDate: string): Promise<string> {
  const messages = getMessagesByDateRange(chatId, startDate, endDate, 500);
  const context = {
    date_range: `${startDate} — ${endDate}`,
    all_messages: formatMessages(messages),
  };
  const request = buildPromptRequest({
    taskSlug: "task:summary",
    context,
    userMessage: "Summarize the chat for this period.",
  });
  return completeWithFallback(request, getChain("summary"));
}