import type { LLMRequest, LLMOptions } from "../core/types.js";

export interface LLMProvider {
  complete(request: LLMRequest, options?: LLMOptions): Promise<string>;
  readonly name: string;
  readonly supportsStreaming: boolean;
}

// Shared response type guards for LLM API responses

export function isOpenAIMessageContent(
  json: unknown,
): json is { choices?: Array<{ message?: { content?: string } }> } {
  if (typeof json !== "object" || json === null) return false;
  return true;
}

export function extractOpenAIContent(json: unknown): string | undefined {
  if (!isOpenAIMessageContent(json)) return undefined;
  const choices = json.choices;
  if (!Array.isArray(choices) || choices.length === 0) return undefined;
  const first = choices[0];
  if (typeof first !== "object" || first === null) return undefined;
  const msg = first.message;
  if (typeof msg !== "object" || msg === null) return undefined;
  return typeof msg.content === "string" ? msg.content : undefined;
}

export function isAnthropicContent(
  json: unknown,
): json is { content?: Array<{ type: string; text?: string }> } {
  if (typeof json !== "object" || json === null) return false;
  return true;
}

export function extractAnthropicText(json: unknown): string | undefined {
  if (!isAnthropicContent(json)) return undefined;
  const content = json.content;
  if (!Array.isArray(content)) return undefined;
  for (const block of content) {
    if (typeof block === "object" && block !== null && block.type === "text") {
      return typeof block.text === "string" ? block.text : undefined;
    }
  }
  return undefined;
}

export function isOllamaMessage(
  json: unknown,
): json is { message?: { content?: string } } {
  if (typeof json !== "object" || json === null) return false;
  return true;
}

export function extractOllamaContent(json: unknown): string | undefined {
  if (!isOllamaMessage(json)) return undefined;
  const msg = json.message;
  if (typeof msg !== "object" || msg === null) return undefined;
  return typeof msg.content === "string" ? msg.content : undefined;
}