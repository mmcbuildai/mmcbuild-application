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
    accent: "text-brand-400",
    accentBg: "bg-brand-400",
    accentHover: "hover:bg-brand-500",
    heroGradient: "bg-gradient-to-br from-[#042F2E] via-brand-700 to-brand-500",
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
    label: "MMC Direct",
    icon: Users,
    accent: "text-amber-400",
    accentBg: "bg-amber-400",
    accentHover: "hover:bg-amber-500",
    heroGradient:
      "bg-gradient-to-br from-[#451A03] via-amber-700 to-amber-600",
    badgeLabel: "MMC Direct",
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
    accent: "text-brandgreen-400",
    accentBg: "bg-brandgreen-400",
    accentHover: "hover:bg-brandgreen-500",
    heroGradient:
      "bg-gradient-to-br from-[#022C22] via-brandgreen-800 to-brandgreen-600",
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
