import { getPromptFromStore } from "./store.js";
import { renderTemplate } from "./templates.js";
import { resolveModifiers } from "./modifiers.js";
import type { PromptContext } from "./schema.js";
import type { LLMRequest } from "../core/types.js";

export interface BuildOptions {
  taskSlug: string;
  context: PromptContext;
  userMessage: string;
  maxSystemTokens?: number;
}

const DEFAULT_MAX_SYSTEM_TOKENS = 4000;
const TOKEN_RESERVE = 500;

export function buildPromptRequest(options: BuildOptions): LLMRequest {
  const { taskSlug, context, userMessage, maxSystemTokens = DEFAULT_MAX_SYSTEM_TOKENS } = options;

  // Character
  const characterPrompt = getPromptFromStore("character");
  let systemParts: string[] = [];
  if (characterPrompt) {
    systemParts.push(characterPrompt.content);
  }

  // Task
  const taskPrompt = getPromptFromStore(taskSlug);
  if (taskPrompt) {
    const rendered = renderTemplate(taskPrompt.content, context);
    systemParts.push(rendered);
  }

  // Modifiers
  const modifiers = resolveModifiers(taskSlug, context);
  for (const mod of modifiers) {
    systemParts.push(mod.content);
  }

  // Token budget: cut modifiers from the end if over budget
  const tokenLimit = maxSystemTokens - TOKEN_RESERVE;
  // Rough estimate: ~4 chars per token
  let systemRaw = systemParts.join("\n\n");
  if (systemRaw.length > tokenLimit * 4) {
    // Remove modifiers from the end until under budget
    while (systemRaw.length > tokenLimit * 4 && modifiers.length > 0) {
      modifiers.pop();
      systemParts = [
        characterPrompt ? characterPrompt.content : "",
        taskPrompt ? renderTemplate(taskPrompt.content, context) : "",
        ...modifiers.map((m) => m.content),
      ].filter(Boolean);
      systemRaw = systemParts.join("\n\n");
    }
  }

  return {
    system: systemRaw,
    user: userMessage,
  };
}