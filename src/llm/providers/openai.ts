import type { LLMProvider } from "../provider.js";
import type { LLMRequest, LLMOptions } from "../../core/types.js";
import { LLMError } from "../../core/errors.js";
import { getConfig } from "../../core/config.js";
import { extractOpenAIContent } from "../provider.js";

export function createOpenAIProvider(): LLMProvider {
  return {
    name: "openai",
    supportsStreaming: false,
    async complete(request: LLMRequest, options?: LLMOptions): Promise<string> {
      const config = getConfig();
      if (!config.OPENAI_API_KEY) {
        throw new LLMError("OpenAI API key not configured", "openai");
      }
      const model = options?.model ?? config.OPENAI_MODEL;
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 1024,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new LLMError(`OpenAI API error ${response.status}: ${text}`, "openai");
      }
      const json = await response.json();
      const content = extractOpenAIContent(json);
      if (typeof content !== "string") {
        throw new LLMError("OpenAI returned no content", "openai");
      }
      return content;
    },
  };
}