import { z } from "zod";

// Плейсхолдер в промпте
export const placeholderSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  example: z.string().optional(),
});

// Таск-промпт
export const taskPromptSchema = z.object({
  slug: z.string().regex(/^task:/),
  content: z.string().min(10),
  required_vars: z.array(z.string()).default([]),
  description: z.string().default(""),
});

// Модификатор
export const modifierSchema = z.object({
  slug: z.string().regex(/^mod:/),
  content: z.string().min(1),
  priority: z.number().int().min(0).default(0),
});

// Контекст для подстановки
export const contextSchema = z.object({
  user_name: z.string().optional(),
  target_name: z.string().optional(),
  reputation: z.number().optional(),
  user_message: z.string().optional(),
  recent_messages: z.string().optional(),
  user_messages_sample: z.string().optional(),
  target_messages_sample: z.string().optional(),
  all_messages: z.string().optional(),
  date_range: z.string().optional(),
  chat_context: z.string().optional(),
  reply_to_text: z.string().optional(),
  reply_to_user: z.string().optional(),
});

export type Placeholder = z.infer<typeof placeholderSchema>;
export type TaskPrompt = z.infer<typeof taskPromptSchema>;
export type Modifier = z.infer<typeof modifierSchema>;
export type PromptContext = z.infer<typeof contextSchema>;
