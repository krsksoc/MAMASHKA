import type { ModifierRule } from "../core/types.js";
import { getActiveModifierRules } from "../data/repos/prompts.js";
import type { PromptContext } from "./schema.js";

import { getPromptFromStore } from "./store.js";

export interface ModifierResult {
  slug: string;
  content: string;
  priority: number;
}

function parseTimeRange(value: string): { start: number; end: number } | null {
  const m = value.match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
  if (!m || !m[1] || !m[2] || !m[3] || !m[4]) return null;
  return {
    start: parseInt(m[1], 10) * 60 + parseInt(m[2], 10),
    end: parseInt(m[3], 10) * 60 + parseInt(m[4], 10),
  };
}

function checkTimeRange(range: { start: number; end: number }): boolean {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  if (range.start <= range.end) {
    return mins >= range.start && mins <= range.end;
  }
  return mins >= range.start || mins <= range.end;
}

function checkReputationRange(value: string, userRep: number): boolean {
  const m = value.match(/^(-?\d+)(?:-(-?\d+))?$/);
  if (!m || !m[1]) return false;
  const min = parseInt(m[1], 10);
  const max = m[2] !== undefined && m[2] !== undefined ? parseInt(m[2], 10) : min;
  return userRep >= min && userRep <= max;
}

function checkFlag(flag: string, _context: PromptContext): boolean {
  switch (flag) {
    case "drama_active":
      return false; // TODO: implement with drama tracker
    case "first_command":
      return false; // TODO: implement
    default:
      return false;
  }
}

function isCompatible(rule: ModifierRule, taskSlug: string): boolean {
  if (!rule.compatibleTasks) return true;
  try {
    const parsed = JSON.parse(rule.compatibleTasks);
    if (!Array.isArray(parsed)) return true;
    const tasks = parsed.filter((v): v is string => typeof v === "string");
    return tasks.length === 0 || tasks.includes(taskSlug);
  } catch {
    return true;
  }
}

export function resolveModifiers(taskSlug: string, context: PromptContext): ModifierResult[] {
  const rules = getActiveModifierRules();
  const results: ModifierResult[] = [];

  for (const rule of rules) {
    if (!isCompatible(rule, taskSlug)) continue;

    let matches = false;

    if (rule.conditionType === "time_range" && rule.conditionValue) {
      const range = parseTimeRange(rule.conditionValue);
      matches = range ? checkTimeRange(range) : false;
    } else if (rule.conditionType === "reputation_range" && rule.conditionValue !== null) {
      matches = checkReputationRange(rule.conditionValue, context.reputation ?? 0);
    } else if (rule.conditionType === "flag" && rule.conditionValue) {
      matches = checkFlag(rule.conditionValue, context);
    }

    if (matches) {
      const prompt = getPromptFromStore(rule.modifierSlug);
      if (prompt) {
        results.push({
          slug: rule.modifierSlug,
          content: prompt.content,
          priority: rule.priority,
        });
      }
    }
  }

  // Max 3 modifiers
  results.sort((a, b) => b.priority - a.priority);
  return results.slice(0, 3);
}
