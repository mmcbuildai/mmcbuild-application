import { z } from "zod";

export const registrationSchema = z.object({
  company_name: z.string().min(1, "Company name is required"),
  abn: z.string().optional(),
  trade_type: z.string().min(1, "Trade type is required"),
  headline: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  contact_name: z.string().max(120).optional(),
  // Phone + email are MANDATORY on a directory listing — buyers must be able to
  // reach the business (Dennis, 2026-06-25).
  phone: z.string().trim().min(5, "Phone number is required"),
  email: z.string().trim().min(1, "Email is required").email("Invalid email"),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  logo_url: z.string().optional(),
  regions: z.array(z.string()).min(1, "Select at least one region"),
  specialisations: z.array(z.string()).optional(),
  years_experience: z.number().int().min(0).max(100).optional(),
  licence_number: z.string().optional(),
});
export type RegistrationInput = z.infer<typeof registrationSchema>;

export const profileUpdateSchema = z.object({
  company_name: z.string().min(1, "Company name is required").optional(),
  abn: z.string().optional(),
  trade_type: z.string().optional(),
  headline: z.string().max(200).optional(),
  description: z.string().max(2000).optional(),
  contact_name: z.string().max(120).optional(),
  // Mandatory contact details — kept required on edit so a listing can never be
  // saved without a reachable phone + email (matches registrationSchema).
  phone: z.string().trim().min(5, "Phone number is required"),
  email: z.string().trim().min(1, "Email is required").email("Invalid email"),
  website: z.string().url("Invalid URL").optional().or(z.literal("")),
  logo_url: z.string().optional(),
  cover_image_url: z.string().optional(),
  regions: z.array(z.string()).min(1, "Select at least one region").optional(),
  years_experience: z.number().int().min(0).max(100).optional(),
  licence_number: z.string().optional(),
});
export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

export const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
export type ReviewInput = z.infer<typeof reviewSchema>;

export const enquirySchema = z.object({
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(1, "Message is required").max(2000),
  project_id: z.string().uuid().optional(),
});
export type EnquiryInput = z.infer<typeof enquirySchema>;

export const portfolioItemSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(1000).optional(),
  image_url: z.string().optional(),
  sort_order: z.number().int().min(0).optional(),
});
export type PortfolioItemInput = z.infer<typeof portfolioItemSchema>;

export const companyDocumentSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  file_url: z.string().min(1, "A file is required"),
  file_name: z.string().max(255).optional(),
});
export type CompanyDocumentInput = z.infer<typeof companyDocumentSchema>;
