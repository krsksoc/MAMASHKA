import type { Prompt } from "../core/types.js";
import { createPrompt, getAllActivePrompts } from "../data/repos/prompts.js";

// In-memory cache
const _cache = new Map<string, Prompt>();
let _cacheLoaded = false;

function loadCache(): void {
  if (_cacheLoaded) return;
  _cacheLoaded = true;
  const prompts = getAllActivePrompts();
  for (const p of prompts) {
    _cache.set(p.slug, p);
  }
}

export function getPromptFromStore(slug: string): Prompt | null {
  loadCache();
  return _cache.get(slug) ?? null;
}

export function savePrompt(slug: string, content: string): void {
  createPrompt(slug, content);
  loadCache();
  _cache.clear();
  _cacheLoaded = false;
  loadCache();
}

export function invalidateCache(): void {
  _cache.clear();
  _cacheLoaded = false;
}
