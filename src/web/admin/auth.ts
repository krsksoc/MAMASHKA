import { getConfig } from "../../core/config.js";
import type { Context, Next } from "hono";

export function checkAdminSecret(secret: string | undefined): boolean {
  if (!secret) return false;
  const config = getConfig();
  return config.ADMIN_SECRET.length > 0 && secret === config.ADMIN_SECRET;
}

export function adminAuthMiddleware() {
  return async (c: Context, next: Next): Promise<void> => {
    const secret = c.req.header("x-admin-secret");
    if (!checkAdminSecret(secret)) {
      c.status(401);
      await c.json({ error: "Unauthorized" });
      return;
    }
    await next();
  };
}