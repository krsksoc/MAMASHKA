import { LLMError } from "../core/errors.js";
import type { LLMOptions, LLMRequest } from "../core/types.js";
import type { LLMProvider } from "./provider.js";
import { getLlmTimeoutMs } from "./provider.js";
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

// Sentinel: returned when the entire chain timing-budget is exhausted.
// The caller can use this to translate into a friendlier "model is busy" message.
export class LLMChainTimeoutError extends Error {
  constructor(public readonly timeoutMs: number) {
    super(`LLM chain timed out after ${timeoutMs}ms`);
    this.name = "LLMChainTimeoutError";
  }
}

// Call the chain sequentially. Each provider has its own per-call timeout
// (AbortController inside fetchWithTimeout), but we add an overall budget:
// if the chain doesn't return in CHAIN_BUDGET_MS, we abort and bail.
const CHAIN_BUDGET_MS = 90_000;

export async function completeWithFallback(
  request: LLMRequest,
  chain: ProviderChain,
  options?: LLMOptions,
): Promise<string> {
  const errors: Array<{ provider: string; message: string }> = [];
  const budgetMs = getLlmTimeoutMs() * 3; // 3× per-call = loose chain budget; clamp lower if you like
  const budget = Math.min(budgetMs, CHAIN_BUDGET_MS);

  // Best-effort: don't actually cancel individual provider requests,
  // but bail out of the chain if we've blown the budget entirely.
  const chainStarted = Date.now();

  for (const entry of chain.providers) {
    if (Date.now() - chainStarted > budget) {
      throw new LLMChainTimeoutError(budget);
    }
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
