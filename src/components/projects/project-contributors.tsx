"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Pencil } from "lucide-react";
import { DISCIPLINE_LABELS, type ContributorDiscipline } from "@/lib/ai/types";
import {
  addProjectContributor,
  updateProjectContributor,
  removeProjectContributor,
} from "@/app/(dashboard)/projects/actions";
import { useRouter } from "next/navigation";

interface Contributor {
  id: string;
  discipline: string;
  company_name: string | null;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  notes: string | null;
  created_at: string;
}

interface ProjectContributorsProps {
  projectId: string;
  contributors: Contributor[];
}

export function ProjectContributors({
  projectId,
  contributors,
}: ProjectContributorsProps) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Project Team</h2>
          <p className="text-sm text-muted-foreground">
            External contributors who receive compliance findings
          </p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Add Contributor
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Contributor</DialogTitle>
            </DialogHeader>
            <ContributorForm
              projectId={projectId}
              onComplete={() => {
                setAddOpen(false);
                router.refresh();
              }}
            />
          </DialogContent>
        </Dialog>
      </div>

      {contributors.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No contributors added yet. Add your project team members to route
            compliance findings.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Discipline</TableHead>
              <TableHead>Company</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="w-[80px]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {contributors.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">{c.contact_name}</TableCell>
                <TableCell>
                  <DisciplineBadge discipline={c.discipline} />
                </TableCell>
                <TableCell>{c.company_name ?? "-"}</TableCell>
                <TableCell>{c.contact_email ?? "-"}</TableCell>
                <TableCell>{c.contact_phone ?? "-"}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Dialog
                      open={editId === c.id}
                      onOpenChange={(open) => setEditId(open ? c.id : null)}
                    >
                      <DialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Edit Contributor</DialogTitle>
                        </DialogHeader>
                        <ContributorForm
                          projectId={projectId}
                          existing={c}
                          onComplete={() => {
                            setEditId(null);
                            router.refresh();
                          }}
                        />
                      </DialogContent>
                    </Dialog>
                    <DeleteButton
                      contributorId={c.id}
                      onDeleted={() => router.refresh()}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

export function DisciplineBadge({ discipline }: { discipline: string }) {
  const label =
    DISCIPLINE_LABELS[discipline as ContributorDiscipline] ??
    discipline.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Badge variant="secondary" className="text-xs font-normal">
      {label}
    </Badge>
  );
}

function ContributorForm({
  projectId,
  existing,
  onComplete,
}: {
  projectId: string;
  existing?: Contributor;
  onComplete: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(formData: FormData) {
    setError(null);
    const data = {
      contact_name: formData.get("contact_name") as string,
      discipline: formData.get("discipline") as string,
      company_name: (formData.get("company_name") as string) || undefined,
      contact_email: (formData.get("contact_email") as string) || undefined,
      contact_phone: (formData.get("contact_phone") as string) || undefined,
      notes: (formData.get("notes") as string) || undefined,
    };

    if (!data.contact_name) {
      setError("Contact name is required");
      return;
    }

    startTransition(async () => {
      const result = existing
        ? await updateProjectContributor(existing.id, data)
        : await addProjectContributor(projectId, data);

      if (result.error) {
        setError(result.error);
      } else {
        onComplete();
      }
    });
  }

  return (
    <form action={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="contact_name">Contact Name *</Label>
        <Input
          id="contact_name"
          name="contact_name"
          defaultValue={existing?.contact_name}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="discipline">Discipline *</Label>
        <Select
          name="discipline"
          defaultValue={existing?.discipline ?? "other"}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(DISCIPLINE_LABELS).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="company_name">Company</Label>
        <Input
          id="company_name"
          name="company_name"
          defaultValue={existing?.company_name ?? ""}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="contact_email">Email</Label>
          <Input
            id="contact_email"
            name="contact_email"
            type="email"
            defaultValue={existing?.contact_email ?? ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact_phone">Phone</Label>
          <Input
            id="contact_phone"
            name="contact_phone"
            type="tel"
            defaultValue={existing?.contact_phone ?? ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          defaultValue={existing?.notes ?? ""}
          rows={2}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" disabled={isPending} className="w-full">
        {isPending
          ? "Saving..."
          : existing
            ? "Update Contributor"
            : "Add Contributor"}
      </Button>
    </form>
  );
}

function DeleteButton({
  contributorId,
  onDeleted,
}: {
  contributorId: string;
  onDeleted: () => void;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-destructive hover:text-destructive"
      disabled={isPending}
      onClick={() => {
        if (!confirm("Remove this contributor?")) return;
        startTransition(async () => {
          const result = await removeProjectContributor(contributorId);
          if (!result.error) onDeleted();
        });
      }}
    >
      <Trash2 className="h-3.5 w-3.5" />
    </Button>
  );
}
