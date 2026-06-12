import { getConfig } from "../../core/config.js";
import { LLMError } from "../../core/errors.js";
import type { LLMOptions, LLMRequest } from "../../core/types.js";
import type { LLMProvider } from "../provider.js";

function extractText(json: unknown): string {
  if (typeof json !== "object" || json === null) return "";
  const obj = json as Record<string, unknown>;
  const choices = Array.isArray(obj.choices) ? obj.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  if (!first) return "";
  const msg = first.message as Record<string, unknown> | undefined;
  if (!msg) return "";
  const content = typeof msg.content === "string" ? msg.content : "";
  if (content.length > 0) return content;
  const reasoning = typeof msg.reasoning === "string" ? msg.reasoning : "";
  return reasoning;
}

export function createWormsoftProvider(): LLMProvider {
  return {
    name: "wormsoft",
    supportsStreaming: false,
    async complete(request: LLMRequest, options?: LLMOptions): Promise<string> {
      const config = getConfig();
      if (!config.WORM_KEY) {
        throw new LLMError("Wormsoft API key not configured", "wormsoft");
      }
      const model = options?.model ?? "openai/gpt-oss:120b";
      const response = await fetch(`${config.WORM_ENDPOINT}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.WORM_KEY}`,
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
        throw new LLMError(`Wormsoft API error ${response.status}: ${text}`, "wormsoft");
      }
      const json = await response.json();
      const text = extractText(json);
      if (!text) {
        throw new LLMError("Wormsoft returned no content", "wormsoft");
      }
      return text;
    },
  };
}
