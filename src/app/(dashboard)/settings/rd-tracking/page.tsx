import {
  listTimeEntries,
  getTimeSummary,
  listExperiments,
  deleteTimeEntry,
  listAutoEntries,
  getAutoTrackingConfig,
  listFileMappings,
  getAutoTrackingStats,
} from "./actions";
import { RD_STAGES, RD_DELIVERABLES, RD_TAG_OPTIONS } from "@/lib/rd-constants";
import { TimeEntryForm } from "@/components/rd/time-entry-form";
import { RdSummary } from "@/components/rd/rd-summary";
import { ExperimentLog } from "@/components/rd/experiment-log";
import { ExportCsvButton } from "@/components/rd/export-csv-button";
import { AutoEntryReview } from "@/components/rd/auto-entry-review";
import { AutoTrackingConfig } from "@/components/rd/auto-tracking-config";
import { FileMappingEditor } from "@/components/rd/file-mapping-editor";
import { AutoTrackingStats } from "@/components/rd/auto-tracking-stats";
import { TimeEntryEditDialog } from "@/components/rd/time-entry-edit-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Trash2 } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";

const tagColors: Record<string, "default" | "secondary" | "outline"> = {
  core_rd: "default",
  rd_supporting: "secondary",
  not_eligible: "outline",
};

const AUTO_STATS_DEFAULT = {
  totalAutoHours: 0,
  pendingCount: 0,
  approvedCount: 0,
  rejectedCount: 0,
  approvalRate: 0,
};

export default async function RdTrackingPage() {
  // Core data (always available)
  const [entries, summary, experiments] = await Promise.all([
    listTimeEntries(),
    getTimeSummary(),
    listExperiments(),
  ]);

  // Auto-tracking data (may fail if migration not yet run)
  let autoEntries: Awaited<ReturnType<typeof listAutoEntries>> = [];
  let autoConfig: Awaited<ReturnType<typeof getAutoTrackingConfig>> = null;
  let fileMappings: Awaited<ReturnType<typeof listFileMappings>> = [];
  let autoStats = AUTO_STATS_DEFAULT;

  try {
    [autoEntries, autoConfig, fileMappings, autoStats] = await Promise.all([
      listAutoEntries(),
      getAutoTrackingConfig(),
      listFileMappings(),
      getAutoTrackingStats(),
    ]);
  } catch {
    // Tables not yet created — auto-tracking tab will show defaults
  }

  const headersList = await headers();
  const host = headersList.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const webhookUrl = `${protocol}://${host}/api/rd/webhook`;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Settings
          </Button>
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">R&D Time Tracking</h1>
            <p className="text-muted-foreground">
              Log hours by stage and R&D eligibility for tax incentive claims
            </p>
          </div>
          <ExportCsvButton />
        </div>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Summary</TabsTrigger>
          <TabsTrigger value="log">Time Log</TabsTrigger>
          <TabsTrigger value="auto">
            Auto-Tracked
            {autoStats.pendingCount > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs px-1.5">
                {autoStats.pendingCount}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="experiments">Experiments</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6 mt-4">
          <RdSummary summary={summary} />
          <AutoTrackingStats stats={autoStats} />
        </TabsContent>

        <TabsContent value="log" className="space-y-6 mt-4">
          <TimeEntryForm />

          {entries.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Hours</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Deliverable</TableHead>
                  <TableHead>R&D Tag</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      {new Date(entry.date).toLocaleDateString("en-AU")}
                    </TableCell>
                    <TableCell className="font-medium">
                      {Number(entry.hours).toFixed(1)}h
                    </TableCell>
                    <TableCell className="text-sm">
                      {RD_STAGES.find((s) => s.value === entry.stage)?.label ??
                        entry.stage}
                    </TableCell>
                    <TableCell className="text-sm">
                      {RD_DELIVERABLES.find((d) => d.value === entry.deliverable)
                        ?.label ?? entry.deliverable}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tagColors[entry.rd_tag] ?? "outline"}>
                        {RD_TAG_OPTIONS.find((t) => t.value === entry.rd_tag)
                          ?.label ?? entry.rd_tag}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {entry.description ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <TimeEntryEditDialog entry={entry} />
                        <form
                          action={async () => {
                            "use server";
                            await deleteTimeEntry(entry.id);
                          }}
                        >
                          <Button
                            variant="ghost"
                            size="icon"
                            type="submit"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </form>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="auto" className="space-y-6 mt-4">
          <AutoTrackingConfig config={autoConfig} webhookUrl={webhookUrl} />
          <FileMappingEditor mappings={fileMappings} />
          <AutoEntryReview entries={autoEntries} />
        </TabsContent>

        <TabsContent value="experiments" className="mt-4">
          <ExperimentLog experiments={experiments} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
