import {
  FileCheck,
  Wrench,
  Calculator,
  Users,
  GraduationCap,
  CreditCard,
  FolderOpen,
} from "lucide-react";

export const moduleThemes = {
  comply: {
    label: "MMC Comply",
    icon: FileCheck,
    accent: "text-cyan-400",
    accentBg: "bg-cyan-400",
    accentHover: "hover:bg-cyan-500",
    heroGradient: "bg-gradient-to-br from-[#0B1A3E] via-blue-800 to-blue-600",
    badgeLabel: "MMC Comply",
  },
  build: {
    label: "MMC Build",
    icon: Wrench,
    accent: "text-teal-400",
    accentBg: "bg-teal-400",
    accentHover: "hover:bg-teal-500",
    heroGradient: "bg-gradient-to-br from-[#042F2E] via-teal-700 to-teal-500",
    badgeLabel: "MMC Build",
  },
  quote: {
    label: "MMC Quote",
    icon: Calculator,
    accent: "text-violet-400",
    accentBg: "bg-violet-400",
    accentHover: "hover:bg-violet-500",
    heroGradient:
      "bg-gradient-to-br from-[#1E1038] via-violet-700 to-violet-500",
    badgeLabel: "MMC Quote",
  },
  direct: {
    label: "MMC Directory",
    icon: Users,
    accent: "text-amber-400",
    accentBg: "bg-amber-400",
    accentHover: "hover:bg-amber-500",
    heroGradient:
      "bg-gradient-to-br from-[#451A03] via-amber-700 to-amber-600",
    badgeLabel: "MMC Directory",
  },
  train: {
    label: "MMC Train",
    icon: GraduationCap,
    accent: "text-purple-400",
    accentBg: "bg-purple-400",
    accentHover: "hover:bg-purple-500",
    heroGradient:
      "bg-gradient-to-br from-[#0B1120] via-indigo-900 to-indigo-700",
    badgeLabel: "MMC Train",
  },
  billing: {
    label: "Billing",
    icon: CreditCard,
    accent: "text-emerald-400",
    accentBg: "bg-emerald-400",
    accentHover: "hover:bg-emerald-500",
    heroGradient:
      "bg-gradient-to-br from-[#022C22] via-emerald-800 to-emerald-600",
    badgeLabel: "Billing",
  },
  projects: {
    label: "Projects",
    icon: FolderOpen,
    accent: "text-sky-400",
    accentBg: "bg-sky-400",
    accentHover: "hover:bg-sky-500",
    heroGradient:
      "bg-gradient-to-br from-[#0C1E33] via-sky-800 to-sky-600",
    badgeLabel: "Projects",
  },
} as const;

export type ModuleKey = keyof typeof moduleThemes;
