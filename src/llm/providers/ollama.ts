import { getConfig } from "../../core/config.js";
import { LLMError } from "../../core/errors.js";
import type { LLMOptions, LLMRequest } from "../../core/types.js";
import type { LLMProvider } from "../provider.js";
import { extractOllamaContent, fetchWithTimeout } from "../provider.js";

export function createOllamaProvider(): LLMProvider {
  return {
    name: "ollama",
    supportsStreaming: false,
    async complete(request: LLMRequest, options?: LLMOptions): Promise<string> {
      const config = getConfig();
      const baseUrl = config.OLLAMA_BASE_URL;
      const model = options?.model ?? config.OLLAMA_MODEL;
      let response: Response;
      try {
        response = await fetchWithTimeout(`${baseUrl}/api/chat`, {
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
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new LLMError(`Ollama timeout`, "ollama", { cause: err });
        }
        throw err;
      }
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
