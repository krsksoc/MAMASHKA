#!/usr/bin/env bun
/**
 * Pre-warm Telegram avatar_url for users who don't have one yet (or have a stale one).
 * Calls the bot's refreshAvatarIfStale() so we don't duplicate Bot API logic.
 *
 * Usage:
 *   bun mamoolya-prewarm-avatars.ts [--limit N] [--stale-only]
 *
 * Runs against the live SQLite DB at data/db.ts. Uses getUserById() + refreshAvatarIfStale().
 */
import { getDb } from "../src/data/db.ts";
import { refreshAvatarIfStale } from "../src/services/avatars.ts";
import { prewarmAvatars } from "../src/services/avatarProxy.ts";
import { KRSK_SOC_CHAT_ID } from "../src/services/achievements.ts";
import type { User } from "../src/data/repos/users.ts";
import { getUser } from "../src/data/repos/users.ts";

const args = process.argv.slice(2);
let limit = 100;
let staleOnly = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--limit") limit = Number(args[++i]);
  if (args[i] === "--stale-only") staleOnly = true;
}

const db = getDb();

const sql = staleOnly
  ? `
    SELECT id, telegram_id, display_name, username
    FROM users
    WHERE avatar_url IS NULL
       OR avatar_url = ''
       OR avatar_updated_at IS NULL
       OR datetime(avatar_updated_at) < datetime('now', '-1 day')
    ORDER BY message_count DESC
    LIMIT ?
  `
  : `
    SELECT id, telegram_id, display_name, username
    FROM users
    WHERE avatar_url IS NULL OR avatar_url = ''
    ORDER BY message_count DESC
    LIMIT ?
  `;

const rows = db.query(sql).all(limit) as Array<{
  id: number;
  telegram_id: number;
  display_name: string | null;
  username: string | null;
}>;

console.log(`[prewarm] ${rows.length} users to refresh`);

let ok = 0;
let fail = 0;
let skipped = 0;

for (let i = 0; i < rows.length; i++) {
  const row = rows[i];
  const label = row.display_name || row.username || `id=${row.id}`;
  try {
    const user: User | null = getUser(row.id);
    if (!user) {
      skipped++;
      console.log(`[${i + 1}/${rows.length}] ${label}: vanished, skip`);
      continue;
    }
    const fresh = await refreshAvatarIfStale(user);
    if (fresh) {
      ok++;
      console.log(`[${i + 1}/${rows.length}] ${label}: ok (${fresh.slice(0, 60)}...)`);
    } else {
      // No photo available from Telegram — not an error, just skip
      ok++;
      console.log(`[${i + 1}/${rows.length}] ${label}: no photo`);
    }
  } catch (e) {
    fail++;
    console.error(`[${i + 1}/${rows.length}] ${label}: ERR`, e);
  }

  // Politeness: small delay every 5 users to avoid hammering Bot API
  if ((i + 1) % 5 === 0) {
    await new Promise((r) => setTimeout(r, 500));
  }
}

  console.log(`[prewarm] done: ok=${ok} fail=${fail} skipped=${skipped}`);

  // Second pass: actually fetch the bytes from Telegram and cache them on disk
  // under data/avatars/<id>.<ext>. Without this, /avatar/<id> would have to
  // hit Telegram on every webapp open.
  // Re-read the users since refreshAvatarIfStale may have just populated avatar_url.
  const allUserIds = db
    .query("SELECT id FROM users WHERE chat_id = ? AND avatar_url IS NOT NULL AND avatar_url != ''")
    .all(KRSK_SOC_CHAT_ID) as Array<{ id: number }>;
  const idsToCache = allUserIds.map((r) => r.id);
  if (idsToCache.length > 0) {
    console.log(`[prewarm-cache] downloading ${idsToCache.length} avatars to disk...`);
    const { ok: cacheOk, failed: cacheFail } = await prewarmAvatars(idsToCache);
    console.log(`[prewarm-cache] done: ok=${cacheOk} failed=${cacheFail}`);
  }

  process.exit(fail > 0 ? 1 : 0);
