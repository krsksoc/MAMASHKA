// User from DB
export interface User {
  id: number;
  telegramId: number;
  chatId: number;
  username: string | null;
  displayName: string | null;
  firstSeenAt: string;
  lastMessageAt: string | null;
  isIgnored: boolean;
  messageCount: number;
}

// Message from DB
export interface Message {
  id: number;
  chatId: number;
  userId: number;
  telegramMessageId: number | null;
  text: string | null;
  hasSticker: boolean;
  stickerEmoji: string | null;
  replyToUserId: number | null;
  createdAt: string;
}

// Quote
export interface Quote {
  id: number;
  chatId: number;
  userId: number;
  text: string;
  savedByUserId: number | null;
  telegramMessageId: number | null;
  createdAt: string;
}

// ReputationEvent
export interface ReputationEvent {
  id: number;
  chatId: number;
  targetUserId: number;
  sourceUserId: number | null;
  delta: number;
  reason: string;
  createdAt: string;
}

// Vote
export interface Vote {
  id: number;
  chatId: number;
  type: string;
  targetUserId: number | null;
  initiatedBy: number;
  status: "active" | "passed" | "failed" | "expired";
  votesRequired: number;
  expiresAt: string;
  createdAt: string;
}

// VoteEntry
export interface VoteEntry {
  id: number;
  voteId: number;
  userId: number;
  choice: "yes" | "no";
  createdAt: string;
}

// AnonMessage
export interface AnonMessage {
  id: number;
  chatId: number;
  senderId: number;
  text: string;
  status: "pending" | "published" | "rejected";
  publishedAt: string | null;
  createdAt: string;
}

// DramaTracker
export interface DramaTracker {
  chatId: number;
  lastDramaAt: string | null;
  recordDays: number;
}

// Prompt
export interface Prompt {
  id: number;
  slug: string;
  content: string;
  version: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ModifierRule
export interface ModifierRule {
  id: number;
  modifierSlug: string;
  conditionType: "time_range" | "reputation_range" | "flag" | "custom";
  conditionValue: string | null;
  priority: number;
  compatibleTasks: string | null;
  isActive: boolean;
}

// LLM
export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMRequest {
  system: string;
  user: string;
}

export interface ReputationSummary {
  userId: number;
  totalDelta: number;
  friendCount: number;
  foeCount: number;
}
