import { Database } from "bun:sqlite";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

type MigrationRow = { name: string };

function isMigrationRow(row: unknown): row is MigrationRow {
  return typeof row === "object" && row !== null && "name" in row && typeof (row as Record<string, unknown>)["name"] === "string";
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = join(__dirname, "..", "data.db");
const migrationsDir = join(__dirname, "..", "src", "data", "migrations");

const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    applied_at TEXT DEFAULT (datetime('now'))
  )
`);

const applied = new Set<string>();
const rows = db.prepare("SELECT name FROM _migrations").all();
if (rows && Array.isArray(rows)) {
  for (const row of rows) {
    if (isMigrationRow(row)) {
      applied.add(row.name);
    }
  }
}

if (!existsSync(migrationsDir)) {
  console.log("No migrations directory found.");
  process.exit(0);
}

const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

for (const file of files) {
  if (applied.has(file)) {
    continue;
  }

  console.log(`Applying migration: ${file}`);
  const sql = readFileSync(join(migrationsDir, file), "utf-8");
  db.exec(sql);
  db.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
  console.log(`  ✓ Applied`);
}

console.log("All migrations applied.");
db.close();
