import { z } from "zod";

// 'signup' is written server-side when a user creates an account (the social-ad
// CTA destination), not submitted by a public form — but it shares the leads row
// + HubSpot sync shape, so it belongs in the same union. Kept in step with the
// leads_form_type_check constraint (migration 20260730120000).
export const leadFormTypes = [
  "contact",
  "waitlist",
  "trades-supplier",
  "signup",
] as const;
export type LeadFormType = (typeof leadFormTypes)[number];

export const leadSchema = z.object({
  formType: z.enum(leadFormTypes),
  firstName: z.string().trim().min(1, "First name is required").max(100),
  lastName: z.string().trim().max(100).optional().default(""),
  email: z.string().trim().toLowerCase().email("Invalid email"),
  phoneCountry: z.string().trim().max(8).optional().default(""),
  phone: z.string().trim().max(40).optional().default(""),
  company: z.string().trim().max(200).optional().default(""),
  role: z.string().trim().max(100).optional().default(""),
  interest: z.string().trim().max(100).optional().default(""),
  message: z.string().trim().max(5000).optional().default(""),
  sourcePage: z.string().trim().max(500).optional().default(""),
});

export type LeadInput = z.infer<typeof leadSchema>;
