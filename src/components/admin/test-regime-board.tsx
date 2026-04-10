"use client";

import { useState, useTransition, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle2,
  XCircle,
  Circle,
  ChevronDown,
  ChevronUp,
  Upload,
  Trash2,
  RotateCcw,
  ClipboardCheck,
  Image as ImageIcon,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import {
  updateTestResult,
  addScreenshot,
  deleteScreenshot,
  resetAllTests,
} from "@/app/(dashboard)/admin/test-regime/actions";
import { createClient } from "@/lib/supabase/client";

interface Screenshot {
  id: string;
  file_name: string;
  file_path: string;
  file_size: number;
}

interface TestResult {
  id: string | null;
  tc_id: string;
  title: string;
  section: string;
  status: "pending" | "passed" | "failed";
  notes: string | null;
  tested_by: string | null;
  tested_at: string | null;
  test_screenshots: Screenshot[];
}

interface Props {
  results: TestResult[];
  testerName: string;
}

const SECTION_ORDER = [
  "Onboarding",
  "MMC Comply",
  "MMC Build",
  "MMC Quote",
  "MMC Direct",
  "MMC Train",
  "Billing",
  "Access Control",
];

const statusConfig = {
  pending: {
    icon: Circle,
    label: "Pending",
    color: "text-slate-400",
    badge: "bg-slate-100 text-slate-600 border-slate-200",
  },
  passed: {
    icon: CheckCircle2,
    label: "Passed",
    color: "text-green-600",
    badge: "bg-green-50 text-green-700 border-green-200",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    color: "text-red-600",
    badge: "bg-red-50 text-red-700 border-red-200",
  },
};

export function TestRegimeBoard({ results, testerName }: Props) {
  const [expandedTests, setExpandedTests] = useState<Set<string>>(new Set());
  const [localResults, setLocalResults] = useState<TestResult[]>(results);
  const [isPending, startTransition] = useTransition();
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "passed" | "failed">("all");
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Group by section
  const sections = new Map<string, TestResult[]>();
  for (const section of SECTION_ORDER) {
    const sectionResults = localResults.filter((r) => r.section === section);
    if (sectionResults.length > 0) sections.set(section, sectionResults);
  }

  // Stats
  const total = localResults.length;
  const passed = localResults.filter((r) => r.status === "passed").length;
  const failed = localResults.filter((r) => r.status === "failed").length;
  const pending = localResults.filter((r) => r.status === "pending").length;
  const progressPct = total > 0 ? Math.round(((passed + failed) / total) * 100) : 0;

  function toggleExpand(tcId: string) {
    setExpandedTests((prev) => {
      const next = new Set(prev);
      if (next.has(tcId)) next.delete(tcId);
      else next.add(tcId);
      return next;
    });
  }

  function updateLocalNotes(tcId: string, notes: string) {
    setLocalResults((prev) =>
      prev.map((r) => (r.tc_id === tcId ? { ...r, notes } : r))
    );
  }

  function handleStatusChange(
    tcId: string,
    status: "pending" | "passed" | "failed"
  ) {
    // Update locally first
    setLocalResults((prev) =>
      prev.map((r) =>
        r.tc_id === tcId
          ? {
              ...r,
              status,
              tested_at: new Date().toISOString(),
            }
          : r
      )
    );

    // If setting to failed, auto-expand for notes
    if (status === "failed") {
      setExpandedTests((prev) => new Set([...prev, tcId]));
    }
  }

  function handleSave(tcId: string) {
    const result = localResults.find((r) => r.tc_id === tcId);
    if (!result) return;

    setSavingId(tcId);
    startTransition(async () => {
      const res = await updateTestResult(tcId, result.status, result.notes);
      if (res.error) {
        alert(`Error saving: ${res.error}`);
      }
      setSavingId(null);
    });
  }

  async function handleFileUpload(tcId: string, files: FileList | null) {
    if (!files || files.length === 0) return;

    setUploadingId(tcId);
    const supabase = createClient();

    for (const file of Array.from(files)) {
      // Validate
      if (!file.type.startsWith("image/")) {
        alert("Only image files are allowed");
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert("File size must be under 10MB");
        continue;
      }

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${tcId}/${timestamp}_${safeName}`;

      const { error: storageError } = await supabase.storage
        .from("test-screenshots")
        .upload(filePath, file);

      if (storageError) {
        alert(`Upload failed: ${storageError.message}`);
        continue;
      }

      startTransition(async () => {
        const res = await addScreenshot(tcId, file.name, filePath, file.size);
        if (res.error) alert(`Error saving screenshot: ${res.error}`);
      });
    }

    setUploadingId(null);
    // Clear file input
    const input = fileInputRefs.current.get(tcId);
    if (input) input.value = "";
  }

  function handleDeleteScreenshot(screenshotId: string) {
    startTransition(async () => {
      const res = await deleteScreenshot(screenshotId);
      if (res.error) alert(`Error: ${res.error}`);
      // Remove from local state
      setLocalResults((prev) =>
        prev.map((r) => ({
          ...r,
          test_screenshots: r.test_screenshots.filter(
            (s) => s.id !== screenshotId
          ),
        }))
      );
    });
  }

  function handleReset() {
    if (
      !confirm(
        "Reset all test results? This will clear all statuses, notes, and screenshots."
      )
    )
      return;

    startTransition(async () => {
      const res = await resetAllTests();
      if (res.error) {
        alert(`Error: ${res.error}`);
      } else {
        setLocalResults((prev) =>
          prev.map((r) => ({
            ...r,
            id: null,
            status: "pending" as const,
            notes: null,
            tested_by: null,
            tested_at: null,
            test_screenshots: [],
          }))
        );
        setExpandedTests(new Set());
      }
    });
  }

  // Apply filter
  const filteredSections = new Map<string, TestResult[]>();
  for (const [section, sectionResults] of sections) {
    const filtered =
      filter === "all"
        ? sectionResults
        : sectionResults.filter((r) => r.status === filter);
    if (filtered.length > 0) filteredSections.set(section, filtered);
  }

  return (
    <div className="space-y-6">
      {/* Progress overview */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex-1 w-full">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">
                  Test Progress: {passed + failed}/{total} completed
                </span>
                <span className="text-sm text-muted-foreground">
                  {progressPct}%
                </span>
              </div>
              <div className="h-3 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full flex">
                  {passed > 0 && (
                    <div
                      className="bg-green-500 transition-all"
                      style={{ width: `${(passed / total) * 100}%` }}
                    />
                  )}
                  {failed > 0 && (
                    <div
                      className="bg-red-500 transition-all"
                      style={{ width: `${(failed / total) * 100}%` }}
                    />
                  )}
                </div>
              </div>
              <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-green-500" />
                  {passed} passed
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-red-500" />
                  {failed} failed
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-slate-300" />
                  {pending} pending
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={isPending}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                Reset All
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {(["all", "pending", "passed", "failed"] as const).map((f) => {
          const count =
            f === "all"
              ? total
              : localResults.filter((r) => r.status === f).length;
          return (
            <Button
              key={f}
              variant={filter === f ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f} ({count})
            </Button>
          );
        })}
      </div>

      {/* Test sections */}
      {Array.from(filteredSections).map(([section, sectionResults]) => {
        const sectionPassed = sectionResults.filter(
          (r) => r.status === "passed"
        ).length;
        const sectionTotal = sectionResults.length;
        const sectionComplete =
          sectionResults.every((r) => r.status !== "pending");

        return (
          <Card key={section}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  {sectionComplete ? (
                    sectionPassed === sectionTotal ? (
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    ) : (
                      <AlertTriangle className="h-5 w-5 text-amber-500" />
                    )
                  ) : (
                    <ClipboardCheck className="h-5 w-5 text-slate-400" />
                  )}
                  {section}
                </CardTitle>
                <Badge
                  variant="outline"
                  className={
                    sectionPassed === sectionTotal && sectionComplete
                      ? "border-green-200 text-green-700"
                      : "border-slate-200"
                  }
                >
                  {sectionPassed}/{sectionTotal} passed
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {sectionResults.map((result) => {
                const isExpanded = expandedTests.has(result.tc_id);
                const cfg = statusConfig[result.status];
                const StatusIcon = cfg.icon;
                const isSaving = savingId === result.tc_id;
                const isUploading = uploadingId === result.tc_id;

                return (
                  <div
                    key={result.tc_id}
                    className={`rounded-lg border transition-colors ${
                      result.status === "failed"
                        ? "border-red-200 bg-red-50/30"
                        : result.status === "passed"
                          ? "border-green-200 bg-green-50/30"
                          : "border-slate-200"
                    }`}
                  >
                    {/* Test row */}
                    <div
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer"
                      onClick={() => toggleExpand(result.tc_id)}
                    >
                      <StatusIcon className={`h-5 w-5 shrink-0 ${cfg.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">
                            {result.tc_id}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${cfg.badge}`}
                          >
                            {cfg.label}
                          </Badge>
                          {result.test_screenshots.length > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                              <ImageIcon className="h-3 w-3" />
                              {result.test_screenshots.length}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium mt-0.5 truncate">
                          {result.title}
                        </p>
                      </div>

                      {/* Quick status buttons */}
                      <div
                        className="flex gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Button
                          variant={
                            result.status === "passed" ? "default" : "outline"
                          }
                          size="sm"
                          className={`h-7 px-2 text-xs ${
                            result.status === "passed"
                              ? "bg-green-600 hover:bg-green-700"
                              : ""
                          }`}
                          onClick={() =>
                            handleStatusChange(
                              result.tc_id,
                              result.status === "passed" ? "pending" : "passed"
                            )
                          }
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Pass
                        </Button>
                        <Button
                          variant={
                            result.status === "failed" ? "default" : "outline"
                          }
                          size="sm"
                          className={`h-7 px-2 text-xs ${
                            result.status === "failed"
                              ? "bg-red-600 hover:bg-red-700"
                              : ""
                          }`}
                          onClick={() =>
                            handleStatusChange(
                              result.tc_id,
                              result.status === "failed" ? "pending" : "failed"
                            )
                          }
                        >
                          <XCircle className="h-3.5 w-3.5 mr-1" />
                          Fail
                        </Button>
                      </div>

                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3">
                        {/* Notes */}
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">
                            Notes / Outcome Details
                          </label>
                          <Textarea
                            placeholder={
                              result.status === "failed"
                                ? "Describe what happened, what was expected, and any error messages..."
                                : "Optional notes about this test..."
                            }
                            value={result.notes || ""}
                            onChange={(e) =>
                              updateLocalNotes(result.tc_id, e.target.value)
                            }
                            className="min-h-[80px] text-sm"
                          />
                        </div>

                        {/* Screenshot upload */}
                        <div>
                          <label className="text-xs font-medium text-muted-foreground mb-1 block">
                            Screenshots
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              ref={(el) => {
                                if (el) fileInputRefs.current.set(result.tc_id, el);
                              }}
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) =>
                                handleFileUpload(result.tc_id, e.target.files)
                              }
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                fileInputRefs.current.get(result.tc_id)?.click()
                              }
                              disabled={isUploading}
                            >
                              {isUploading ? (
                                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                              ) : (
                                <Upload className="h-3.5 w-3.5 mr-1.5" />
                              )}
                              {isUploading
                                ? "Uploading..."
                                : "Upload Screenshots"}
                            </Button>
                          </div>

                          {/* Uploaded screenshots */}
                          {result.test_screenshots.length > 0 && (
                            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                              {result.test_screenshots.map((screenshot) => (
                                <div
                                  key={screenshot.id}
                                  className="group relative rounded-md border bg-slate-50 p-2"
                                >
                                  <div className="flex items-center gap-2">
                                    <ImageIcon className="h-4 w-4 text-muted-foreground shrink-0" />
                                    <span className="text-xs truncate flex-1">
                                      {screenshot.file_name}
                                    </span>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={() =>
                                        handleDeleteScreenshot(screenshot.id)
                                      }
                                    >
                                      <Trash2 className="h-3 w-3 text-red-500" />
                                    </Button>
                                  </div>
                                  <span className="text-[10px] text-muted-foreground">
                                    {(screenshot.file_size / 1024).toFixed(0)} KB
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Tested info + save */}
                        <div className="flex items-center justify-between pt-2">
                          <div className="text-xs text-muted-foreground">
                            {result.tested_at && (
                              <span>
                                Last tested:{" "}
                                {new Date(result.tested_at).toLocaleString(
                                  "en-AU",
                                  { dateStyle: "medium", timeStyle: "short" }
                                )}
                              </span>
                            )}
                          </div>
                          <Button
                            size="sm"
                            onClick={() => handleSave(result.tc_id)}
                            disabled={isSaving}
                          >
                            {isSaving ? (
                              <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                            )}
                            {isSaving ? "Saving..." : "Save Result"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
