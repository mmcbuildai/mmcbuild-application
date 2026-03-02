"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil } from "lucide-react";
import { updateTimeEntry } from "@/app/(dashboard)/settings/rd-tracking/actions";
import { RD_STAGES, RD_DELIVERABLES, RD_TAG_OPTIONS } from "@/lib/rd-constants";
import { useRouter } from "next/navigation";
import type { RdTag } from "@/lib/supabase/types";

interface TimeEntryEditDialogProps {
  entry: {
    id: string;
    date: string;
    hours: number;
    stage: string;
    deliverable: string;
    rd_tag: string;
    description: string | null;
  };
}

export function TimeEntryEditDialog({ entry }: TimeEntryEditDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [date, setDate] = useState(entry.date);
  const [hours, setHours] = useState(String(entry.hours));
  const [stage, setStage] = useState(entry.stage);
  const [deliverable, setDeliverable] = useState(entry.deliverable);
  const [rdTag, setRdTag] = useState(entry.rd_tag);
  const [description, setDescription] = useState(entry.description ?? "");

  async function handleSave() {
    setSaving(true);
    try {
      await updateTimeEntry(entry.id, {
        date,
        hours: parseFloat(hours),
        stage,
        deliverable,
        rd_tag: rdTag as RdTag,
        description: description || undefined,
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      console.error("Failed to update entry:", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setOpen(true)}
        title="Edit time entry"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Time Entry</DialogTitle>
            <DialogDescription>Update the R&D time entry details.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Hours</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  value={hours}
                  onChange={(e) => setHours(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Stage</Label>
              <Select value={stage} onValueChange={setStage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RD_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Deliverable</Label>
              <Select value={deliverable} onValueChange={setDeliverable}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RD_DELIVERABLES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>R&D Tag</Label>
              <Select value={rdTag} onValueChange={setRdTag}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RD_TAG_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
