import { getConfig } from "../core/config.js";
import { getDb } from "../data/db.js";
import type { User } from "../core/types.js";

const AVATAR_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * Refresh a user's avatar_url in the DB if it's stale (>24h) or missing.
 *
 * Telegram flow:
 *   1. getUserProfilePhotos(telegram_id) → photos[].sizes[].file_id
 *   2. getFile(file_id) → file_path
 *   3. URL = "https://api.telegram.org/file/bot<TOKEN>/<file_path>"
 *
 * Steps 1+2 are merged: we call the Bot API once with the chosen size.
 *
 * Returns the fresh URL or null if the user has no photo / API failed.
 * NEVER throws — failures are logged and the caller keeps using the
 * (possibly stale) cached value.
 */
export async function refreshAvatarIfStale(user: User): Promise<string | null> {
  const now = Date.now();

  // Cache hit: fresh within TTL
  if (user.avatarUrl && user.avatarUpdatedAt) {
    const age = now - new Date(user.avatarUpdatedAt + "Z").getTime();
    if (age < AVATAR_TTL_MS) {
      return user.avatarUrl;
    }
  }

  // Cache miss or stale — try to refresh from Telegram
  const fresh = await fetchAvatarFromTelegram(user.telegramId);
  if (fresh === undefined) {
    // API error — keep whatever we had (even if null)
    return user.avatarUrl;
  }
  // Update DB (best-effort; failures here don't block)
  try {
    const db = getDb();
    db.prepare(
      "UPDATE users SET avatar_url = ?, avatar_updated_at = datetime('now') WHERE id = ?",
    ).run(fresh, user.id);
  } catch (e) {
    console.error(`[AVATAR] failed to persist avatar for user ${user.id}:`, e);
  }
  return fresh;
}

/**
 * Internal: actually call the Telegram Bot API.
 * Returns:
 *   - string URL on success
 *   - null if user has no profile photo (legitimate 404-ish)
 *   - undefined on transport / API error (caller should retry later)
 */
async function fetchAvatarFromTelegram(
  telegramId: number,
): Promise<string | null | undefined> {
  const config = getConfig();
  const token = config.BOT_TOKEN;
  if (!token) return undefined;

  try {
    // Step 1: getUserProfilePhotos
    const photosRes = await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${telegramId}&limit=1`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!photosRes.ok) {
      console.error(
        `[AVATAR] getUserProfilePhotos failed: HTTP ${photosRes.status}`,
      );
      return undefined;
    }
    const photosJson = (await photosRes.json()) as {
      ok: boolean;
      result?: { photos?: Array<Array<{ file_id: string; width: number }>> };
      description?: string;
    };
    if (!photosJson.ok) {
      console.error(`[AVATAR] API error: ${photosJson.description}`);
      return undefined;
    }
    const firstPhoto = photosJson.result?.photos?.[0];
    if (!firstPhoto || firstPhoto.length === 0) {
      // User has no profile photo — legitimate null, store it so we don't keep retrying.
      return null;
    }

    // Pick the largest size (last in array per Telegram docs)
    const fileId = firstPhoto[firstPhoto.length - 1]?.file_id;
    if (!fileId) return null;

    // Step 2: getFile
    const fileRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!fileRes.ok) {
      console.error(`[AVATAR] getFile failed: HTTP ${fileRes.status}`);
      return undefined;
    }
    const fileJson = (await fileRes.json()) as {
      ok: boolean;
      result?: { file_path?: string };
      description?: string;
    };
    if (!fileJson.ok || !fileJson.result?.file_path) {
      console.error(`[AVATAR] getFile API error: ${fileJson.description ?? "no file_path"}`);
      return undefined;
    }

    // Step 3: build public URL
    return `https://api.telegram.org/file/bot${token}/${fileJson.result.file_path}`;
  } catch (e) {
    console.error(`[AVATAR] fetch failed for telegramId=${telegramId}:`, e);
    return undefined;
  }
}
