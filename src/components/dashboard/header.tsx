"use client";

import { Menu, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { HelpButton } from "@/components/ai-assistant/help-button";

export type DashboardHeaderProps = {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  fullName: string | null;
  role: string | null;
  orgName: string;
};

export function DashboardHeader({
  isSidebarOpen,
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
    <header className="flex h-16 shrink-0 items-center justify-between border-b px-6">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="h-8 w-8"
          aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          {isSidebarOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </Button>
        <p className="text-sm text-muted-foreground">{orgName}</p>
      </div>
      <div className="flex items-center gap-3">
        <HelpButton />
        <div className="text-right">
          <p className="text-sm font-medium">{fullName ?? "User"}</p>
          <p className="text-xs capitalize text-muted-foreground">
            {role ?? "viewer"}
          </p>
        </div>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
