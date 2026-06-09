import type { Context } from "grammy";
import {
  generateFact,
  generatePsychologist,
  generateDvach,
  generatePredict,
  generateHoroscope,
  rollDice,
  spinBottle,
} from "../../services/entertainment.js";
import { getUserReputation } from "../../services/reputation.js";

export async function handleFun(ctx: Context): Promise<void> {
  // Parse command name from message text (ctx.match is argument only)
  const text = ctx.message && typeof ctx.message.text === "string" ? ctx.message.text : "";
  const match = text.match(/^\/([a-zA-Z0-9_]+)/);
  let command = match ? match[1] ?? "" : "";
  if (command.includes("@")) command = command.split("@")[0]!;
  // biome-ignore lint: debug
  console.error(`[FUN] text="${text}" cmd="${command}"`);
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  const userName = ctx.from?.first_name ?? ctx.from?.username ?? null;

  if (!chatId) return;

  switch (command) {
    case "fact": {
      if (!userId) return;
      const fact = await generateFact(userId, chatId, userName);
      await ctx.reply(fact);
      break;
    }
    case "psychologist": {
      if (!userId) return;
      const msg = text.replace(/\/psychologist\s*/, "").trim();
      const resp = await generatePsychologist(userId, chatId, userName, msg);
      await ctx.reply(resp);
      break;
    }
    case "dvach": {
      if (!userId) return;
      const post = await generateDvach(chatId, userId, userName);
      await ctx.reply(post);
      break;
    }
    case "predict": {
      const rep = userId ? getUserReputation(chatId, userId) : 0;
      const prediction = await generatePredict(userName, rep);
      await ctx.reply(prediction);
      break;
    }
    case "horoscope": {
      const sign = text.replace(/\/horoscope\s*/, "").trim();
      const horo = await generateHoroscope(userName, sign, userId ?? null, chatId);
      await ctx.reply(horo);
      break;
    }
    case "roll": {
      const result = await rollDice(userName);
      await ctx.reply(result);
      break;
    }
    case "bottle": {
      const result = await spinBottle(userName, ["Анна", "Борис", "Вика"]);
      await ctx.reply(result);
      break;
    }
    default:
      await ctx.reply("Неизвестная команда. /help");
  }
}