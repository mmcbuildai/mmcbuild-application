"use client";

import { useEffect, useState, useTransition } from "react";
import { ChevronsUpDown, Check, Building2 } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  getUserMemberships,
  switchActiveOrg,
  type OrgMembership,
} from "@/app/(dashboard)/settings/organisation/actions";

/**
 * Multi-org switcher. Self-contained: fetches the user's memberships on mount and
 * renders nothing until they belong to more than one org (so it's invisible for
 * every single-org user today). See docs/plans/MULTI_ORG_MEMBERSHIP_PLAN.md.
 */
export function OrgSwitcher() {
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    getUserMemberships()
      .then(setMemberships)
      .catch(() => {});
  }, []);

  if (memberships.length <= 1) return null;

  const active = memberships.find((m) => m.active) ?? memberships[0];

  function handleSwitch(orgId: string) {
    if (orgId === active.orgId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const res = await switchActiveOrg(orgId);
      setOpen(false);
      if (!("error" in res)) router.refresh();
    });
  }

  return (
    <div className="relative px-2 py-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={isPending}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-sm text-white hover:bg-white/10 disabled:opacity-60"
      >
        <span className="flex items-center gap-2 truncate">
          <Building2 className="h-4 w-4 shrink-0 text-slate-400" />
          <span className="truncate">{active.name}</span>
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute left-2 right-2 z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-white/10 bg-slate-900 py-1 shadow-lg"
        >
          {memberships.map((m) => (
            <button
              key={m.orgId}
              type="button"
              role="option"
              aria-selected={m.active}
              onClick={() => handleSwitch(m.orgId)}
              className="flex min-h-11 w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm text-slate-200 hover:bg-white/10"
            >
              <span className="flex flex-col truncate">
                <span className="truncate">{m.name}</span>
                <span className="text-xs capitalize text-slate-500">{m.role}</span>
              </span>
              {m.active && <Check className="h-4 w-4 shrink-0 text-green-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
