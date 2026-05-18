"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type NavLink = { name: string; href: string; description?: string };

export type MobileMarketingNavProps = {
  solutions: NavLink[];
  links: NavLink[];
};

export function MobileMarketingNav({ solutions, links }: MobileMarketingNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Close drawer on navigation so the user lands on the new page unobscured.
  // Sheet stays open across pathname changes by default; we close it explicitly.
  const handleNavigate = () => setOpen(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 md:hidden"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full max-w-sm overflow-y-auto p-0">
        <SheetHeader className="border-b">
          <SheetTitle className="text-base">Menu</SheetTitle>
        </SheetHeader>
        <nav className="flex flex-col p-4">
          <p className="px-2 pt-2 pb-1 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Solutions
          </p>
          {solutions.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              onClick={handleNavigate}
              className="flex min-h-11 flex-col justify-center rounded-lg px-3 py-2 hover:bg-slate-50"
            >
              <span className="text-sm font-medium text-slate-900">{s.name}</span>
              {s.description && (
                <span className="text-xs text-slate-500">{s.description}</span>
              )}
            </Link>
          ))}
          <div className="my-3 border-t" />
          {links.map((link) => {
            const isActive =
              pathname === link.href ||
              (link.href !== "/" && pathname.startsWith(link.href));
            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={handleNavigate}
                className={
                  "flex min-h-11 items-center rounded-lg px-3 py-2 text-sm font-medium " +
                  (isActive
                    ? "bg-slate-100 text-slate-900"
                    : "text-slate-700 hover:bg-slate-50")
                }
              >
                {link.name}
              </Link>
            );
          })}
          <div className="mt-4 flex flex-col gap-2 border-t pt-4">
            <Link
              href="/login"
              onClick={handleNavigate}
              className="inline-flex min-h-11 items-center justify-center rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
              onClick={handleNavigate}
              className="inline-flex min-h-11 items-center justify-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white shadow hover:bg-blue-700"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
