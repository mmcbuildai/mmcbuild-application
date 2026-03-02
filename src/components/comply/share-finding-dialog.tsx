"use client";

import { useState, useTransition } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DISCIPLINE_LABELS, type ContributorDiscipline } from "@/lib/ai/types";
import {
  shareFindingWithContributor,
  addContributorAndShareFinding,
} from "@/app/(dashboard)/comply/actions";
import { useRouter } from "next/navigation";

interface Contributor {
  id: string;
  discipline: string;
  contact_name: string;
  company_name: string | null;
  contact_email: string | null;
}

interface ShareFindingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  findingId: string;
  projectId: string;
  discipline: string | null;
  contributors: Contributor[];
}

export function ShareFindingDialog({
  open,
  onOpenChange,
  findingId,
  projectId,
  discipline,
  contributors,
}: ShareFindingDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<"select" | "add">(
    contributors.length > 0 ? "select" : "add"
  );
  const [selectedContributorId, setSelectedContributorId] = useState("");
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [newDiscipline, setNewDiscipline] = useState(discipline ?? "other");
  const [error, setError] = useState<string | null>(null);

  function handleShareExisting() {
    if (!selectedContributorId) return;
    const contributor = contributors.find((c) => c.id === selectedContributorId);
    if (!contributor?.contact_email) {
      setError("This contributor has no email address. Please add one first.");
      return;
    }

    startTransition(async () => {
      const result = await shareFindingWithContributor(findingId, selectedContributorId);
      if ("error" in result) {
        setError(result.error ?? null);
      } else {
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  function handleAddAndShare() {
    if (!newName || !newEmail) return;

    startTransition(async () => {
      const result = await addContributorAndShareFinding(projectId, findingId, {
        contact_name: newName,
        discipline: newDiscipline,
        contact_email: newEmail,
        company_name: newCompany || undefined,
      });
      if ("error" in result) {
        setError(result.error ?? null);
      } else {
        onOpenChange(false);
        router.refresh();
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share Finding</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Tab toggle */}
          {contributors.length > 0 && (
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              <button
                onClick={() => setMode("select")}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === "select" ? "bg-background shadow-sm" : "text-muted-foreground"
                }`}
              >
                Existing
              </button>
              <button
                onClick={() => setMode("add")}
                className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  mode === "add" ? "bg-background shadow-sm" : "text-muted-foreground"
                }`}
              >
                Add New
              </button>
            </div>
          )}

          {mode === "select" && contributors.length > 0 && (
            <div className="space-y-3">
              <div>
                <Label>Select Contributor</Label>
                <Select value={selectedContributorId} onValueChange={setSelectedContributorId}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choose a contributor..." />
                  </SelectTrigger>
                  <SelectContent>
                    {contributors.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.contact_name}
                        {c.company_name ? ` (${c.company_name})` : ""}
                        {!c.contact_email ? " — no email" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="w-full"
                onClick={handleShareExisting}
                disabled={!selectedContributorId || isPending}
              >
                {isPending ? "Sharing..." : "Share with Contributor"}
              </Button>
            </div>
          )}

          {mode === "add" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="share-name">Name *</Label>
                <Input
                  id="share-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. John Smith"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="share-email">Email *</Label>
                <Input
                  id="share-email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="share-company">Company</Label>
                <Input
                  id="share-company"
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  placeholder="Optional"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Discipline</Label>
                <Select value={newDiscipline} onValueChange={setNewDiscipline}>
                  <SelectTrigger className="mt-1">
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
              <Button
                className="w-full"
                onClick={handleAddAndShare}
                disabled={!newName || !newEmail || isPending}
              >
                {isPending ? "Adding & Sharing..." : "Add Contributor & Share"}
              </Button>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
