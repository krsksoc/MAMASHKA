import type { LLMProvider } from "../provider.js";
import type { LLMRequest, LLMOptions } from "../../core/types.js";
import { LLMError } from "../../core/errors.js";
import { getConfig } from "../../core/config.js";
import { extractOllamaContent } from "../provider.js";

export function createOllamaProvider(): LLMProvider {
  return {
    name: "ollama",
    supportsStreaming: false,
    async complete(request: LLMRequest, options?: LLMOptions): Promise<string> {
      const config = getConfig();
      const baseUrl = config.OLLAMA_BASE_URL;
      const model = options?.model ?? config.OLLAMA_MODEL;
      const response = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          options: {
            temperature: options?.temperature ?? 0.7,
          },
          stream: false,
        }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new LLMError(`Ollama error ${response.status}: ${text}`, "ollama");
      }
      const json = await response.json();
      const content = extractOllamaContent(json);
      if (typeof content !== "string") {
        throw new LLMError("Ollama returned no content", "ollama");
      }
      return content;
    },
  };
}