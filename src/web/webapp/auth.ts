import { createHmac } from "node:crypto";

export interface WebAppUser {
  id: number;
  first_name: string;
  username?: string;
}

export interface WebAppInitData {
  user: string;
  chat_instance?: string;
  start_param?: string;
  hash: string;
}

function parseQueryString(query: string): Record<string, string> {
  const params: Record<string, string> = {};
  const pairs = query.split("&");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = decodeURIComponent(pair.slice(0, idx));
    const val = decodeURIComponent(pair.slice(idx + 1));
    params[key] = val;
  }
  return params;
}

function sortedParams(params: Record<string, string>): string {
  const entries = Object.entries(params)
    .filter(([k]) => k !== "hash")
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.map(([k, v]) => `${k}=${v}`).join("\n");
}

export function validateInitData(initData: string, botToken: string): WebAppUser | null {
  const params = parseQueryString(initData);
  const hash = params.hash;
  if (!hash) return null;

  const dataCheckString = sortedParams(params);
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (calculatedHash !== hash) return null;

  const userStr = params.user;
  if (!userStr) return null;

  try {
    const parsed = JSON.parse(userStr);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof parsed.id === "number" &&
      typeof parsed.first_name === "string"
    ) {
      return {
        id: parsed.id,
        first_name: parsed.first_name,
        username: typeof parsed.username === "string" ? parsed.username : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}
