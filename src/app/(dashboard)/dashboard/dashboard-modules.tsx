"use client";

import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
  Clock,
  Plus,
  Rocket,
  FolderKanban,
  ShieldCheck,
  Hammer,
  Calculator,
  Users,
  GraduationCap,
  Lock,
} from "lucide-react";
import { MODULES, ALL_MODULE_IDS, type ModuleId } from "@/lib/stripe/plans";
import type { SubscriptionStatus } from "@/lib/stripe/subscription";

const WORKFLOW_STEPS = [
  { num: 1, label: "Build", desc: "Design optimisation", color: "teal" },
  { num: 2, label: "Comply", desc: "NCC compliance check", color: "blue" },
  { num: 3, label: "Quote", desc: "Cost estimation", color: "violet" },
  { num: 4, label: "Directory", desc: "Find MMC trades", color: "amber" },
  { num: 5, label: "Training", desc: "Upskill your team", color: "indigo" },
];

const MODULE_ICONS: Record<ModuleId, typeof ShieldCheck> = {
  comply: ShieldCheck,
  build: Hammer,
  quote: Calculator,
  direct: Users,
  train: GraduationCap,
};

const MODULE_GRADIENTS: Record<ModuleId, string> = {
  comply: "from-blue-500 to-blue-600",
  build: "from-teal-500 to-teal-600",
  quote: "from-violet-500 to-violet-600",
  direct: "from-amber-500 to-amber-600",
  train: "from-indigo-500 to-indigo-600",
};

export function DashboardModules({
  status,
  hasProjects,
}: {
  status: SubscriptionStatus;
  hasProjects: boolean;
}) {
  const isTrial = status.tier === "trial";
  const isExpired = status.tier === "expired";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Start a project — every MMC module lives inside it
        </p>
      </div>

      {/* Onboarding — first-login with no projects */}
      {!hasProjects && (
        <div className="rounded-xl border-2 border-dashed border-teal-300 bg-gradient-to-br from-teal-50 to-blue-50 p-6">
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-teal-100 p-3">
              <Rocket className="h-6 w-6 text-teal-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-teal-900">
                Welcome to MMC Build
              </h2>
              <p className="text-sm text-teal-700 mt-1">
                Get started by creating your first project. The platform guides
                you through a 5-step workflow:
              </p>

              {/* Workflow sequence */}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {WORKFLOW_STEPS.map((step, i) => (
                  <div key={step.num} className="flex items-center gap-2">
                    {i > 0 && (
                      <ArrowRight className="h-3.5 w-3.5 text-teal-400" />
                    )}
                    <div className="flex items-center gap-1.5 rounded-full border border-teal-200 bg-white/80 px-3 py-1">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-teal-600 text-[10px] font-bold text-white">
                        {step.num}
                      </span>
                      <span className="text-xs font-medium text-teal-800">
                        {step.label}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <Link
                href="/projects"
                className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-teal-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
              >
                <Plus className="h-4 w-4" />
                Start Here — Create Your First Project
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Trial / Status Banner */}
      {isTrial && status.daysRemaining !== null && (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-blue-100 p-2">
                <Sparkles className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-blue-900">
                  Free Trial — All Modules Unlocked
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  {status.daysRemaining} days remaining &middot;{" "}
                  {status.usageCount} of {status.usageLimit} compliance runs
                  used
                </p>
                <p className="text-xs text-blue-600 mt-2">
                  After your trial, subscribe to individual modules to keep
                  access. Everyone keeps MMC Comply as the base module.
                </p>
              </div>
            </div>
            <Link
              href="/billing"
              className="shrink-0 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              View Plans
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {isExpired && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-red-100 p-2">
                <Clock className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-red-900">Trial Expired</h3>
                <p className="text-sm text-red-700 mt-1">
                  Subscribe to modules to continue using MMC Build. Start with
                  Comply and add more as you need them.
                </p>
              </div>
            </div>
            <Link
              href="/billing"
              className="shrink-0 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
            >
              Subscribe Now
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Primary action — a single Projects entry point. Leads the page so
          users know to start with a project; every module opens from inside
          one. The module grid below stays locked until a project exists. */}
      {hasProjects && (
        <div className="rounded-xl border bg-gradient-to-br from-teal-50 to-blue-50 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-gradient-to-br from-teal-500 to-teal-600 p-3">
                <FolderKanban className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  Your Projects
                </h2>
                <p className="mt-0.5 text-sm text-zinc-600">
                  Create or open a project — Comply, Build, Quote and the rest
                  of the modules all run inside a project.
                </p>
              </div>
            </div>
            <Link
              href="/projects"
              className="inline-flex min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg bg-teal-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-teal-700 transition-colors"
            >
              Start Here
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}

      {/* Module grid — the five MMC modules, always shown so users see what
          they're working towards. Locked (greyed, non-actionable) until a
          project exists; they unlock the moment one is created — the visible
          cue that "start with a project" was the right first step. Each
          module opens from inside a project, so a locked card routes to
          /projects rather than dead-ending. */}
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Modules
          </h2>
          {!hasProjects && (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
              <Lock className="h-3 w-3" />
              Create a project to unlock
            </span>
          )}
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ALL_MODULE_IDS.map((id) => {
            const mod = MODULES[id];
            const Icon = MODULE_ICONS[id];
            const cardBody = (
              <>
                <div className="flex items-start justify-between">
                  <div
                    className={`inline-flex rounded-xl p-3 ${
                      hasProjects
                        ? `bg-gradient-to-br ${MODULE_GRADIENTS[id]}`
                        : "bg-slate-200"
                    }`}
                  >
                    <Icon
                      className={`h-6 w-6 ${
                        hasProjects ? "text-white" : "text-slate-400"
                      }`}
                    />
                  </div>
                  {hasProjects ? (
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Lock className="h-4 w-4 text-slate-400" />
                  )}
                </div>
                <div className="mt-3">
                  <h3 className="font-semibold text-zinc-900">{mod.name}</h3>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {mod.tagline}
                  </p>
                </div>
              </>
            );
            const base =
              "block rounded-xl border p-5 transition-all";
            return hasProjects ? (
              <Link
                key={id}
                href={mod.href}
                className={`${base} bg-card hover:border-teal-400 hover:shadow-sm`}
              >
                {cardBody}
              </Link>
            ) : (
              <Link
                key={id}
                href="/projects"
                aria-label={`${mod.name} — create a project to unlock`}
                className={`${base} border-dashed bg-slate-50 opacity-70 hover:opacity-100`}
              >
                {cardBody}
              </Link>
            );
          })}
        </div>
      </div>

      {/* Bundle upsell */}
      {!isExpired && status.activeModules.length < 5 && (
        <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-slate-100 p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold">Get all 5 modules for $375/mo</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Save vs subscribing individually. Full platform access with
                compliance, design, costing, directory, and training.
              </p>
            </div>
            <Link
              href="/billing"
              className="shrink-0 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              View All Plans
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
