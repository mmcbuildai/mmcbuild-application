"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar } from "./sidebar";
import { DashboardHeader } from "./header";
import { cn } from "@/lib/utils";

export type DashboardShellProps = {
  children: React.ReactNode;
  tier: string | null;
  runCount: number;
  fullName: string | null;
  role: string | null;
  orgName: string;
};

const MOBILE_QUERY = "(max-width: 767px)";

export function DashboardShell({
  children,
  tier,
  runCount,
  fullName,
  role,
  orgName,
}: DashboardShellProps) {
  // Two independent states so default-shown-on-desktop and default-hidden-on-mobile
  // can coexist without a paint flash. Toggle picks the right one per viewport.
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const pathname = usePathname();

  const toggleSidebar = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia(MOBILE_QUERY).matches) {
      setMobileOpen((prev) => !prev);
    } else {
      setDesktopCollapsed((prev) => !prev);
    }
  }, []);

  // Auto-close the mobile drawer on navigation so taps inside it don't leave
  // the overlay covering the page the user just navigated to.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex h-dvh overflow-hidden">
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={cn(
          "fixed inset-y-0 left-0 z-40 transition-transform duration-300 md:relative md:z-0 md:translate-x-0 md:transition-none",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <Sidebar
          isOpen={mobileOpen || !desktopCollapsed}
          tier={tier}
          runCount={runCount}
          role={role}
        />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <DashboardHeader
          mobileOpen={mobileOpen}
          desktopCollapsed={desktopCollapsed}
          onToggleSidebar={toggleSidebar}
          fullName={fullName}
          role={role}
          orgName={orgName}
        />
        <main className="flex-1 overflow-y-auto px-4 pt-4 pb-24 sm:px-6 sm:pt-6">
          {children}
        </main>
      </div>
    </div>
  );
}
