import { Hono } from "hono";
import { getConfig } from "../core/config.js";
import { adminRoutes } from "./admin/routes.js";
import { webappRoutes } from "./webapp/routes.js";

const app = new Hono();

app.route("/admin", adminRoutes);
app.route("/webapp", webappRoutes);

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