/**
 * Lexical style profiler for /imitate.
 *
 * Scans a user's recent messages and produces a compact "voice fingerprint":
 *   - length distribution (avg, median)
 *   - caps/emoji/question/exclamation ratios
 *   - top unigrams / bigrams / trigrams
 *   - top emojis
 *   - top message openings (first 1-3 words) — strong style signal
 *
 * Result is stored in user_style_stats as a cached computation.
 * Re-runs only if `compute_ms` was long ago or message_count_analyzed grew significantly.
 */

import { getDb } from "../data/db.js";

export interface StyleStats {
  messageCountAnalyzed: number;
  avgLength: number;
  medianLength: number;
  capsRatio: number;
  emojiDensity: number;
  questionRatio: number;
  exclamationRatio: number;
  topUnigrams: Array<{ token: string; count: number }>;
  topBigrams: Array<{ token: string; count: number }>;
  topTrigrams: Array<{ token: string; count: number }>;
  topEmojis: Array<{ emoji: string; count: number }>;
  topOpenings: Array<{ opening: string; count: number }>;
  sampleWindowDays: number;
  computeMs: number;
}

interface CachedStatsRow {
  message_count_analyzed: number;
  avg_message_length: number;
  median_message_length: number;
  caps_ratio: number;
  emoji_density: number;
  question_ratio: number;
  exclamation_ratio: number;
  top_unigrams: string;
  top_bigrams: string;
  top_trigrams: string;
  top_emojis: string;
  top_openings: string;
  sample_window_days: number;
  computed_at: string;
  compute_ms: number;
}

const CACHE_TTL_HOURS = 24;
const SIGNIFICANT_GROWTH = 0.25; // re-compute if message count grew 25%+

// ─── Helpers ──────────────────────────────────────────────────────────────

const STOPWORDS = new Set([
  "и", "в", "на", "с", "по", "для", "не", "что", "это", "как", "а", "но",
  "то", "из", "за", "к", "у", "о", "от", "до", "же", "бы", "ли", "мы",
  "вы", "он", "она", "они", "я", "ты", "его", "её", "их", "мой", "твой",
  "наш", "ваш", "быть", "был", "была", "было", "этот", "эта", "это", "тот",
  "так", "вот", "уже", "ещё", "да", "нет", "ну", "ок", "окей", "ага",
  "там", "тут", "здесь", "когда", "тогда", "потом", "все", "всё", "всех",
  "мне", "тебе", "ему", "ей", "нам", "вам", "мной", "тобой", "ним",
]);

function tokenize(text: string): string[] {
  // Lowercase + strip punctuation + split on whitespace. Keep numbers, emoji separately.
  return text
    .toLowerCase()
    .replace(/[''`]/g, "")
    .replace(/[.,!?;:()[\]{}«»"""''—–-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w));
}

function extractEmojis(text: string): string[] {
  // Match emoji ranges from Unicode — broad regex that catches most modern emoji.
  const re =
    /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;
  return text.match(re) ?? [];
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  }
  return sorted[mid] ?? 0;
}

function topN<K>(map: Map<K, number>, n: number): Array<{ [k: string]: K | number }> {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => ({ key: k, count: v }));
}

// ─── Public API ──────────────────────────────────────────────────────────

export function computeStyleStats(
  userId: number,
  chatId: number,
  windowDays = 90,
): StyleStats {
  const db = getDb();
  const t0 = Date.now();

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  const cutoffStr = cutoff.toISOString();

  // Pull all messages by this user in this chat within the window.
  const rows = db
    .prepare(
      "SELECT text FROM messages WHERE user_id = ? AND chat_id = ? AND created_at >= ? AND text IS NOT NULL AND length(text) > 0",
    )
    .all(userId, chatId, cutoffStr) as Array<{ text: string }>;

  const messages = rows.map((r) => r.text ?? "").filter((t) => t.length > 0);
  const n = messages.length;

  if (n === 0) {
    const empty: StyleStats = {
      messageCountAnalyzed: 0,
      avgLength: 0,
      medianLength: 0,
      capsRatio: 0,
      emojiDensity: 0,
      questionRatio: 0,
      exclamationRatio: 0,
      topUnigrams: [],
      topBigrams: [],
      topTrigrams: [],
      topEmojis: [],
      topOpenings: [],
      sampleWindowDays: windowDays,
      computeMs: Date.now() - t0,
    };
    return empty;
  }

  // Lengths
  const lengths = messages.map((m) => m.length);
  const avgLength = lengths.reduce((a, b) => a + b, 0) / n;
  const medLength = median(lengths);

  // Flags
  let caps = 0;
  let questions = 0;
  let exclamations = 0;
  let emojiTotal = 0;
  const emojiMap = new Map<string, number>();
  const unigramMap = new Map<string, number>();
  const bigramMap = new Map<string, number>();
  const trigramMap = new Map<string, number>();
  const openingMap = new Map<string, number>();

  for (const msg of messages) {
    // caps: at least 4 alpha chars and >50% of them uppercase
    const alphaChars = msg.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, "");
    if (alphaChars.length >= 4) {
      const upperChars = alphaChars.replace(/[^A-ZА-ЯЁ]/g, "");
      if (upperChars.length / alphaChars.length > 0.5) caps++;
    }
    if (msg.includes("?")) questions++;
    if (msg.includes("!")) exclamations++;

    const emojis = extractEmojis(msg);
    emojiTotal += emojis.length;
    for (const e of emojis) emojiMap.set(e, (emojiMap.get(e) ?? 0) + 1);

    const tokens = tokenize(msg);
    for (const tok of tokens) {
      unigramMap.set(tok, (unigramMap.get(tok) ?? 0) + 1);
    }
    // bigrams / trigrams from consecutive tokens
    for (let i = 0; i < tokens.length - 1; i++) {
      const bg = `${tokens[i]} ${tokens[i + 1]}`;
      bigramMap.set(bg, (bigramMap.get(bg) ?? 0) + 1);
    }
    for (let i = 0; i < tokens.length - 2; i++) {
      const tg = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
      trigramMap.set(tg, (trigramMap.get(tg) ?? 0) + 1);
    }
    // opening: first 1-3 tokens of the message
    if (tokens.length >= 1) {
      const op1 = tokens[0] ?? "";
      if (op1) openingMap.set(op1, (openingMap.get(op1) ?? 0) + 1);
    }
    if (tokens.length >= 2) {
      const op2 = `${tokens[0]} ${tokens[1]}`;
      openingMap.set(op2, (openingMap.get(op2) ?? 0) + 1);
    }
    if (tokens.length >= 3) {
      const op3 = `${tokens[0]} ${tokens[1]} ${tokens[2]}`;
      openingMap.set(op3, (openingMap.get(op3) ?? 0) + 1);
    }
  }

  const stats: StyleStats = {
    messageCountAnalyzed: n,
    avgLength: Math.round(avgLength * 10) / 10,
    medianLength: medLength,
    capsRatio: Math.round((caps / n) * 1000) / 1000,
    emojiDensity: Math.round((emojiTotal / n) * 100) / 100,
    questionRatio: Math.round((questions / n) * 1000) / 1000,
    exclamationRatio: Math.round((exclamations / n) * 1000) / 1000,
    topUnigrams: topN(unigramMap, 20).map((x) => ({ token: x["key"] as string, count: x["count"] as number })),
    topBigrams: topN(bigramMap, 15).map((x) => ({ token: x["key"] as string, count: x["count"] as number })),
    topTrigrams: topN(trigramMap, 10).map((x) => ({ token: x["key"] as string, count: x["count"] as number })),
    topEmojis: topN(emojiMap, 10).map((x) => ({ emoji: x["key"] as string, count: x["count"] as number })),
    topOpenings: topN(openingMap, 15).map((x) => ({ opening: x["key"] as string, count: x["count"] as number })),
    sampleWindowDays: windowDays,
    computeMs: Date.now() - t0,
  };

  // Persist to cache
  db.prepare(
    `INSERT INTO user_style_stats (
      user_id, message_count_analyzed, avg_message_length, median_message_length,
      caps_ratio, emoji_density, question_ratio, exclamation_ratio,
      top_unigrams, top_bigrams, top_trigrams, top_emojis, top_openings,
      sample_window_days, computed_at, compute_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?)
    ON CONFLICT(user_id) DO UPDATE SET
      message_count_analyzed = excluded.message_count_analyzed,
      avg_message_length = excluded.avg_message_length,
      median_message_length = excluded.median_message_length,
      caps_ratio = excluded.caps_ratio,
      emoji_density = excluded.emoji_density,
      question_ratio = excluded.question_ratio,
      exclamation_ratio = excluded.exclamation_ratio,
      top_unigrams = excluded.top_unigrams,
      top_bigrams = excluded.top_bigrams,
      top_trigrams = excluded.top_trigrams,
      top_emojis = excluded.top_emojis,
      top_openings = excluded.top_openings,
      sample_window_days = excluded.sample_window_days,
      computed_at = datetime('now'),
      compute_ms = excluded.compute_ms`,
  ).run(
    userId,
    stats.messageCountAnalyzed,
    stats.avgLength,
    stats.medianLength,
    stats.capsRatio,
    stats.emojiDensity,
    stats.questionRatio,
    stats.exclamationRatio,
    JSON.stringify(stats.topUnigrams),
    JSON.stringify(stats.topBigrams),
    JSON.stringify(stats.topTrigrams),
    JSON.stringify(stats.topEmojis),
    JSON.stringify(stats.topOpenings),
    stats.sampleWindowDays,
    stats.computeMs,
  );

  return stats;
}

export function getCachedStyleStats(userId: number): StyleStats | null {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM user_style_stats WHERE user_id = ?")
    .get(userId) as CachedStatsRow | undefined;
  if (!row) return null;

  const ageH = (Date.now() - new Date(row.computed_at + "Z").getTime()) / 3600_000;
  return {
    messageCountAnalyzed: row.message_count_analyzed,
    avgLength: row.avg_message_length,
    medianLength: row.median_message_length,
    capsRatio: row.caps_ratio,
    emojiDensity: row.emoji_density,
    questionRatio: row.question_ratio,
    exclamationRatio: row.exclamation_ratio,
    topUnigrams: safeParse(row.top_unigrams, []),
    topBigrams: safeParse(row.top_bigrams, []),
    topTrigrams: safeParse(row.top_trigrams, []),
    topEmojis: safeParse(row.top_emojis, []),
    topOpenings: safeParse(row.top_openings, []),
    sampleWindowDays: row.sample_window_days,
    computeMs: row.compute_ms,
    // expose age for caller
    _ageHours: ageH,
  } as StyleStats & { _ageHours: number };
}

function safeParse<T>(json: string, fallback: T): T {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Returns fresh stats — uses cache if available and fresh, otherwise recomputes.
 * Caller can override decision with force flag.
 */
export function getStyleStats(
  userId: number,
  chatId: number,
  options: { force?: boolean; maxAgeHours?: number } = {},
): StyleStats {
  const cached = options.force ? null : getCachedStyleStats(userId);
  const maxAge = options.maxAgeHours ?? CACHE_TTL_HOURS;

  if (cached && (cached as StyleStats & { _ageHours: number })._ageHours < maxAge) {
    // Still fresh enough — return as-is. But verify the user hasn't grown significantly.
    const db = getDb();
    const row = db
      .prepare(
        "SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND chat_id = ?",
      )
      .get(userId, chatId) as { n: number };
    const currentCount = Number(row.n);
    const cachedCount = cached.messageCountAnalyzed;
    if (currentCount >= cachedCount && currentCount <= cachedCount * (1 + SIGNIFICANT_GROWTH)) {
      return cached;
    }
  }
  return computeStyleStats(userId, chatId);
}

/**
 * Build a compact style fingerprint string for inclusion in LLM prompts.
 * Keeps it terse so the prompt doesn't bloat.
 */
export function styleFingerprint(stats: StyleStats): string {
  if (stats.messageCountAnalyzed === 0) {
    return "Нет истории сообщений — стиль неизвестен.";
  }
  const lines: string[] = [];
  lines.push(`Проанализировано ${stats.messageCountAnalyzed} сообщений за ${stats.sampleWindowDays}д.`);
  lines.push(`Средняя длина: ${stats.avgLength} символов (медиана ${stats.medianLength}).`);
  if (stats.capsRatio > 0.05) lines.push(`Часто КАПСОМ (${Math.round(stats.capsRatio * 100)}% сообщений).`);
  if (stats.emojiDensity > 0.5) lines.push(`Любит эмодзи: в среднем ${stats.emojiDensity} на сообщение.`);
  if (stats.questionRatio > 0.2) lines.push(`Часто задаёт вопросы (${Math.round(stats.questionRatio * 100)}%).`);
  if (stats.exclamationRatio > 0.2) lines.push(`Часто восклицает (${Math.round(stats.exclamationRatio * 100)}%).`);
  if (stats.topEmojis.length > 0) {
    lines.push(`Любимые эмодзи: ${stats.topEmojis.slice(0, 5).map((e) => `${e.emoji}×${e.count}`).join(", ")}.`);
  }
  if (stats.topOpenings.length > 0) {
    lines.push(
      `Типичные начала: ${stats.topOpenings
        .slice(0, 8)
        .map((o) => `"${o.opening}" (${o.count}×)`)
        .join("; ")}.`,
    );
  }
  if (stats.topBigrams.length > 0) {
    lines.push(
      `Частые биграммы: ${stats.topBigrams
        .slice(0, 8)
        .map((b) => `"${b.token}" (${b.count}×)`)
        .join("; ")}.`,
    );
  }
  return lines.join("\n");
}
