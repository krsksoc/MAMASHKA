import { getChatMessagesWithUsers, getMessagesByDateRange } from "../data/repos/messages.js";
import { completeWithFallback, getChain } from "../llm/router.js";
import { buildPromptRequest } from "../prompts/builder.js";

export async function generateSummary(
  chatId: number,
  startDate: string,
  endDate: string,
): Promise<string> {
  const messages = getMessagesByDateRange(chatId, startDate, endDate, 500);
  const context = {
    date_range: `${startDate} — ${endDate}`,
    all_messages: messages
      .filter((m) => m.text)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((m) => `[${m.createdAt}] ${m.text}`)
      .join("\n"),
  };
  const request = buildPromptRequest({
    taskSlug: "task:summary",
    context,
    userMessage: "Summarize the chat for this period.",
  });
  return completeWithFallback(request, getChain("summary"));
}

export async function generateMamoolyaNews(chatId: number, limit = 1000): Promise<string> {
  const messages = getChatMessagesWithUsers(chatId, limit);

  const formatted = messages
    .filter((m) => m.text)
    .map((m) => {
      const name = m.displayName ?? m.username ?? `User${m.userId}`;
      return `[${name}]: ${m.text}`;
    })
    .join("\n");

  const context = {
    message_count: messages.length,
    all_messages: formatted,
  };

  // Build system prompt manually — include messages directly so LLM sees them
  const request = buildPromptRequest({
    taskSlug: "task:mamoolya_news",
    context,
    userMessage: "Используй СООБЩЕНИЯ из system prompt выше. Не придумывай ничего.",
  });

  // Override system to include raw messages in system (LLM always reads system)
  request.system = request.system + "\n\n=== СООБЩЕНИЯ ЧАТА (последние " + messages.length + "): ===\n" + formatted + "\n=== КОНЕЦ СООБЩЕНИЙ ===\n\nТы должна сделать сводку ТОЛЬКО из этих сообщений. Не придумывай участников.";

  return completeWithFallback(request, getChain("summary"));
}