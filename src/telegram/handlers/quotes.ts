import type { Context } from "grammy";
import { getRandomQuote, getQuotesByUser, insertQuote } from "../../data/repos/quotes.js";
import { getOrCreateUser } from "../../data/repos/users.js";
import { formatBold } from "../formatters/index.js";



export async function handleQuotes(ctx: Context): Promise<void> {
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
  const m = text.match(/^\/([a-zA-Z0-9_]+)/);
  let command = m ? m[1] ?? "" : "";
  if (command.includes("@")) command = command.split("@")[0]!;
  const chatId = ctx.chat?.id;
  if (!chatId) return;

  switch (command) {
    case "quote": {
      const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";
      const quoteText = text.replace(/\/quote\s*/, "").trim();
      if (!quoteText) {
        await ctx.reply("Использование: /quote <текст цитаты>");
        return;
      }
      if (!ctx.from) return;
      const user = getOrCreateUser(ctx.from.id, chatId, ctx.from.username ?? null, ctx.from.first_name ?? null);
      if (!user) return;
      insertQuote(chatId, user.id, quoteText, user.id);
      await ctx.reply("💬 Цитата сохранена!");
      break;
    }
    case "quotes": {
      if (!ctx.from) return;
      const user = getOrCreateUser(ctx.from.id, chatId, ctx.from.username ?? null, ctx.from.first_name ?? null);
      if (!user) return;
      const quotes = getQuotesByUser(chatId, user.id);
      if (quotes.length === 0) {
        await ctx.reply("У тебя нет сохранённых цитат.");
        return;
      }
      const lines = quotes.slice(0, 10).map((q) => `"${q.text}" (${q.createdAt})`);
      await ctx.reply(formatBold("Твои цитаты") + "\n\n" + lines.join("\n"));
      break;
    }
    case "randomquote": {
      const quote = getRandomQuote(chatId);
      if (!quote) {
        await ctx.reply("Нет цитат.");
        return;
      }
      await ctx.reply(`"${quote.text}"`);
      break;
    }
    default:
      await ctx.reply("Неизвестная команда.");
  }
}