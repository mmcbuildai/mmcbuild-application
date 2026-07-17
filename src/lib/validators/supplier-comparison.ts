import { z } from "zod";
import { MAX_SUPPLIERS_PER_COMPONENT } from "@/lib/quote/supplier-comparison";

// SCRUM-172 — input validation for the multi-supplier comparison request. Per
// the project convention, all Server Action inputs are validated with a schema
// from this directory (never inline).
export const requestSupplierComparisonSchema = z.object({
  projectId: z.string().uuid(),
  technologyCategory: z.string().min(1).max(64),
  productIds: z
    .array(z.string().uuid())
    .min(1, "Select at least one supplier")
    .max(
      MAX_SUPPLIERS_PER_COMPONENT,
      `Select at most ${MAX_SUPPLIERS_PER_COMPONENT} suppliers`,
    ),
  region: z.string().min(2).max(8).optional(),
});

export type RequestSupplierComparisonInput = z.infer<
  typeof requestSupplierComparisonSchema
>;
