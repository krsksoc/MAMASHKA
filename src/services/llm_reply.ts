import { getChatMessagesWithUsers } from "../data/repos/messages.js";
import { getRecentMessages } from "../data/repos/messages.js";
import { getUserByTelegramId } from "../data/repos/users.js";
import { completeWithFallback, getChain } from "../llm/router.js";
import { buildPromptRequest } from "../prompts/builder.js";

export async function generateReply(
  chatId: number,
  userId: number,
  userName: string | null,
  messageText: string,
  replyToText: string | null,
  replyToUserName: string | null,
): Promise<string> {
  // Grab last 30 messages for context
  const recentMessages = getChatMessagesWithUsers(chatId, 30);
  const contextMessages = recentMessages
    .filter((m) => m.text)
    .map((m) => {
      const name = m.displayName ?? m.username ?? `User${m.userId}`;
      return `[${name}]: ${m.text}`;
    })
    .join("\n");

  const user = getUserByTelegramId(userId, chatId);

  const context = {
    user_name: userName ?? user?.displayName ?? "кто-то",
    user_message: messageText,
    reply_to_text: replyToText ?? "",
    reply_to_user: replyToUserName ?? "",
    chat_context: contextMessages,
  };

  const request = buildPromptRequest({
    taskSlug: "task:reply",
    context,
    userMessage: messageText,
  });

  return completeWithFallback(request, getChain("default"));
}
