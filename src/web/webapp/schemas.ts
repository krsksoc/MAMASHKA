import { z } from "zod";

export const voteSchema = z.object({
  target_user_id: z.number().int().positive(),
  choice: z.enum(["friend", "foe"]),
});

export type VoteInput = z.infer<typeof voteSchema>;

export const anonSendSchema = z.object({
  text: z.string().min(1).max(1000),
});

export type AnonSendInput = z.infer<typeof anonSendSchema>;
