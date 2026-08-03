import { Database } from "bun:sqlite";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfig } from "../core/config.js";

let _db: Database | null = null;

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null;
}

export function getDb(): Database {
  if (_db) {
    return _db;
  }

  const config = getConfig();
  const dbPath = config.DB_PATH;
  const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "migrations");

  _db = new Database(dbPath);

  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA cache_size = -32000");
  _db.exec("PRAGMA mmap_size = 268435456");
  _db.exec("PRAGMA synchronous = NORMAL");
  // Defense in depth: SQLite-recommended defaults for webapps. These must be
  // set on every connection (foreign_keys is per-connection, not persistent).
  _db.exec("PRAGMA busy_timeout = 5000");
  _db.exec("PRAGMA foreign_keys = ON");

  // Create migrations table
  _db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Get applied migrations
  const applied = new Set<string>();
  const rows = _db.prepare("SELECT name FROM _migrations").all();
  if (rows && Array.isArray(rows)) {
    for (const row of rows) {
      if (isRecord(row) && "name" in row) {
        const nameVal = row.name;
        if (typeof nameVal === "string") {
          applied.add(nameVal);
        }
      }
    }
  }

  // Apply pending migrations
  if (existsSync(migrationsDir)) {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      if (applied.has(file)) {
        continue;
      }
      const sql = readFileSync(join(migrationsDir, file), "utf-8");
      try {
        _db.exec("BEGIN TRANSACTION");
        _db.exec(sql);
        _db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
        _db.exec("COMMIT");
      } catch (e) {
        _db.exec("ROLLBACK");
        console.error(`[MIGRATION FAILED] ${file}:`, e);
        throw e;
      }
    }
  }

  return _db;
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
