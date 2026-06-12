import type { PromptContext } from "./schema.js";

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

export function renderTemplate(template: string, context: PromptContext): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, key) => {
    const val = context[key as keyof PromptContext];
    if (val === undefined || val === null) {
      return _match;
    }
    return String(val);
  });
}

export function extractPlaceholders(template: string): string[] {
  const placeholders: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(PLACEHOLDER_PATTERN);
  while ((match = re.exec(template)) !== null) {
    if (match[1] && !placeholders.includes(match[1])) {
      placeholders.push(match[1]);
    }
  }
  return placeholders;
}
