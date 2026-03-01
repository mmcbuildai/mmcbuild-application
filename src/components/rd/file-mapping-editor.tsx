"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveFileMappings } from "@/app/(dashboard)/settings/rd-tracking/actions";
import { RD_STAGES, RD_DELIVERABLES, RD_TAG_OPTIONS } from "@/lib/rd-constants";
import type { RdTag } from "@/lib/supabase/types";

interface FileMappingRow {
  id?: string;
  pattern: string;
  stage: string;
  deliverable: string;
  rd_tag: RdTag;
  priority: number;
}

interface FileMappingEditorProps {
  mappings: FileMappingRow[];
}

export function FileMappingEditor({ mappings: initial }: FileMappingEditorProps) {
  const [rows, setRows] = useState<FileMappingRow[]>(
    initial.length > 0
      ? initial
      : [
          {
            pattern: "",
            stage: "stage_1",
            deliverable: "ai_compliance_engine",
            rd_tag: "core_rd",
            priority: 0,
          },
        ]
  );
  const [saving, setSaving] = useState(false);

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        pattern: "",
        stage: "stage_1",
        deliverable: "ai_compliance_engine",
        rd_tag: "core_rd",
        priority: prev.length,
      },
    ]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function updateRow(index: number, field: keyof FileMappingRow, value: string | number) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      )
    );
  }

  async function handleSave() {
    const valid = rows.filter((r) => r.pattern.trim() !== "");
    if (valid.length === 0) return;

    setSaving(true);
    try {
      await saveFileMappings(valid);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>File Mapping Rules</CardTitle>
        <p className="text-sm text-muted-foreground">
          Map file patterns to stages and deliverables. Matched files override AI
          classification. Use glob patterns like <code>src/lib/comply/**</code>.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2 items-start flex-wrap">
            <Input
              placeholder="src/lib/comply/**"
              value={row.pattern}
              onChange={(e) => updateRow(i, "pattern", e.target.value)}
              className="w-[200px]"
            />
            <Select
              value={row.stage}
              onValueChange={(v) => updateRow(i, "stage", v)}
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RD_STAGES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={row.deliverable}
              onValueChange={(v) => updateRow(i, "deliverable", v)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RD_DELIVERABLES.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={row.rd_tag}
              onValueChange={(v) => updateRow(i, "rd_tag", v as RdTag)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RD_TAG_OPTIONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => removeRow(i)}
              className="text-muted-foreground hover:text-destructive"
            >
              Remove
            </Button>
          </div>
        ))}

        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={addRow}>
            Add Rule
          </Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Mappings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
