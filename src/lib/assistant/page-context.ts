type PageDescription = {
  module: string;
  summary: string;
};

const STATIC_ROUTES: Record<string, PageDescription> = {
  "/dashboard": {
    module: "Dashboard",
    summary: "Overview of the user's projects, recent activity, and shortcuts to each module.",
  },
  "/comply": {
    module: "MMC Comply",
    summary: "NCC compliance checker. Users upload building plans (PDF) and the AI runs an NCC compliance pass with cited clauses, confidence scores, and remediation suggestions.",
  },
  "/build": {
    module: "MMC Build",
    summary: "Design optimisation. Users see suggested design improvements, a 3D plan viewer, and can decide whether to accept each suggestion. Decisions feed forward into Quote.",
  },
  "/quote": {
    module: "MMC Quote",
    summary: "Cost estimation. Generates an itemised quote from the project plan and selected materials/systems, using the supplier knowledge base.",
  },
  "/direct": {
    module: "MMC Direct",
    summary: "Trade and consultant directory. Users browse and contact trades; admins manage the directory.",
  },
  "/train": {
    module: "MMC Train",
    summary: "Self-paced training modules with progress tracking.",
  },
  "/billing": {
    module: "Billing",
    summary: "Stripe-backed subscription management. Currently a 60-day free trial then paid plans.",
  },
  "/settings": {
    module: "Settings",
    summary: "Organisation, team, and user preferences.",
  },
  "/projects": {
    module: "Projects",
    summary: "List of the org's projects. Each project links into Comply, Build, Quote, and Direct.",
  },
};

export function describePage(pathname: string | undefined): PageDescription | null {
  if (!pathname) return null;
  const path = pathname.split("?")[0].replace(/\/+$/, "") || "/";

  if (STATIC_ROUTES[path]) return STATIC_ROUTES[path];

  for (const [prefix, desc] of Object.entries(STATIC_ROUTES)) {
    if (prefix !== "/" && path.startsWith(prefix + "/")) {
      if (prefix === "/projects" && /^\/projects\/[^/]+/.test(path)) {
        return {
          module: "Project workspace",
          summary: "A single project's workspace. Sub-pages: Overview, Documents, Questionnaire, Comply, Build, Quote, Direct.",
        };
      }
      return desc;
    }
  }

  return null;
}
