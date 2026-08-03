import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { getConfig } from "../core/config.js";
import { adminRoutes } from "./admin/routes.js";
import { getHealthData } from "./health.js";
import { getStatsData, renderStatsPage } from "./stats/dashboard.js";
import { webappRoutes } from "./webapp/routes.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "../../public");

const app = new Hono();

// Static files for webapp — BEFORE API routes, skips paths without extension (API calls)
app.use("/webapp/*", async (c, next) => {
  const rawPath = c.req.path.replace("/webapp", "") || "/";
  const path = rawPath.split("?")[0] || "/";

  // If no file extension, skip to API routes
  if (path !== "/" && !path.includes(".")) {
    return next();
  }

  const filePath = join(PUBLIC_DIR, "webapp", path === "/" ? "index.html" : path);
  try {
    const content = readFileSync(filePath);
    const mimeTypes: Record<string, string> = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css",
      ".js": "application/javascript",
      ".json": "application/json",
      ".png": "image/png",
      ".svg": "image/svg+xml",
    };
    const ext = filePath.substring(filePath.lastIndexOf("."));
    const mime = mimeTypes[ext] ?? "text/plain";
    c.header("Content-Type", mime);
    c.header("Cache-Control", "no-cache, no-store, must-revalidate");
    c.header("Pragma", "no-cache");
    return c.body(content);
  } catch {
    return next(); // File not found — let API routes try
  }
});

// Public avatar proxy — serves Telegram profile photos cached on disk.
// Lives at /avatar/:userId (no /webapp prefix) so the frontend can use it
// directly without validateInitData. The data is not sensitive — these are
// already public Telegram photos.
app.get("/avatar/:userId", async (c) => {
  const userId = parseInt(c.req.param("userId") ?? "0", 10);
  if (!userId) return c.text("bad userId", 400);
  const { getAvatarFile } = await import("../services/avatarProxy.js");
  const file = await getAvatarFile(userId);
  if (!file) return c.text("not found", 404);
  // Cache for 7 days; align with PROXY_TTL_MS in avatarProxy.ts
  c.header("Cache-Control", "public, max-age=604800, immutable");
  c.header("Content-Type", file.contentType);
  return c.body(file.body);
});

app.route("/admin", adminRoutes);
app.route("/webapp", webappRoutes);

// Stats dashboard
app.get("/stats", (c) => {
  const data = getStatsData();
  return c.html(renderStatsPage(data));
});
app.get("/stats/api", (c) => {
  return c.json(getStatsData());
});

// Serve webapp at root for Telegram WebApp button
app.get("/", async (c) => {
  try {
    const content = readFileSync(join(PUBLIC_DIR, "webapp/index.html"));
    c.header("Content-Type", "text/html; charset=utf-8");
    c.header("Cache-Control", "no-cache, no-store, must-revalidate");
    c.header("Pragma", "no-cache");
    return c.body(content);
  } catch {
    return c.text("Not Found", 404);
  }
});

app.onError((err, c) => {
  console.error("[WEB ERROR]", String(err));
  return c.json({ error: "Internal Server Error" }, 500);
});

app.get("/health", (c) => {
  const data = getHealthData();
  return c.json(data);
});

const config = getConfig();
const port = parseInt(config.PORT, 10);

export default {
  port,
  fetch: app.fetch,
};
