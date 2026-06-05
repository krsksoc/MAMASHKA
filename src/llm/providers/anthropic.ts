import type { LLMProvider } from "../provider.js";
import type { LLMRequest, LLMOptions } from "../../core/types.js";
import { LLMError } from "../../core/errors.js";
import { getConfig } from "../../core/config.js";
import { extractAnthropicText } from "../provider.js";

export function createAnthropicProvider(): LLMProvider {
  return {
    name: "anthropic",
    supportsStreaming: false,
    async complete(request: LLMRequest, options?: LLMOptions): Promise<string> {
      const config = getConfig();
      if (!config.ANTHROPIC_API_KEY) {
        throw new LLMError("Anthropic API key not configured", "anthropic");
      }
      const model = options?.model ?? config.ANTHROPIC_MODEL;
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": config.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 1024,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new LLMError(`Anthropic API error ${response.status}: ${text}`, "anthropic");
      }
      const json = await response.json();
      const textContent = extractAnthropicText(json);
      if (typeof textContent !== "string") {
        throw new LLMError("Anthropic returned no text content", "anthropic");
      }
      return textContent;
    },
  };
}