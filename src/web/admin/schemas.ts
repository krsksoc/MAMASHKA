import { z } from "zod";

export const createPromptSchema = z.object({
  slug: z.string().min(1),
  content: z.string().min(1),
});

export type CreatePromptInput = z.infer<typeof createPromptSchema>;

export const createModifierRuleSchema = z.object({
  modifierSlug: z.string().min(1),
  conditionType: z.enum(["time_range", "reputation_range", "flag", "custom"]),
  conditionValue: z.string().nullable(),
  priority: z.number().int(),
  compatibleTasks: z.array(z.string()).optional(),
});

export type CreateModifierRuleInput = z.infer<typeof createModifierRuleSchema>;

export const toggleModifierSchema = z.object({
  isActive: z.boolean(),
});

export type ToggleModifierInput = z.infer<typeof toggleModifierSchema>;