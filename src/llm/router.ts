import type { LLMProvider } from "./provider.js";
import type { LLMRequest, LLMOptions } from "../core/types.js";
import { createOpenAIProvider } from "./providers/openai.js";
import { createAnthropicProvider } from "./providers/anthropic.js";
import { createOpenRouterProvider } from "./providers/openrouter.js";
import { createOllamaProvider } from "./providers/ollama.js";
import { LLMError } from "../core/errors.js";

// Task → chain of [provider, model?]
export interface ProviderChain {
  providers: Array<{ name: string; getProvider: () => LLMProvider }>;
  options?: LLMOptions;
}

const DEFAULT_CHAIN: ProviderChain = {
  providers: [
    { name: "openrouter", getProvider: createOpenRouterProvider },
    { name: "openai", getProvider: createOpenAIProvider },
    { name: "ollama", getProvider: createOllamaProvider },
  ],
};

const chains: Record<string, ProviderChain> = {
  default: DEFAULT_CHAIN,
  fast: {
    providers: [
      { name: "openrouter", getProvider: createOpenRouterProvider },
      { name: "openai", getProvider: createOpenAIProvider },
    ],
    options: { maxTokens: 256 },
  },
  summary: {
    providers: [
      { name: "anthropic", getProvider: createAnthropicProvider },
      { name: "openai", getProvider: createOpenAIProvider },
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