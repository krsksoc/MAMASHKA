import type { Context } from "grammy";
import { generateReply } from "../../services/llm_reply.js";

export async function handleAsk(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? "";
  const question = text.replace(/^\/ask(@\w+)?\s*/, "").trim();

  if (!question) {
    await ctx.reply("❓ Напиши вопрос после /ask");
    return;
  }

  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  const userName = ctx.from?.first_name ?? ctx.from?.username ?? null;
  if (!chatId || !userId) return;

  await ctx.reply("⏳ Думаю...");
  try {
    const response = await generateReply(
      chatId,
      userId,
      userName,
      question,
      null,
      null,
    );
    await ctx.reply(response);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[ASK] error:`, msg);
    await ctx.reply("❌ Ошибка: " + msg.slice(0, 200));
  }
}
