import type { ModuleId } from "@/lib/stripe/plans";

// Persona labels are retained for potential analytics tagging during beta.
// They no longer drive access — every authenticated user sees every module.
export type UserPersona =
  | "builder"
  | "developer"
  | "architect_bd"
  | "design_and_build"
  | "consultant"
  | "trade"
  | "admin";

export type SubscriptionTier = "trial" | "pro" | "enterprise";

export const PERSONA_LABELS: Record<UserPersona, string> = {
  builder: "Builder",
  developer: "Property Developer",
  architect_bd: "Architect / Building Designer",
  design_and_build: "Design & Build",
  consultant: "Consultant",
  trade: "Trade",
  admin: "Admin",
};

export const PERSONA_DESCRIPTIONS: Record<UserPersona, string> = {
  builder: "Residential builders managing compliance, costs, and trades",
  developer: "Property developers overseeing multiple projects",
  architect_bd: "Architects and building designers creating compliant designs",
  design_and_build: "Design and build firms handling end-to-end delivery",
  consultant: "Certifiers, surveyors, planners, and engineers",
  trade: "Trade contractors and subcontractors",
  admin: "Platform administrator",
};

// Modules that consume analysis runs (subject to trial limits).
// Tier — not persona — controls run limits.
export const RUN_LIMITED_MODULES: ModuleId[] = ["comply", "build", "quote"];

export const TRIAL_RUN_LIMIT = 10;

export function isRunLimited(tier: string | null | undefined): boolean {
  return !tier || tier === "trial";
}

export function isRunLimitedModule(moduleId: ModuleId): boolean {
  return RUN_LIMITED_MODULES.includes(moduleId);
}
