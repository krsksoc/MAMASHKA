import { getDb } from "../db.js";
import type { Prompt, ModifierRule } from "../../core/types.js";

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

function valNum(row: Record<string, unknown>, key: string): number {
  const v = row[key];
  return typeof v === "number" ? v : 0;
}

function valStr(row: Record<string, unknown>, key: string): string {
  const v = row[key];
  return typeof v === "string" ? v : "";
}

function valOptStr(row: Record<string, unknown>, key: string): string | null {
  const v = row[key];
  return typeof v === "string" ? v : null;
}

function rowToPrompt(row: Record<string, unknown>): Prompt {
  return {
    id: valNum(row, "id"),
    slug: valStr(row, "slug"),
    content: valStr(row, "content"),
    version: valNum(row, "version"),
    isActive: valNum(row, "is_active") === 1,
    createdAt: valStr(row, "created_at"),
    updatedAt: valStr(row, "updated_at"),
  };
}

function rowToModifierRule(row: Record<string, unknown>): ModifierRule {
  const rawType = valStr(row, "condition_type");
  let conditionType: ModifierRule["conditionType"] = "custom";
  if (rawType === "time_range" || rawType === "reputation_range" || rawType === "flag" || rawType === "custom") {
    conditionType = rawType;
  }
  return {
    id: valNum(row, "id"),
    modifierSlug: valStr(row, "modifier_slug"),
    conditionType,
    conditionValue: valOptStr(row, "condition_value"),
    priority: valNum(row, "priority"),
    compatibleTasks: valOptStr(row, "compatible_tasks"),
    isActive: valNum(row, "is_active") === 1,
  };
}

export function getPrompt(slug: string): Prompt | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM prompts WHERE slug = ?").get(slug);
  if (!row || !isRecord(row)) return null;
  return rowToPrompt(row);
}

export function getActivePrompt(slug: string): Prompt | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM prompts WHERE slug = ? AND is_active = 1").get(slug);
  if (!row || !isRecord(row)) return null;
  return rowToPrompt(row);
}

export function getAllActivePrompts(): Prompt[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM prompts WHERE is_active = 1").all();
  if (!rows || !Array.isArray(rows)) return [];
  const prompts: Prompt[] = [];
  for (const row of rows) {
    if (isRecord(row)) {
      prompts.push(rowToPrompt(row));
    }
  }
  return prompts;
}

export function createPrompt(slug: string, content: string): Prompt {
  const db = getDb();
  const now = new Date().toISOString();
  const result = db.prepare(
    "INSERT INTO prompts (slug, content, version, is_active, created_at, updated_at) VALUES (?, ?, 1, 1, ?, ?)",
  ).run(slug, content, now, now);
  return {
    id: Number(result.lastInsertRowid),
    slug,
    content,
    version: 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
}

export function updatePrompt(slug: string, content: string): Prompt | null {
  const db = getDb();
  const existing = getPrompt(slug);
  if (!existing) return null;
  const now = new Date().toISOString();
  const newVersion = existing.version + 1;
  db.prepare("UPDATE prompts SET content = ?, version = ?, updated_at = ? WHERE slug = ?").run(
    content,
    newVersion,
    now,
    slug,
  );
  return { ...existing, content, version: newVersion, updatedAt: now };
}

export function deactivatePrompt(slug: string): boolean {
  const db = getDb();
  const result = db.prepare("UPDATE prompts SET is_active = 0 WHERE slug = ?").run(slug);
  return result.changes > 0;
}

export function getActiveModifierRules(): ModifierRule[] {
  const db = getDb();
  const rows = db.prepare(
    "SELECT * FROM modifier_rules WHERE is_active = 1 ORDER BY priority DESC",
  ).all();
  if (!rows || !Array.isArray(rows)) return [];
  const rules: ModifierRule[] = [];
  for (const row of rows) {
    if (isRecord(row)) {
      rules.push(rowToModifierRule(row));
    }
  }
  return rules;
}

export function createModifierRule(
  modifierSlug: string,
  conditionType: ModifierRule["conditionType"],
  conditionValue: string | null,
  priority: number,
  compatibleTasks?: string[],
): ModifierRule {
  const db = getDb();
  const tasksJson = compatibleTasks ? JSON.stringify(compatibleTasks) : null;
  const result = db.prepare(
    "INSERT INTO modifier_rules (modifier_slug, condition_type, condition_value, priority, compatible_tasks, is_active) VALUES (?, ?, ?, ?, ?, 1)",
  ).run(modifierSlug, conditionType, conditionValue, priority, tasksJson);
  return {
    id: Number(result.lastInsertRowid),
    modifierSlug,
    conditionType,
    conditionValue,
    priority,
    compatibleTasks: tasksJson,
    isActive: true,
  };
}

export function deactivateModifierRule(id: number): boolean {
  const db = getDb();
  const result = db.prepare("UPDATE modifier_rules SET is_active = 0 WHERE id = ?").run(id);
  return result.changes > 0;
}

export function getPromptVersions(slug: string): Prompt[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM prompts WHERE slug = ? ORDER BY version DESC").all(slug);
  if (!rows || !Array.isArray(rows)) return [];
  const prompts: Prompt[] = [];
  for (const row of rows) {
    if (isRecord(row)) {
      prompts.push(rowToPrompt(row));
    }
  }
  return prompts;
}