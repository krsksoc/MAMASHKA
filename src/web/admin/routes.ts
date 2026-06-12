import { Hono } from "hono";
import {
  createModifierRule,
  createPrompt,
  deactivateModifierRule,
  getActiveModifierRules,
  getAllActivePrompts,
  getPromptVersions,
} from "../../data/repos/prompts.js";
import { adminAuthMiddleware } from "./auth.js";
import { createModifierRuleSchema, createPromptSchema, toggleModifierSchema } from "./schemas.js";

const app = new Hono();
app.use(adminAuthMiddleware());

app.get("/prompts", (c) => {
  try {
    const prompts = getAllActivePrompts();
    return c.json({ prompts });
  } catch (e) {
    console.error("[ADMIN] /prompts error:", String(e));
    return c.json({ error: String(e) }, 500);
  }
});

app.post("/prompts", async (c) => {
  const bodyParsed = createPromptSchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json({ error: "slug and content required" }, 400);
  }
  const { slug, content } = bodyParsed.data;
  createPrompt(slug, content);
  return c.json({ ok: true });
});

app.get("/prompts/:slug/versions", (c) => {
  const slug = c.req.param("slug");
  const versions = getPromptVersions(slug);
  return c.json({ versions });
});

app.get("/modifiers", (c) => {
  const rules = getActiveModifierRules();
  return c.json({ rules });
});

app.post("/modifiers", async (c) => {
  const bodyParsed = createModifierRuleSchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json({ error: "invalid request body" }, 400);
  }
  const { modifierSlug, conditionType, conditionValue, priority, compatibleTasks } =
    bodyParsed.data;
  const rule = createModifierRule(
    modifierSlug,
    conditionType,
    conditionValue,
    priority,
    compatibleTasks,
  );
  return c.json({ ok: true, id: rule.id });
});

app.patch("/modifiers/:id/toggle", async (c) => {
  const id = parseInt(c.req.param("id"), 10);
  const bodyParsed = toggleModifierSchema.safeParse(await c.req.json());
  if (!bodyParsed.success) {
    return c.json({ error: "invalid request body" }, 400);
  }
  deactivateModifierRule(id);
  return c.json({ ok: true });
});

export { app as adminRoutes };
