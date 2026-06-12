import type { Context } from "grammy";
import { handleLeftChatMember, handleNewChatMembers } from "../../services/welcome.js";

type NextFunction = () => Promise<void>;

export function welcomeMiddleware() {
  return async (ctx: Context, next: NextFunction): Promise<void> => {
    const msg = ctx.message;
    if (msg && "new_chat_members" in msg) {
      await handleNewChatMembers(ctx);
      return; // Do not pass to tracker — welcome service manages user creation
    }
    if (msg && "left_chat_member" in msg) {
      await handleLeftChatMember(ctx);
      return; // Do not pass to tracker
    }
    await next();
  };
}
