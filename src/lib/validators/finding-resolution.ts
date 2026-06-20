import { z } from "zod";

// Builder-side resolution of a non-compliant finding (Comply Phase 2).
// Two resolve paths accept an optional note; the waiver path requires a reason.

export const resolveFindingSchema = z.object({
  findingId: z.string().trim().uuid("Invalid finding id"),
  type: z.enum(["updated_drawings", "evidence"]),
  note: z.string().trim().max(5000).optional().default(""),
});

export type ResolveFindingInput = z.infer<typeof resolveFindingSchema>;

export const waiveFindingSchema = z.object({
  findingId: z.string().trim().uuid("Invalid finding id"),
  // Waiver reason is mandatory — a waived non-compliant finding without a
  // recorded reason is a compliance-audit gap (REGULATED tier).
  reason: z.string().trim().min(1, "A waiver reason is required").max(5000),
});

export type WaiveFindingInput = z.infer<typeof waiveFindingSchema>;
