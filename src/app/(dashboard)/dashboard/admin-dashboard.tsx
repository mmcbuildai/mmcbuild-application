"use client";

import Link from "next/link";
import {
  Settings,
  BookOpen,
  Clock,
  Users,
  DollarSign,
  BarChart3,
  GraduationCap,
  CreditCard,
  ArrowRight,
  FolderOpen,
} from "lucide-react";

const ADMIN_SECTIONS = [
  {
    title: "Platform Configuration",
    cards: [
      {
        title: "Organisation & Team",
        description: "Manage team members, roles, invitations, and org details.",
        icon: Users,
        href: "/settings/organisation",
        color: "from-blue-500 to-blue-600",
      },
      {
        title: "Cost Rate Management",
        description: "Browse, edit, upload, and manage construction cost rates used by MMC Quote.",
        icon: DollarSign,
        href: "/settings/cost-rates",
        color: "from-violet-500 to-violet-600",
      },
      {
        title: "Knowledge Bases",
        description: "Manage NCC volumes, standards, and reference documents for AI compliance.",
        icon: BookOpen,
        href: "/settings/knowledge",
        color: "from-teal-500 to-teal-600",
      },
      {
        title: "Billing & Subscriptions",
        description: "View plans, usage, manage Stripe subscriptions, and payment methods.",
        icon: CreditCard,
        href: "/billing",
        color: "from-emerald-500 to-emerald-600",
      },
    ],
  },
  {
    title: "Operations",
    cards: [
      {
        title: "Directory Admin",
        description: "Review and approve trade directory listings for MMC Direct.",
        icon: Users,
        href: "/settings/directory-admin",
        color: "from-amber-500 to-amber-600",
      },
      {
        title: "Training Admin",
        description: "Create and manage training courses, lessons, and AI content generation.",
        icon: GraduationCap,
        href: "/train/admin",
        color: "from-indigo-500 to-indigo-600",
      },
      {
        title: "AI Performance",
        description: "Monitor AI usage, costs, latency, model performance, and feedback ratings.",
        icon: BarChart3,
        href: "/settings/ai-performance",
        color: "from-pink-500 to-pink-600",
      },
      {
        title: "R&D Tax Tracking",
        description: "Log R&D hours by stage and deliverable for tax incentive claims.",
        icon: Clock,
        href: "/settings/rd-tracking",
        color: "from-orange-500 to-orange-600",
      },
    ],
  },
  {
    title: "Content",
    cards: [
      {
        title: "All Projects",
        description: "View and manage all projects across the organisation.",
        icon: FolderOpen,
        href: "/projects",
        color: "from-slate-500 to-slate-600",
      },
      {
        title: "General Settings",
        description: "Additional settings and configuration options.",
        icon: Settings,
        href: "/settings",
        color: "from-slate-400 to-slate-500",
      },
    ],
  },
];

export function AdminDashboard() {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground">
          Platform configuration, operations, and monitoring
        </p>
      </div>

      {/* Sections */}
      {ADMIN_SECTIONS.map((section) => (
        <div key={section.title}>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            {section.title}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {section.cards.map((card) => (
              <Link
                key={card.href}
                href={card.href}
                className="group rounded-xl border bg-card p-5 shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex items-start justify-between mb-3">
                  <div
                    className={`inline-flex rounded-lg bg-gradient-to-br ${card.color} p-2.5`}
                  >
                    <card.icon className="h-5 w-5 text-white" />
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
                <h3 className="font-semibold text-sm">{card.title}</h3>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  {card.description}
                </p>
              </Link>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
