"use client";

import { Menu, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/ai-assistant/help-button";
import { RunningJobsChip } from "./running-jobs-chip";
import { BetaPageFeedbackButton } from "@/components/beta/beta-page-feedback-button";

export type DashboardHeaderProps = {
  mobileOpen: boolean;
  desktopCollapsed: boolean;
  onToggleSidebar: () => void;
  fullName: string | null;
  role: string | null;
  orgName: string;
};

export function DashboardHeader({
  mobileOpen,
  desktopCollapsed,
  onToggleSidebar,
  fullName,
  role,
  orgName,
}: DashboardHeaderProps) {
  const initials =
    fullName
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "U";

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 sm:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="h-11 w-11 sm:h-9 sm:w-9"
          aria-label="Toggle sidebar"
        >
          {/* Mobile icon reflects drawer state; desktop icon reflects collapse state */}
          <span className="md:hidden">
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </span>
          <span className="hidden md:inline-flex">
            {desktopCollapsed ? <Menu className="h-5 w-5" /> : <X className="h-5 w-5" />}
          </span>
        </Button>
        <p className="truncate text-sm text-muted-foreground">{orgName}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        {/* Beta-only "Feedback on this page" — sits here in the header's action
            cluster (top-right empty space) so it can never cover the sidebar
            Sign Out button or the bottom-right SayFix / assistant controls. */}
        {role === "beta" && <BetaPageFeedbackButton />}
        <RunningJobsChip />
        <HelpButton />
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium">{fullName ?? "User"}</p>
          <p className="text-xs capitalize text-muted-foreground">
            {role ?? "viewer"}
          </p>
        </div>
        <Avatar className="h-9 w-9 sm:h-8 sm:w-8">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
