import { getConfig } from "../../core/config.js";
import { LLMError } from "../../core/errors.js";
import type { LLMOptions, LLMRequest } from "../../core/types.js";
import type { LLMProvider } from "../provider.js";
import { extractOpenAIContent, fetchWithTimeout } from "../provider.js";

export function createOpenRouterProvider(): LLMProvider {
  return {
    name: "openrouter",
    supportsStreaming: false,
    async complete(request: LLMRequest, options?: LLMOptions): Promise<string> {
      const config = getConfig();
      if (!config.OPENROUTER_API_KEY) {
        throw new LLMError("OpenRouter API key not configured", "openrouter");
      }
      const model = options?.model ?? config.OPENROUTER_MODEL;
      let response: Response;
      try {
        response = await fetchWithTimeout("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
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
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new LLMError(`OpenRouter timeout`, "openrouter", { cause: err });
        }
        throw err;
      }
      if (!response.ok) {
        const text = await response.text();
        throw new LLMError(`OpenRouter API error ${response.status}: ${text}`, "openrouter");
      }
      const json = await response.json();
      const content = extractOpenAIContent(json);
      if (typeof content !== "string") {
        throw new LLMError("OpenRouter returned no content", "openrouter");
      }
      return content;
    },
  };
}
