"use client";

import { useState } from "react";
import { Shield, User } from "lucide-react";
import { DashboardModules } from "./dashboard-modules";
import { AdminDashboard } from "./admin-dashboard";
import type { SubscriptionStatus } from "@/lib/stripe/subscription";

interface DashboardShellProps {
  status: SubscriptionStatus;
  /**
   * Platform operator (email allowlist), NOT an org owner/admin role — see the
   * note in dashboard/page.tsx. Every self-signup is the owner of their own
   * org, so a role check here showed the Admin View toggle to every customer.
   */
  isOperator: boolean;
  hasProjects: boolean;
}

export function DashboardShell({ status, isOperator, hasProjects }: DashboardShellProps) {
  const [view, setView] = useState<"user" | "admin">("user");

  if (!isOperator) {
    return <DashboardModules status={status} hasProjects={hasProjects} />;
  }

  return (
    <div className="space-y-6">
      {/* View toggle */}
      <div className="flex items-center justify-between">
        <div />
        <div className="inline-flex rounded-lg border bg-muted p-1">
          <button
            onClick={() => setView("user")}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              view === "user"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <User className="h-4 w-4" />
            User View
          </button>
          <button
            onClick={() => setView("admin")}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              view === "admin"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Shield className="h-4 w-4" />
            Admin View
          </button>
        </div>
      </div>

      {/* Content */}
      {view === "user" ? (
        <DashboardModules status={status} hasProjects={hasProjects} />
      ) : (
        <AdminDashboard />
      )}
    </div>
  );
}
