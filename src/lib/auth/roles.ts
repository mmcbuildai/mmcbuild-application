import type { UserRole } from "@/lib/supabase/types";

/** Numeric hierarchy — higher = more privileged */
export const ROLE_HIERARCHY: Record<UserRole, number> = {
  owner: 7,
  admin: 6,
  project_manager: 5,
  architect: 4,
  builder: 3,
  trade: 2,
  viewer: 1,
};

export const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  admin: "Admin",
  project_manager: "Project Manager",
  architect: "Architect",
  builder: "Builder",
  trade: "Trade",
  viewer: "Viewer",
};

export const ROLE_COLORS: Record<UserRole, string> = {
  owner: "bg-purple-100 text-purple-800",
  admin: "bg-blue-100 text-blue-800",
  project_manager: "bg-indigo-100 text-indigo-800",
  architect: "bg-green-100 text-green-800",
  builder: "bg-orange-100 text-orange-800",
  trade: "bg-yellow-100 text-yellow-800",
  viewer: "bg-gray-100 text-gray-800",
};

/** All roles that may appear in a role selector (excludes owner — owner is assigned, not selected) */
export const ASSIGNABLE_ROLES: UserRole[] = [
  "admin",
  "project_manager",
  "architect",
  "builder",
  "trade",
  "viewer",
];

/** Can the actor manage (invite/remove/change role of) org members? */
export function canManageMembers(role: string): boolean {
  return role === "owner" || role === "admin";
}

/** Can the actor create/edit/delete projects? */
export function canManageProjects(role: string): boolean {
  const level = ROLE_HIERARCHY[role as UserRole] ?? 0;
  return level >= ROLE_HIERARCHY.project_manager;
}

/**
 * Can `actorRole` assign `targetRole` to another user?
 * Rule: you can only assign roles strictly below your own level.
 * Owners can assign any role including admin.
 */
export function canAssignRole(actorRole: string, targetRole: string): boolean {
  const actorLevel = ROLE_HIERARCHY[actorRole as UserRole] ?? 0;
  const targetLevel = ROLE_HIERARCHY[targetRole as UserRole] ?? 0;
  return actorLevel > targetLevel;
}
