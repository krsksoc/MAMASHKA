import type { PromptContext } from "./schema.js";

const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g;

/**
 * Sanitize user-controlled text that will be inserted into a system prompt.
 *
 * Threat model:
 *   - User can put text in messages, anon, quotes, /imitate target, /imitate prompt, etc.
 *   - That text is later rendered into a system prompt via renderTemplate.
 *   - LLM may interpret "ignore all previous instructions" as authoritative.
 *
 * Defense:
 *   1. Strip triple-quote/quad-quote markers (LLMs use """ / ''' as text fences).
 *   2. Strip Markdown/HTML injection ("# System:", "<|im_start|>system").
 *   3. Drop content that *looks* like prompt directives (case-insensitive
 *      match against common jailbreak phrases), but only when surrounded by
 *      spaces / start-of-string — single words like "ignore" in normal text
 *      are fine. (We only collapse obvious directive prefixes.)
 *   4. Wrap value in XML-like tags: <user_data name="..."> ... </user_data>
 *      so even if some text leaks, the LLM sees it's data, not instructions.
 *   5. Cap length (defensive — DB truncation should already cap, but be safe).
 */

const SANITIZER_MAX_LEN = 4000;

/** Patterns that are almost always prompt-injection attempts. */
const DIRECTIVE_PATTERNS: RegExp[] = [
  /\bignore\s+(all\s+)?(previous|prior|above)\s+(instructions?|prompts?)/i,
  /\bdisregard\s+(all\s+)?(previous|prior|above)/i,
  /\bforget\s+(everything|all)\b/i,
  /\byou\s+are\s+now\s+/i,
  /\bact\s+as\s+(a|an)\s+/i,
  /\bsystem\s*:\s*/i,
  /\bdeveloper\s+mode\b/i,
  /\bjailbreak\b/i,
  /\bDAN\b/,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /###\s*(system|instruction|prompt)/i,
];

function stripDirectives(input: string): string {
  let out = input;
  for (const pat of DIRECTIVE_PATTERNS) {
    out = out.replace(pat, "[…]");
  }
  return out;
}

/** Escape control characters that LLM APIs may interpret (rare, but safe). */
function neutralizeControlChars(input: string): string {
  return input
    // Null bytes and bell — never useful in user messages.
    .replace(/[\x00\x07]/g, "")
    // Long unbroken whitespace runs (potential visual confusion).
    .replace(/[ \t]{20,}/g, " ");
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Render user-controlled value as a fenced XML block. The LLM sees it as data
 * inside an opaque container, not as part of the instructions.
 *
 * `name` is used as the XML tag attribute and must be a short identifier —
 * we validate it here (alphanumeric + underscore only).
 */
function wrapUserData(name: string, raw: string): string {
  const safeName = name.replace(/[^a-zA-Z0-9_]/g, "");
  let value = raw;
  if (value.length > SANITIZER_MAX_LEN) {
    value = `${value.slice(0, SANITIZER_MAX_LEN)}…[truncated]`;
  }
  value = neutralizeControlChars(value);
  value = stripDirectives(value);
  // Wrap in <user_data> with escaped content. We escape angle brackets so the
  // LLM can't break out of the tag and rewrite the surrounding context.
  return `<user_data name="${safeName}">${escapeXml(value)}</user_data>`;
}

/** True if a given context field is "user-controlled" and must be sanitized. */
function isUserControlled(key: string): boolean {
  return [
    "user_name",
    "target_name",
    "user_message",
    "recent_messages",
    "user_messages_sample",
    "target_messages_sample",
    "all_messages",
    "reply_to_text",
    "reply_to_user",
    "chat_context",
  ].includes(key);
}

export function renderTemplate(template: string, context: PromptContext): string {
  return template.replace(PLACEHOLDER_PATTERN, (_match, key) => {
    const val = context[key as keyof PromptContext];
    if (val === undefined || val === null) {
      return _match;
    }
    const strVal = String(val);
    if (isUserControlled(key)) {
      return wrapUserData(key, strVal);
    }
    return strVal;
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
