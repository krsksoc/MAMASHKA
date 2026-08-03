import { getUser } from "../data/repos/users.js";
import { getDb } from "../data/db.js";
import { completeWithFallback, getChain } from "../llm/router.js";
import { buildPromptRequest } from "../prompts/builder.js";
import { getStyleStats, styleFingerprint } from "./style_profile.js";

/**
 * Pick a *diversified* sample of N messages, not just the last N.
 * Stratified sampling:
 *   - 30 most recent
 *   - 100 random across the last 7 days
 *   - 50 longest ever
 *   - 20 with the most emojis / caps (emotional / characteristic)
 *
 * Total budget: ~200 messages — fits comfortably in any LLM context.
 */
function getDiversifiedSample(userId: number, chatId: number, limit = 200): Array<{ id: number; text: string | null }> {
  const db = getDb();
  const seen = new Set<number>();
  const result: Array<{ id: number; text: string | null }> = [];

  const pushUnique = (rows: Array<{ id: number; text: string | null }>) => {
    for (const r of rows) {
      if (!seen.has(r.id)) {
        seen.add(r.id);
        result.push(r);
      }
    }
  };

  // 1) 30 most recent
  pushUnique(
    db
      .prepare(
        `SELECT id, text FROM messages
         WHERE user_id = ? AND chat_id = ? AND text IS NOT NULL AND length(text) > 0
         ORDER BY id DESC LIMIT 30`,
      )
      .all(userId, chatId) as Array<{ id: number; text: string | null }>,
  );

  // 2) 100 random across last 7 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  pushUnique(
    db
      .prepare(
        `SELECT id, text FROM messages
         WHERE user_id = ? AND chat_id = ? AND text IS NOT NULL AND length(text) > 0
           AND created_at >= ?
         ORDER BY RANDOM() LIMIT 100`,
      )
      .all(userId, chatId, cutoff.toISOString()) as Array<{ id: number; text: string | null }>,
  );

  // 3) 50 longest
  pushUnique(
    db
      .prepare(
        `SELECT id, text FROM messages
         WHERE user_id = ? AND chat_id = ? AND text IS NOT NULL AND length(text) > 0
         ORDER BY length(text) DESC LIMIT 50`,
      )
      .all(userId, chatId) as Array<{ id: number; text: string | null }>,
  );

  // 4) 20 with most emojis / emotional — heuristic: longest + presence of uppercase or emoji
  pushUnique(
    db
      .prepare(
        `SELECT id, text FROM messages
         WHERE user_id = ? AND chat_id = ? AND text IS NOT NULL AND length(text) > 0
           AND (text GLOB '*[A-ZА-Я][A-ZА-Я][A-ZА-Я]*' OR text LIKE '%!%' OR text LIKE '%?%')
         ORDER BY length(text) DESC LIMIT 20`,
      )
      .all(userId, chatId) as Array<{ id: number; text: string | null }>,
  );

  // Return up to `limit`, preserving insertion order (recent → random → long → emotional)
  return result.slice(0, limit);
}

/**
 * Pick "exemplar" messages — short, real, characteristic messages
 * that the user actually typed. These become few-shot examples in the prompt.
 *
 * Strategy:
 *   - Filter out commands (/start, /fact, etc.)
 *   - Take short messages (1-50 chars) — they're the user's signature
 *   - Prefer variety — skip near-duplicates
 *
 * Returns up to N examples, joined with newlines.
 */
function getExemplarMessages(userId: number, chatId: number, n = 25): string {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT text FROM messages
       WHERE user_id = ? AND chat_id = ?
         AND text IS NOT NULL
         AND length(text) BETWEEN 2 AND 60
         AND text NOT LIKE '/%'
         AND text NOT LIKE '@%'
       ORDER BY id DESC LIMIT 300`,
    )
    .all(userId, chatId) as Array<{ text: string }>;

  // Dedupe near-duplicates (case-insensitive, whitespace-normalized)
  const seen = new Set<string>();
  const picked: string[] = [];
  for (const r of rows) {
    const normalized = r.text.trim().toLowerCase().replace(/\s+/g, " ");
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    picked.push(r.text.trim());
    if (picked.length >= n) break;
  }

  return picked.join("\n");
}

export async function imitateUser(
  targetUserId: number,
  chatId: number,
  _userName: string | null,
  prompt: string,
): Promise<string> {
  const target = getUser(targetUserId);
  const targetName = target?.displayName ?? target?.username ?? "unknown";

  // Style profile (cached, recomputed if stale).
  const style = getStyleStats(targetUserId, chatId, { maxAgeHours: 12 });
  const fingerprint = styleFingerprint(style);

  // Few-shot exemplars — real short messages in the user's voice.
  const exampleMessages = getExemplarMessages(targetUserId, chatId, 25);

  // Diversified message sample (broader signal).
  const diversifiedSample = getDiversifiedSample(targetUserId, chatId, 200);

  const context = {
    target_name: targetName,
    target_id: targetUserId,
    // Style fingerprint — concrete numbers, not generic "be casual"
    style_fingerprint: fingerprint,
    // Few-shot examples — THE most important signal.
    example_messages: exampleMessages,
    // Diversified — broader signal
    diversified_sample: diversifiedSample.map((m) => m.text).filter(Boolean).join("\n"),
    sample_size: diversifiedSample.length,
    user_prompt: prompt,
  };

  const request = buildPromptRequest({
    taskSlug: "task:imitate",
    context,
    userMessage: prompt,
  });
  return completeWithFallback(request, getChain("default"));
}
