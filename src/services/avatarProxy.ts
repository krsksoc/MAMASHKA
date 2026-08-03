import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../core/config.js";
import { getDb } from "../data/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const AVATAR_DIR = join(__dirname, "..", "..", "data", "avatars");
const PROXY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days — Telegram photos rarely change
const FETCH_TIMEOUT_MS = 5_000;

async function ensureDir(): Promise<void> {
  if (!existsSync(AVATAR_DIR)) {
    await mkdir(AVATAR_DIR, { recursive: true });
  }
}

function localPath(userId: number, ext: string): string {
  return join(AVATAR_DIR, `${userId}.${ext}`);
}

/**
 * Pick the right local file path for a userId. Returns null if no cached avatar.
 */
async function findCachedFile(userId: number): Promise<string | null> {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const p = localPath(userId, ext);
    if (existsSync(p)) return p;
  }
  return null;
}

function extensionFromContentType(ct: string | null): string {
  if (!ct) return "jpg";
  if (ct.includes("png")) return "png";
  if (ct.includes("webp")) return "webp";
  if (ct.includes("jpeg") || ct.includes("jpg")) return "jpg";
  return "jpg";
}

/**
 * Resolve the Telegram CDN URL for a user's avatar.
 * - Reads `avatar_url` from the users row (cached for 24h by refreshAvatarIfStale).
 * - If missing or stale, fetches once via Bot API and persists.
 *
 * NEVER throws. Returns null if user has no photo or transport fails.
 */
async function resolveTelegramUrl(userId: number): Promise<string | null> {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT telegram_id, avatar_url, avatar_updated_at FROM users WHERE id = ?",
    )
    .get(userId) as
    | { telegram_id: number; avatar_url: string | null; avatar_updated_at: string | null }
    | undefined;
  if (!row) return null;

  const now = Date.now();
  if (row.avatar_url && row.avatar_updated_at) {
    const age = now - new Date(row.avatar_updated_at + "Z").getTime();
    if (age < 24 * 60 * 60 * 1000) {
      return row.avatar_url;
    }
  }

  // Lazy fetch
  const token = getConfig().BOT_TOKEN;
  if (!token) return null;
  try {
    const photosRes = await fetch(
      `https://api.telegram.org/bot${token}/getUserProfilePhotos?user_id=${row.telegram_id}&limit=1`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!photosRes.ok) return row.avatar_url;
    const photosJson = (await photosRes.json()) as {
      ok: boolean;
      result?: { photos?: Array<Array<{ file_id: string }>> };
    };
    const first = photosJson.result?.photos?.[0];
    if (!first || first.length === 0) return null;
    const fileId = first[first.length - 1]?.file_id;
    if (!fileId) return null;

    const fileRes = await fetch(
      `https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`,
      { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) },
    );
    if (!fileRes.ok) return row.avatar_url;
    const fileJson = (await fileRes.json()) as {
      ok: boolean;
      result?: { file_path?: string };
    };
    const filePath = fileJson.result?.file_path;
    if (!filePath) return row.avatar_url;
    const url = `https://api.telegram.org/file/bot${token}/${filePath}`;
    db.prepare(
      "UPDATE users SET avatar_url = ?, avatar_updated_at = datetime('now') WHERE id = ?",
    ).run(url, userId);
    return url;
  } catch (e) {
    console.error(`[AVATAR-PROXY] resolve failed for user ${userId}:`, e);
    return row.avatar_url;
  }
}

export interface AvatarFile {
  /** Local file contents. */
  body: Buffer;
  /** MIME type inferred from extension. */
  contentType: string;
}

/**
 * Get avatar bytes for a user. Returns null if no photo available.
 * Cache flow:
 *   1. Look for cached file under data/avatars/<id>.<ext> — if newer than PROXY_TTL_MS, use it.
 *   2. Otherwise fetch from Telegram CDN, persist locally, return.
 *
 * NEVER throws — returns null on any failure.
 */
export async function getAvatarFile(userId: number): Promise<AvatarFile | null> {
  await ensureDir();

  // 1. Cache hit?
  const cached = await findCachedFile(userId);
  if (cached) {
    const s = await stat(cached);
    if (Date.now() - s.mtimeMs < PROXY_TTL_MS) {
      const body = await readFile(cached);
      const ext = cached.split(".").pop() ?? "jpg";
      const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return { body, contentType };
    }
  }

  // 2. Fetch from Telegram and persist.
  const url = await resolveTelegramUrl(userId);
  if (!url) return null;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "follow",
    });
    if (!res.ok) {
      console.error(`[AVATAR-PROXY] download failed for user ${userId}: HTTP ${res.status}`);
      return null;
    }
    const ct = res.headers.get("content-type");
    const ext = extensionFromContentType(ct);
    const buf = Buffer.from(await res.arrayBuffer());

    // Don't cache empty responses
    if (buf.length === 0) return null;

    const p = localPath(userId, ext);
    await writeFile(p, buf);

    const contentType = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { body: buf, contentType };
  } catch (e) {
    console.error(`[AVATAR-PROXY] download error for user ${userId}:`, e);
    return null;
  }
}

/**
 * Pre-warm avatar files for a list of user IDs.
 * Used by the daily prewarm cron job to keep cache fresh.
 */
export async function prewarmAvatars(userIds: number[]): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const id of userIds) {
    try {
      const result = await getAvatarFile(id);
      if (result) ok++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { ok, failed };
}
