"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useConfirm } from "@/hooks/use-confirm";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { DISCIPLINE_LABELS, type ContributorDiscipline } from "@/lib/ai/types";
import {
  updateOrgContributor,
  removeOrgContributor,
  type DirectoryEntry,
} from "./actions";

interface TeamDirectoryTableProps {
  entries: DirectoryEntry[];
}

function disciplineLabel(d: string): string {
  return (
    DISCIPLINE_LABELS[d as ContributorDiscipline] ??
    d.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

export function TeamDirectoryTable({ entries }: TeamDirectoryTableProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<DirectoryEntry | null>(null);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();
  const [filter, setFilter] = useState("");

  const filtered = filter.trim()
    ? entries.filter((e) =>
        [
          e.contact_name,
          e.contact_email ?? "",
          e.company_name ?? "",
          ...e.disciplines,
          ...e.project_names,
        ]
          .join(" ")
          .toLowerCase()
          .includes(filter.trim().toLowerCase()),
      )
    : entries;

  async function handleRemove(entry: DirectoryEntry) {
    const ok = await confirm({
      title: `Remove ${entry.contact_name}?`,
      description: `Remove this contributor from all ${entry.project_count} project(s) in your organisation. They can be added back per project. This cannot be undone.`,
      confirmLabel: "Remove from all projects",
      destructive: true,
    });
    if (!ok) return;

    setRemovingKey(entry.identityKey);
    const result = await removeOrgContributor(entry.identityKey);
    setRemovingKey(null);
    if (result.error) {
      alert(result.error);
      return;
    }
    router.refresh();
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No contributors added to any project yet. Add people on a project's
          Team tab and they'll show up here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {dialog}
      <Input
        placeholder="Search by name, email, company, discipline, or project..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="max-w-md"
      />

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Discipline(s)</TableHead>
              <TableHead className="text-right">Projects</TableHead>
              <TableHead className="w-[100px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((entry) => (
              <TableRow key={entry.identityKey}>
                <TableCell className="font-medium">{entry.contact_name}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {entry.contact_email ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {entry.contact_phone ?? "—"}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {entry.company_name ?? "—"}
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {entry.disciplines.map((d) => (
                      <Badge
                        key={d}
                        variant="secondary"
                        className="text-xs font-normal"
                      >
                        {disciplineLabel(d)}
                      </Badge>
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  <span title={entry.project_names.join(", ")}>
                    {entry.project_count}
                  </span>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditing(entry)}
                      title="Edit details across all projects"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleRemove(entry)}
                      disabled={removingKey === entry.identityKey}
                      title="Remove from all projects"
                    >
                      {removingKey === entry.identityKey ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          {editing && (
            <EditDirectoryEntryForm
              entry={editing}
              onClose={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditDirectoryEntryForm({
  entry,
  onClose,
}: {
  entry: DirectoryEntry;
  onClose: () => void;
}) {
  const [name, setName] = useState(entry.contact_name);
  const [email, setEmail] = useState(entry.contact_email ?? "");
  const [phone, setPhone] = useState(entry.contact_phone ?? "");
  const [company, setCompany] = useState(entry.company_name ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit() {
    setError(null);
    startTransition(async () => {
      const result = await updateOrgContributor(entry.identityKey, {
        contact_name: name.trim(),
        contact_email: email.trim() || null,
        contact_phone: phone.trim() || null,
        company_name: company.trim() || null,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {entry.contact_name}</DialogTitle>
        <DialogDescription>
          Updating these fields will propagate to {entry.project_count}{" "}
          project(s).
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div>
          <Label htmlFor="dir-name">Name</Label>
          <Input
            id="dir-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="dir-email">Email</Label>
          <Input
            id="dir-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="dir-phone">Phone</Label>
          <Input
            id="dir-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="dir-company">Company</Label>
          <Input
            id="dir-company"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} disabled={pending || !name.trim()}>
          {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </DialogFooter>
    </>
  );
}
