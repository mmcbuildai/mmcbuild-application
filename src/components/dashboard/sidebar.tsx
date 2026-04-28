"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  FileCheck,
  Building2,
  FileText,
  Truck,
  GraduationCap,
  CreditCard,
  Settings,
  LogOut,
  Tag,
  LayoutDashboard,
  FolderOpen,
  BookOpen,
  ArrowUpRight,
  FlaskConical,
} from "lucide-react";
import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { isRunLimited, TRIAL_RUN_LIMIT } from "@/lib/persona-access";

const moduleNav: {
  name: string;
  href: string;
  icon: typeof FileCheck;
  color: string;
}[] = [
  { name: "MMC Comply", href: "/comply", icon: FileCheck, color: "bg-teal-700" },
  { name: "MMC Build", href: "/build", icon: Building2, color: "bg-teal-600" },
  { name: "MMC Quote", href: "/quote", icon: FileText, color: "bg-teal-500" },
  { name: "MMC Direct", href: "/direct", icon: Truck, color: "bg-cyan-700" },
  { name: "MMC Train", href: "/train", icon: GraduationCap, color: "bg-sky-700" },
];

const topNav = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Projects", href: "/projects", icon: FolderOpen },
  { name: "Beta Testing", href: "/beta", icon: FlaskConical },
];

const bottomNav = [
  { name: "Knowledge", href: "/settings/knowledge", icon: BookOpen },
  { name: "Billing", href: "/billing", icon: CreditCard, color: "bg-indigo-600" },
  { name: "Settings", href: "/settings", icon: Settings },
];

export type SidebarProps = {
  isOpen: boolean;
  tier: string | null;
  runCount: number;
};

export function Sidebar({ isOpen, tier, runCount }: SidebarProps) {
  const pathname = usePathname();

  const runLimited = isRunLimited(tier);
  const runPercentage = Math.min((runCount / TRIAL_RUN_LIMIT) * 100, 100);
  const runsRemaining = Math.max(TRIAL_RUN_LIMIT - runCount, 0);

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-slate-900 text-white transition-all duration-300 overflow-hidden",
        isOpen ? "w-64" : "w-0"
      )}
    >
      {/* Logo */}
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 font-bold text-sm text-white">
            M
          </div>
          <span className="text-lg font-bold text-white whitespace-nowrap">MMC Build</span>
        </Link>
      </div>

      {/* Top nav (Dashboard, Projects) */}
      <nav className="px-3 pt-2 space-y-0.5">
        {topNav.map((item) => {
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Divider */}
      <div className="mx-3 my-3 border-t border-white/10" />

      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
        <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Modules
        </p>
        {moduleNav.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
            >
              <div className={cn("flex h-5 w-5 items-center justify-center rounded", item.color)}>
                <item.icon className="h-3 w-3 text-white" />
              </div>
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="mt-auto">
        {/* Run limit indicator (trial users with usage) */}
        {runLimited && runCount > 0 && (
          <div className="mx-3 mb-3 rounded-lg bg-white/5 px-3 py-2.5">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
              <span>Analyses used</span>
              <span className="font-medium text-slate-300">
                {runCount} / {TRIAL_RUN_LIMIT}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-slate-700 overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  runsRemaining <= 2 ? "bg-amber-500" : "bg-teal-500"
                )}
                style={{ width: `${runPercentage}%` }}
              />
            </div>
            {runsRemaining === 0 && (
              <Link
                href="/billing"
                className="mt-2 flex items-center gap-1 text-xs text-teal-400 hover:text-teal-300"
              >
                Upgrade to Pro for unlimited
                <ArrowUpRight className="h-3 w-3" />
              </Link>
            )}
          </div>
        )}

        <div className="border-t border-white/10 px-3 py-2 space-y-0.5">
          {bottomNav.map((item) => {
            const isActive = pathname.startsWith(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap",
                  isActive
                    ? "bg-white/10 text-white"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                )}
              >
                {"color" in item && item.color ? (
                  <div className={cn("flex h-5 w-5 items-center justify-center rounded", item.color)}>
                    <item.icon className="h-3 w-3 text-white" />
                  </div>
                ) : (
                  <item.icon className="h-4 w-4 shrink-0" />
                )}
                {item.name}
              </Link>
            );
          })}
          <form action={signOut}>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 px-3 text-slate-400 hover:text-red-400 hover:bg-white/5"
              type="submit"
            >
              <LogOut className="h-4 w-4" />
              Sign Out
            </Button>
          </form>
        </div>

        {/* UAT design banner */}
        <div className="px-4 py-2 border-t border-white/10">
          <span className="flex items-center gap-1.5 text-xs text-slate-500">
            <Tag className="w-3 h-3" />
            Design v0.1 &middot; Karen Burns
          </span>
        </div>
      </div>
    </aside>
  );
}
