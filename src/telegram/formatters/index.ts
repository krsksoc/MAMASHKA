export function formatBold(text: string): string {
  return `*${text}*`;
}

export function formatItalic(text: string): string {
  return `_${text}_`;
}

export function escapeMarkdown(text: string): string {
  return text.replace(/([_*[`~>#+=|{}.!()-])/g, "\\$1");
}

export function formatUserName(username: string | null, displayName: string | null): string {
  if (displayName) return formatBold(displayName);
  if (username) return `@${username}`;
  return "unknown";
}

export function formatReputation(delta: number): string {
  if (delta > 0) return `🟢 +${delta}`;
  if (delta < 0) return `🔴 ${delta}`;
  return `⚪ 0`;
}

export function formatRank(pos: number): string {
  const medals = ["🥇", "🥈", "🥉"];
  if (pos <= 3) return medals[pos - 1] ?? `#${pos}`;
  return `#${pos}`;
}