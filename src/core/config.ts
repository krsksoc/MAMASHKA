import { z } from "zod";

const configSchema = z.object({
  // Telegram
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  ADMIN_IDS: z.string().default(""),

  // LLM providers
  OPENAI_API_KEY: z.string().default(""),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  ANTHROPIC_API_KEY: z.string().default(""),
  ANTHROPIC_MODEL: z.string().default("claude-sonnet-4-20250514"),
  OPENROUTER_API_KEY: z.string().default(""),
  OPENROUTER_MODEL: z.string().default("mistralai/mixtral-8x7b-instruct"),
  OLLAMA_BASE_URL: z.string().default("http://localhost:11434"),
  OLLAMA_MODEL: z.string().default("llama3"),

  // Server
  PORT: z.string().default("3000"),
  ADMIN_SECRET: z.string().default(""),

  // Database
  DB_PATH: z.string().default("data.db"),

  // Rate limiting
  RATE_LIMIT_PER_MINUTE: z.string().default("10"),
});

export type Config = z.infer<typeof configSchema>;

function parseEnv(): Config {
  const env = process.env;
  let botToken = env["BOT_TOKEN"] ?? "";
  if (!botToken && env["BOT_TOKEN_FILE"]) {
    try {
      botToken = Bun.file(env["BOT_TOKEN_FILE"]).text().trim();
    } catch {
      // ignore
    }
  }
  let adminSecret = env["ADMIN_SECRET"] ?? "";
  if (!adminSecret && env["ADMIN_SECRET_FILE"]) {
    try {
      adminSecret = Bun.file(env["ADMIN_SECRET_FILE"]).text().trim();
    } catch {
      // ignore
    }
  }
  const raw = {
    BOT_TOKEN: botToken,
    ADMIN_IDS: env["ADMIN_IDS"] ?? "",
    OPENAI_API_KEY: env["OPENAI_API_KEY"] ?? "",
    OPENAI_MODEL: env["OPENAI_MODEL"] ?? "gpt-4o-mini",
    ANTHROPIC_API_KEY: env["ANTHROPIC_API_KEY"] ?? "",
    ANTHROPIC_MODEL: env["ANTHROPIC_MODEL"] ?? "claude-sonnet-4-20250514",
    OPENROUTER_API_KEY: env["OPENROUTER_API_KEY"] ?? "",
    OPENROUTER_MODEL: env["OPENROUTER_MODEL"] ?? "mistralai/mixtral-8x7b-instruct",
    OLLAMA_BASE_URL: env["OLLAMA_BASE_URL"] ?? "http://localhost:11434",
    OLLAMA_MODEL: env["OLLAMA_MODEL"] ?? "llama3",
    PORT: env["PORT"] ?? "3000",
    ADMIN_SECRET: adminSecret,
    DB_PATH: env["DB_PATH"] ?? "data.db",
    RATE_LIMIT_PER_MINUTE: env["RATE_LIMIT_PER_MINUTE"] ?? "10",
  };

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    throw new Error(`Configuration validation failed:\n${errors}`);
  }

  return result.data;
}

let _config: Config | null = null;

export function getConfig(): Config {
  if (!_config) {
    _config = parseEnv();
  }
  return _config;
}

export function getAdminIds(config: Config): number[] {
  if (!config.ADMIN_IDS.trim()) {
    return [];
  }
  return config.ADMIN_IDS.split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map(Number)
    .filter((n) => Number.isFinite(n) && n > 0);
}
