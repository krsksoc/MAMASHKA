import { getConfig } from "../../core/config.js";
import type { Context, Next } from "hono";

export function checkAdminSecret(secret: string | undefined): boolean {
  if (!secret) return false;
  const config = getConfig();
  console.error("[AUTH] ADMIN_SECRET length:", config.ADMIN_SECRET.length, "| secret len:", secret.length, "| match:", secret === config.ADMIN_SECRET);
  return config.ADMIN_SECRET.length > 0 && secret === config.ADMIN_SECRET;
}

export function adminAuthMiddleware() {
  return async (c: Context, next: Next): Promise<void> => {
    const secret = c.req.header("x-admin-secret");
    if (!checkAdminSecret(secret)) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    await next();
  };
}