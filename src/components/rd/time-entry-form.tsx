"use client";

import { useState } from "react";
import { logTimeEntry } from "@/app/(dashboard)/settings/rd-tracking/actions";
import { RD_STAGES, RD_DELIVERABLES, RD_TAG_OPTIONS } from "@/lib/rd-constants";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus } from "lucide-react";

export function TimeEntryForm() {
  const [loading, setLoading] = useState(false);

  async function handleSubmit(formData: FormData) {
    setLoading(true);
    try {
      await logTimeEntry(formData);
    } catch (err) {
      console.error("Failed to log time:", err);
    } finally {
      setLoading(false);
    }
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Log Time Entry</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={handleSubmit} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                name="date"
                type="date"
                defaultValue={today}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hours">Hours</Label>
              <Input
                id="hours"
                name="hours"
                type="number"
                step="0.5"
                min="0.5"
                max="24"
                placeholder="e.g. 2.5"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="stage">Stage</Label>
              <Select name="stage" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select stage" />
                </SelectTrigger>
                <SelectContent>
                  {RD_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="deliverable">Deliverable</Label>
              <Select name="deliverable" required>
                <SelectTrigger>
                  <SelectValue placeholder="Select deliverable" />
                </SelectTrigger>
                <SelectContent>
                  {RD_DELIVERABLES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="rd_tag">R&D Classification</Label>
              <Select name="rd_tag" defaultValue="not_eligible">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RD_TAG_OPTIONS.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label} — {t.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                placeholder="What was worked on? Include technical details for R&D claims."
                rows={2}
              />
            </div>
          </div>

          <Button type="submit" disabled={loading}>
            <Plus className="mr-2 h-4 w-4" />
            {loading ? "Logging..." : "Log Entry"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
