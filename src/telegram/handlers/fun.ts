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

function getCommandArg(match: string | RegExpMatchArray | undefined): string {
  if (match === undefined) return "";
  if (typeof match === "string") return match;
  return match[1] ?? match[0] ?? "";
}

export async function handleFun(ctx: Context): Promise<void> {
  const command = getCommandArg(ctx.match);
  const chatId = ctx.chat?.id;
  const userId = ctx.from?.id;
  const userName = ctx.from?.first_name ?? ctx.from?.username ?? null;
  const text = ctx.message && "text" in ctx.message ? ctx.message.text : "";

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
      const sign = text.replace(/\/horoscope\s*/, "").trim() || "aries";
      const horo = await generateHoroscope(userName, sign);
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