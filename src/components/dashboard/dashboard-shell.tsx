"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { DashboardHeader } from "./header";

export type DashboardShellProps = {
  children: React.ReactNode;
  tier: string | null;
  runCount: number;
  fullName: string | null;
  role: string | null;
  orgName: string;
};

export function DashboardShell({
  children,
  tier,
  runCount,
  fullName,
  role,
  orgName,
}: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={
          sidebarOpen
            ? "fixed inset-y-0 left-0 z-40 md:relative md:z-0"
            : "hidden md:block"
        }
      >
        <Sidebar
          isOpen={sidebarOpen}
          tier={tier}
          runCount={runCount}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader
          isSidebarOpen={sidebarOpen}
          onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
          fullName={fullName}
          role={role}
          orgName={orgName}
        />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
