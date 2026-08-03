import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebAppUser {
  id: number;
  first_name: string;
  username?: string;
  /**
   * Chat ID from `initData.chat.id`, if present.
   * - When set: the WebApp was launched from this chat (via chat button).
   *   Routes can enforce chat_id match against this to prevent cross-chat data leaks.
   * - When null: the WebApp was launched from a menu button / direct link.
   *   Routes must enforce their own chat scope (allow-list or user_chats membership).
   */
  chat_id: number | null;
}

// Safe decode that won't throw on malformed escapes.
function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function parseQueryString(query: string): Record<string, string> {
  const params: Record<string, string> = {};
  const pairs = query.split("&");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const key = safeDecode(pair.slice(0, idx));
    const val = safeDecode(pair.slice(idx + 1));
    params[key] = val;
  }
  return params;
}

// Per Telegram reference (Python sample in docs):
//   data_check_string = "\n".join(sorted(f"{k}={v}" for k,v in data.items() if k != "hash"))
// where `data` is the URL-decoded query dict. Keys/values are already decoded.
function buildDataCheckString(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => k !== "hash")
    .sort((a, b) => a.localeCompare(b))
    .map((k) => `${k}=${params[k]}`)
    .join("\n");
}

export function validateInitData(initData: string, botToken: string): WebAppUser | null {
  if (!initData || typeof initData !== "string") return null;

  const params = parseQueryString(initData);
  const hash = params.hash;
  if (!hash) return null;

  // Replay protection: Telegram signs auth_date; reject stale initData (>1h old).
  // 3600s window per Telegram recommendation. Configurable via env if needed.
  const rawAuthDate = params.auth_date;
  if (!rawAuthDate) return null;
  const authDate = parseInt(rawAuthDate, 10);
  if (!Number.isFinite(authDate)) return null;
  const ageSec = Math.floor(Date.now() / 1000) - authDate;
  if (ageSec < -60 || ageSec > 3600) return null; // allow 60s clock skew

  const dataCheckString = buildDataCheckString(params);
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculatedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  // Constant-time compare to avoid timing oracle.
  const calcBuf = Buffer.from(calculatedHash, "hex");
  const hashBuf = Buffer.from(hash, "hex");
  if (calcBuf.length !== hashBuf.length || !timingSafeEqual(calcBuf, hashBuf)) {
    return null;
  }

  const userStr = params.user;
  if (!userStr) return null;

  // Telegram includes `chat` field when WebApp is launched from a chat button.
  // Format: `chat=%7B%22id%22%3A-1001108346327%2C%22type%22%3A%22supergroup%22%7D`
  // We extract it so routes can enforce chat_id consistency (defense against
  // replayed initData being used to access other chats the bot is in).
  let chatId: number | null = null;
  const chatStr = params.chat;
  if (chatStr) {
    try {
      const chatObj = JSON.parse(chatStr);
      if (
        typeof chatObj === "object" &&
        chatObj !== null &&
        typeof chatObj.id === "number"
      ) {
        chatId = chatObj.id;
      }
    } catch {
      // Malformed chat field — leave as null, route will reject if it requires chat scope.
    }
  }

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
        chat_id: chatId,
      };
    }
    return null;
  } catch {
    return null;
  }
}
