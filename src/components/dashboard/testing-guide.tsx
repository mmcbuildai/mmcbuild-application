"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ShieldCheck,
  Hammer,
  Calculator,
  Users,
  GraduationCap,
  CreditCard,
  Settings,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  Circle,
  FlaskConical,
  X,
} from "lucide-react";

const testSteps = [
  {
    module: "1. Create a Project",
    icon: Settings,
    href: "/projects",
    color: "text-slate-600",
    steps: [
      'Click "New Project" and enter a project name and address',
      "This project will be used across Comply, Build, and Quote",
    ],
  },
  {
    module: "2. MMC Comply — Compliance Check",
    icon: ShieldCheck,
    href: "/comply",
    color: "text-cyan-500",
    steps: [
      "Open your project and go to the Comply tab",
      "Upload a building plan PDF (drag and drop or click to browse)",
      "Complete the guided questionnaire — building class, climate zone, site conditions",
      'Click "Run Compliance Check" and wait for the AI analysis (~1-2 minutes)',
      "Review findings: severity ratings, NCC citations, confidence scores",
      "Try the thumbs up/down feedback on individual findings",
      "Export the compliance report as PDF",
    ],
  },
  {
    module: "3. MMC Build — Design Optimisation",
    icon: Hammer,
    href: "/build",
    color: "text-teal-500",
    steps: [
      "From your project, run the design optimisation",
      "Review MMC-specific suggestions (modular sections, prefab, CLT alternatives)",
      "Explore the 3D plan viewer",
      "Check the before/after design comparison",
    ],
  },
  {
    module: "4. MMC Quote — Cost Estimation",
    icon: Calculator,
    href: "/quote",
    color: "text-violet-500",
    steps: [
      "From your project, run the cost estimation",
      "Review the traditional vs MMC cost comparison",
      "Check line-item breakdown and regional adjustments",
      "Try the holding cost calculator",
    ],
  },
  {
    module: "5. MMC Direct — Trade Directory",
    icon: Users,
    href: "/direct",
    color: "text-amber-500",
    steps: [
      "Browse the directory — try searching by trade type, region, or rating",
      "View a professional profile",
      "Register a test professional profile",
      "Leave a review and send a test enquiry",
    ],
  },
  {
    module: "6. MMC Train — Learning",
    icon: GraduationCap,
    href: "/train",
    color: "text-purple-500",
    steps: [
      "Browse the course catalogue",
      "Enrol in a course and open a lesson",
      "Complete a quiz and check your progress",
      "Verify that a certificate generates on course completion",
    ],
  },
  {
    module: "7. Billing & Settings",
    icon: CreditCard,
    href: "/billing",
    color: "text-emerald-500",
    steps: [
      "Visit the Billing page to see the plan cards and usage tracking",
      "Check Settings: organisation details, knowledge base, AI performance dashboard",
      "Note: your account has full access — no trial limits apply",
    ],
  },
];

export function TestingGuide() {
  const [expanded, setExpanded] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});

  if (dismissed) return null;

  const totalSteps = testSteps.reduce((sum, s) => sum + s.steps.length, 0);
  const completedCount = Object.values(completed).filter(Boolean).length;

  return (
    <div className="rounded-2xl border-2 border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-6 mb-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100">
            <FlaskConical className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Platform Testing Guide
            </h2>
            <p className="text-sm text-slate-600">
              Walk through each module to verify the full platform.{" "}
              <span className="font-medium text-emerald-600">
                {completedCount}/{totalSteps} steps completed
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
          >
            {expanded ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </button>
          <button
            onClick={() => setDismissed(true)}
            className="p-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
            title="Dismiss guide"
          >
            <X className="h-4 w-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-emerald-100 rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${totalSteps > 0 ? (completedCount / totalSteps) * 100 : 0}%` }}
        />
      </div>

      {expanded && (
        <div className="space-y-4">
          {testSteps.map((section) => (
            <div key={section.module} className="rounded-xl bg-white/80 border border-slate-200 p-4">
              <Link
                href={section.href}
                className="flex items-center gap-2 mb-3 hover:underline"
              >
                <section.icon className={`h-4 w-4 ${section.color}`} />
                <h3 className="font-semibold text-sm text-slate-900">
                  {section.module}
                </h3>
              </Link>
              <ul className="space-y-2">
                {section.steps.map((step, i) => {
                  const key = `${section.module}-${i}`;
                  const isDone = completed[key];
                  return (
                    <li key={key} className="flex items-start gap-2">
                      <button
                        onClick={() =>
                          setCompleted((prev) => ({
                            ...prev,
                            [key]: !prev[key],
                          }))
                        }
                        className="mt-0.5 shrink-0"
                      >
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Circle className="h-4 w-4 text-slate-300" />
                        )}
                      </button>
                      <span
                        className={`text-sm ${
                          isDone
                            ? "text-slate-400 line-through"
                            : "text-slate-700"
                        }`}
                      >
                        {step}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
            <h3 className="font-semibold text-sm text-amber-800 mb-2">
              Things to watch for during testing
            </h3>
            <ul className="space-y-1 text-sm text-amber-700">
              <li>- Does the compliance report match what a builder or certifier would need?</li>
              <li>- Are the design optimisation suggestions relevant to your MMC methods?</li>
              <li>- Does the cost comparison feel credible with reasonable line items?</li>
              <li>- Is the flow between modules (Comply → Build → Quote) intuitive?</li>
              <li>- Does anything feel confusing or missing from the user journey?</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
