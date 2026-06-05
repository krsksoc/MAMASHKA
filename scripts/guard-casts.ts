import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (e.isFile() && e.name.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

const root = resolve("src");
const files = collectTsFiles(root);
let found = false;

for (const file of files) {
  const content = readFileSync(file, "utf-8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (typeof raw !== "string") {
      continue;
    }
    const line = raw;
    if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) {
      continue;
    }

    const asMatches = line.match(/(?<!\w) as (?!const\b)/g);
    if (asMatches) {
      console.error(`${file}:${i + 1}: forbidden 'as' cast: ${line.trim()}`);
      found = true;
    }

    const nnMatches = line.match(/\w!\./g) || line.match(/\w!\[/g);
    if (nnMatches) {
      console.error(`${file}:${i + 1}: forbidden non-null assertion '!': ${line.trim()}`);
      found = true;
    }
  }
}

if (found) {
  console.error("\nFound forbidden casts/assertions. Fix them or use zod/type guards.");
  process.exit(1);
}
console.log("guard:casts — clean");
