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

/**
 * Re-exported so the sidebar's existing import keeps working.
 *
 * ⚠️ This was a SECOND declaration of the same number — `export const
 * TRIAL_RUN_LIMIT = 10` here, and the same line in `lib/stripe/plans`. The
 * sidebar read this one; the terms and the billing gate read the other. They
 * happened to agree, and nothing anywhere would have said so on the day they
 * stopped.
 */
export { TRIAL_RUN_LIMIT } from "@/lib/legal/commercial-facts";

// Every tier except Enterprise (and the always-unlimited custom case) has a
// finite monthly run cap — trial, Essential, and Professional are all limited.
export function isRunLimited(tier: string | null | undefined): boolean {
  return tier !== "enterprise";
}

export function isRunLimitedModule(moduleId: ModuleId): boolean {
  return RUN_LIMITED_MODULES.includes(moduleId);
}
