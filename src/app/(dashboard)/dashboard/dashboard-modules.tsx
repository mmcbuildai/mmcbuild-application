"use client";

import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
  Clock,
  Plus,
  Rocket,
  FolderKanban,
} from "lucide-react";
import type { SubscriptionStatus } from "@/lib/stripe/subscription";

const WORKFLOW_STEPS = [
  { num: 1, label: "Build", desc: "Design optimisation", color: "teal" },
  { num: 2, label: "Comply", desc: "NCC compliance check", color: "blue" },
  { num: 3, label: "Quote", desc: "Cost estimation", color: "violet" },
  { num: 4, label: "Directory", desc: "Find MMC trades", color: "amber" },
  { num: 5, label: "Training", desc: "Upskill your team", color: "indigo" },
];

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

      {/* Primary action — a single Projects entry point. Replaces the old
          5-module card grid: testers were confused by a wall of module
          buttons when every module actually opens from inside a project.
          One clear "Start Here" → /projects funnels them the right way. */}
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
