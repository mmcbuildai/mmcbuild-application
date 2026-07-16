"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/hooks/use-confirm";
import { UserPlus, Trash2, UserRound } from "lucide-react";
import {
  addProjectMember,
  removeProjectMember,
} from "@/app/(dashboard)/projects/actions";

interface Member {
  profile_id: string;
  name: string;
  email: string | null;
  role: string;
}

interface Assignable {
  profile_id: string;
  name: string;
  email: string | null;
}

/**
 * Assign subscribed org users to a project (SCRUM-51). Distinct from the
 * external "contributors" below — these are real app users on the org's
 * subscription.
 */
export function ProjectMembers({
  projectId,
  members,
  assignable,
}: {
  projectId: string;
  members: Member[];
  assignable: Assignable[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  function handleAdd() {
    if (!selected) return;
    setError(null);
    startTransition(async () => {
      const res = await addProjectMember(projectId, selected);
      if (res.error) {
        setError(res.error);
      } else {
        setSelected("");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-4">
      {dialog}
      <div>
        <h2 className="text-lg font-semibold">Team members</h2>
        <p className="text-sm text-muted-foreground">
          Assign people from your organisation to this project.
        </p>
      </div>

      {assignable.length > 0 && (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[220px] flex-1">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger>
                <SelectValue placeholder="Select a team member…" />
              </SelectTrigger>
              <SelectContent>
                {assignable.map((a) => (
                  <SelectItem key={a.profile_id} value={a.profile_id}>
                    {a.name}
                    {a.email ? ` (${a.email})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={!selected || isPending} size="sm">
            <UserPlus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {members.length === 0 ? (
        <div className="rounded-md border border-dashed p-6 text-center">
          <p className="text-sm text-muted-foreground">
            No team members assigned to this project yet.
          </p>
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {members.map((m) => (
            <li
              key={m.profile_id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                  <UserRound className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  {m.email && (
                    <p className="truncate text-xs text-muted-foreground">
                      {m.email}
                    </p>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive hover:text-destructive"
                disabled={isPending}
                onClick={async () => {
                  const ok = await confirm({
                    title: "Remove member?",
                    description: `Remove ${m.name} from this project?`,
                    confirmLabel: "Remove",
                    destructive: true,
                  });
                  if (!ok) return;
                  startTransition(async () => {
                    const res = await removeProjectMember(projectId, m.profile_id);
                    if (!res.error) router.refresh();
                  });
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
