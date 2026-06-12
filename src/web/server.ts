import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Hono } from "hono";
import { fileURLToPath } from "url";
import { getConfig } from "../core/config.js";
import { adminRoutes } from "./admin/routes.js";
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

app.route("/admin", adminRoutes);
app.route("/webapp", webappRoutes);

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

app.get("/health", (c) => c.json({ status: "ok" }));

const config = getConfig();
const port = parseInt(config.PORT, 10);

export default {
  port,
  fetch: app.fetch,
};
