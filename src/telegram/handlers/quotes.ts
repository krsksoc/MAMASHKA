import type { Context } from "grammy";
import { getAllQuotes, getRandomQuote, insertQuote } from "../../data/repos/quotes.js";
import { getOrCreateUser } from "../../data/repos/users.js";
import { formatBold } from "../formatters/index.js";

export async function handleQuotes(ctx: Context): Promise<void> {
  const text = ctx.message && typeof ctx.message.text === "string" ? ctx.message.text : "";
  const m = text.match(/^\/(\S+)/);
  const command = m ? (m[1] ?? "").split("@")[0] : "";
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  switch (command) {
    case "quote": {
      // Reply-to quote: save the quoted message text
      const replyTo = ctx.message?.reply_to_message;
      if (replyTo?.text) {
        const author = replyTo.from;
        const savedBy = ctx.from;
        if (!savedBy) return;
        const authorUser = author
          ? getOrCreateUser(author.id, chatId, author.username ?? null, author.first_name ?? null)
          : null;
        const saverUser = getOrCreateUser(
          savedBy.id,
          chatId,
          savedBy.username ?? null,
          savedBy.first_name ?? null,
        );
        if (!saverUser) return;
        insertQuote(
          chatId,
          authorUser?.id ?? saverUser.id,
          replyTo.text,
          saverUser.id,
          replyTo.message_id,
        );
        await ctx.reply(`💬 Цитата сохранена!`);
        return;
      }

      // Manual quote text after command
      const quoteText = text.replace(/^\/\S+\s*/, "").trim();
      if (!quoteText) {
        await ctx.reply("Использование:\n• Ответь /quote на сообщение\n• Или /quote <текст>");
        return;
      }
      if (!ctx.from) return;
      const user = getOrCreateUser(
        ctx.from.id,
        chatId,
        ctx.from.username ?? null,
        ctx.from.first_name ?? null,
      );
      if (!user) return;
      insertQuote(chatId, user.id, quoteText, user.id);
      await ctx.reply("💬 Цитата сохранена!");
      break;
    }
    case "quotes": {
      // Show ALL quotes in chat (public)
      const quotes = getAllQuotes(chatId);
      if (quotes.length === 0) {
        await ctx.reply("В чате пока нет цитат.");
        return;
      }
      const lines = quotes.slice(0, 10).map((q) => `💬 "${q.text}"`);
      await ctx.reply(`${formatBold("Цитаты чата")}\n\n${lines.join("\n")}`);
      break;
    }
    case "randomquote": {
      const quote = getRandomQuote(chatId);
      if (!quote) {
        await ctx.reply("Нет цитат.");
        return;
      }
      await ctx.reply(`💬 "${quote.text}"`);
      break;
    }
    default:
      await ctx.reply("Неизвестная команда.");
  }
}
