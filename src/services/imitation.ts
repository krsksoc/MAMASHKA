import { getRecentMessages } from "../data/repos/messages.js";
import { getUser } from "../data/repos/users.js";
import { completeWithFallback, getChain } from "../llm/router.js";
import { buildPromptRequest } from "../prompts/builder.js";

function formatMessages(messages: Array<{ text: string | null }>): string {
  return messages.filter((m) => m.text).map((m) => m.text).join("\n");
}

export async function imitateUser(
  targetUserId: number,
  _chatId: number,
  _userName: string | null,
  prompt: string,
): Promise<string> {
  const target = getUser(targetUserId);
  const targetName = target?.displayName ?? target?.username ?? "unknown";
  const messages = getRecentMessages(targetUserId, 50);
  const context = {
    target_name: targetName,
    target_messages_sample: formatMessages(messages),
  };
  const request = buildPromptRequest({
    taskSlug: "task:imitate",
    context,
    userMessage: prompt,
  });
  return completeWithFallback(request, getChain("default"));
}