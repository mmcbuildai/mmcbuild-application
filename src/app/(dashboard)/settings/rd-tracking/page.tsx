import {
  listTimeEntries,
  getTimeSummary,
  listExperiments,
  deleteTimeEntry,
} from "./actions";
import { RD_STAGES, RD_DELIVERABLES, RD_TAG_OPTIONS } from "@/lib/rd-constants";
import { TimeEntryForm } from "@/components/rd/time-entry-form";
import { RdSummary } from "@/components/rd/rd-summary";
import { ExperimentLog } from "@/components/rd/experiment-log";
import { ExportCsvButton } from "@/components/rd/export-csv-button";
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

const tagColors: Record<string, "default" | "secondary" | "outline"> = {
  core_rd: "default",
  rd_supporting: "secondary",
  not_eligible: "outline",
};

export default async function RdTrackingPage() {
  const [entries, summary, experiments] = await Promise.all([
    listTimeEntries(),
    getTimeSummary(),
    listExperiments(),
  ]);

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
          <TabsTrigger value="experiments">Experiments</TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="space-y-6 mt-4">
          <RdSummary summary={summary} />
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
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </TabsContent>

        <TabsContent value="experiments" className="mt-4">
          <ExperimentLog experiments={experiments} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
