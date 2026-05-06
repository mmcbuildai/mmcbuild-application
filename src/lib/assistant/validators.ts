import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(4000),
});

export const chatRequestSchema = z.object({
  messages: z.array(chatMessageSchema).min(1).max(20),
  pathname: z.string().min(1).max(500).optional(),
});

export type ChatMessageInput = z.infer<typeof chatMessageSchema>;
export type ChatRequestInput = z.infer<typeof chatRequestSchema>;
