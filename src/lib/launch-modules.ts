import type { ModuleId } from "@/lib/stripe/plans";

export const ALL_MODULES: readonly ModuleId[] = [
  "comply",
  "build",
  "quote",
  "direct",
  "train",
] as const;

// v1 launch scope (SCRUM-209 / ADR-007): Comply, Build and Quote are launched;
// Direct and Train ship behind a "coming soon" gate until their public launch.
// Owners/admins/beta roles bypass the gate (see canBypassLaunchGate), so
// operators still see every module. NEXT_PUBLIC_MODULES_LAUNCH_LIST overrides
// this default when set.
export const DEFAULT_LAUNCHED_MODULES: readonly ModuleId[] = [
  "comply",
  "build",
  "quote",
] as const;

function parseLaunchList(raw: string | undefined): readonly ModuleId[] | null {
  if (!raw) return null;
  const parsed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ModuleId => (ALL_MODULES as readonly string[]).includes(s));
  return parsed.length > 0 ? parsed : null;
}

export function getLaunchedModules(
  rawEnv: string | undefined = process.env.NEXT_PUBLIC_MODULES_LAUNCH_LIST,
): readonly ModuleId[] {
  return parseLaunchList(rawEnv) ?? DEFAULT_LAUNCHED_MODULES;
}

export function isModuleLaunched(
  moduleId: ModuleId,
  rawEnv?: string,
): boolean {
  return getLaunchedModules(rawEnv).includes(moduleId);
}

const BYPASS_ROLES: ReadonlySet<string> = new Set(["owner", "admin", "beta"]);

export function canBypassLaunchGate(role: string | null | undefined): boolean {
  return !!role && BYPASS_ROLES.has(role);
}

export function shouldShowComingSoon(
  moduleId: ModuleId,
  role: string | null | undefined,
  rawEnv?: string,
): boolean {
  if (isModuleLaunched(moduleId, rawEnv)) return false;
  return !canBypassLaunchGate(role);
}
