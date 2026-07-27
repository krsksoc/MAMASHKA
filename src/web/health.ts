import { statSync } from "node:fs";
import { getConfig } from "../core/config.js";
import { getDb } from "../data/db.js";

export interface HealthData {
  status: "ok" | "degraded";
  timestamp: string;
  uptime: number;
  db: {
    size_bytes: number;
    messages_count: number;
    users_count: number;
    wal_size_bytes: number;
  };
  providers: Record<string, { configured: boolean }>;
  memory: {
    rss_mb: number;
    heap_used_mb: number;
    external_mb: number;
  };
}

export function getHealthData(): HealthData {
  const config = getConfig();
  const db = getDb();

  let dbSize = 0;
  let walSize = 0;
  try {
    dbSize = statSync(config.DB_PATH).size;
  } catch {
    // ignore
  }
  try {
    walSize = statSync(`${config.DB_PATH}-wal`).size;
  } catch {
    // ignore
  }

  const messagesRow = db.prepare("SELECT COUNT(*) as cnt FROM messages").get() as {
    cnt: number;
  } | null;
  const usersRow = db.prepare("SELECT COUNT(*) as cnt FROM users").get() as { cnt: number } | null;

  const providers: Record<string, { configured: boolean }> = {
    wormsoft: { configured: !!config.WORM_KEY },
    openai: { configured: !!config.OPENAI_API_KEY },
    anthropic: { configured: !!config.ANTHROPIC_API_KEY },
    openrouter: { configured: !!config.OPENROUTER_API_KEY },
    ollama: { configured: !!config.OLLAMA_BASE_URL },
  };

  const mem = process.memoryUsage();

  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    db: {
      size_bytes: dbSize,
      messages_count: Number(messagesRow?.cnt ?? 0),
      users_count: Number(usersRow?.cnt ?? 0),
      wal_size_bytes: walSize,
    },
    providers,
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      external_mb: Math.round(mem.external / 1024 / 1024),
    },
  };
}
