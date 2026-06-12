import { getConfig } from "../core/config.js";
import { LLMError } from "../core/errors.js";
import type { LLMOptions, LLMRequest } from "../core/types.js";
import type { LLMProvider } from "./provider.js";
import { createAnthropicProvider } from "./providers/anthropic.js";
import { createOllamaProvider } from "./providers/ollama.js";
import { createOpenAIProvider } from "./providers/openai.js";
import { createOpenRouterProvider } from "./providers/openrouter.js";
import { createWormsoftProvider } from "./providers/wormsoft.js";

// Task → chain of [provider, model?]
export interface ProviderChain {
  providers: Array<{ name: string; getProvider: () => LLMProvider }>;
  options?: LLMOptions;
}

// Default chain: wormsoft → openai → openrouter → ollama
function buildDefaultChain(): ProviderChain {
  return {
    providers: [
      { name: "wormsoft", getProvider: createWormsoftProvider },
      { name: "openai", getProvider: createOpenAIProvider },
      { name: "openrouter", getProvider: createOpenRouterProvider },
      { name: "ollama", getProvider: createOllamaProvider },
    ],
  };
}

const DEFAULT_CHAIN = buildDefaultChain();

const chains: Record<string, ProviderChain> = {
  default: DEFAULT_CHAIN,
  fast: {
    providers: [
      { name: "wormsoft", getProvider: createWormsoftProvider },
      { name: "openai", getProvider: createOpenAIProvider },
    ],
    options: { maxTokens: 256 },
  },
  summary: {
    providers: [
      { name: "wormsoft", getProvider: createWormsoftProvider },
      { name: "anthropic", getProvider: createAnthropicProvider },
    ],
  },
};

export function getChain(name: string): ProviderChain {
  return chains[name] ?? DEFAULT_CHAIN;
}

export async function completeWithFallback(
  request: LLMRequest,
  chain: ProviderChain,
  options?: LLMOptions,
): Promise<string> {
  const errors: Array<{ provider: string; message: string }> = [];

  for (const entry of chain.providers) {
    try {
      const provider = entry.getProvider();
      const mergedOptions = { ...chain.options, ...options };
      return await provider.complete(request, mergedOptions);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ provider: entry.name, message: msg });
    }
  }

  throw new LLMError(
    `All providers failed for chain. Errors: ${errors.map((e) => `${e.provider}: ${e.message}`).join(" | ")}`,
    "router",
    { errors },
  );
}
