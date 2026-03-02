"use client";

import { useState } from "react";
import {
  createExperiment,
  updateExperiment,
  deleteExperiment,
} from "@/app/(dashboard)/settings/rd-tracking/actions";
import { RD_STAGES } from "@/lib/rd-constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, FlaskConical, Trash2 } from "lucide-react";
import type { Database, ExperimentStatus } from "@/lib/supabase/types";

type Experiment = Database["public"]["Tables"]["rd_experiments"]["Row"];

const statusColors: Record<ExperimentStatus, string> = {
  planned: "outline",
  in_progress: "secondary",
  completed: "default",
};

export function ExperimentLog({
  experiments,
}: {
  experiments: Experiment[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleCreate(formData: FormData) {
    setLoading(true);
    try {
      await createExperiment(formData);
      setOpen(false);
    } catch (err) {
      console.error("Failed to create experiment:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleStatusChange(id: string, status: ExperimentStatus) {
    await updateExperiment(id, { status });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this experiment? This cannot be undone.")) return;
    try {
      await deleteExperiment(id);
    } catch (err) {
      console.error("Failed to delete experiment:", err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Experiment Log</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="mr-2 h-4 w-4" />
              New Experiment
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Log R&D Experiment</DialogTitle>
              <DialogDescription>
                Document hypotheses and experiments for R&D tax evidence.
              </DialogDescription>
            </DialogHeader>
            <form action={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title</Label>
                <Input
                  id="title"
                  name="title"
                  placeholder="e.g. RAG threshold optimisation"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hypothesis">Hypothesis</Label>
                <Textarea
                  id="hypothesis"
                  name="hypothesis"
                  placeholder="What are you trying to prove or disprove?"
                  required
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="methodology">Methodology</Label>
                <Textarea
                  id="methodology"
                  name="methodology"
                  placeholder="How will you test this?"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="stage">Stage</Label>
                <Select name="stage">
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
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Creating..." : "Create"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {experiments.length === 0 ? (
        <Card className="flex flex-col items-center justify-center py-8">
          <FlaskConical className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No experiments logged yet
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {experiments.map((exp) => (
            <Card key={exp.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{exp.title}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusColors[exp.status] as "outline" | "secondary" | "default"}>
                      {exp.status.replace("_", " ")}
                    </Badge>
                    {exp.status !== "completed" && (
                      <Select
                        value={exp.status}
                        onValueChange={(v) =>
                          handleStatusChange(exp.id, v as ExperimentStatus)
                        }
                      >
                        <SelectTrigger className="w-[140px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="planned">Planned</SelectItem>
                          <SelectItem value="in_progress">
                            In Progress
                          </SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(exp.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                {exp.stage && (
                  <CardDescription>{exp.stage}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div>
                  <span className="font-medium">Hypothesis: </span>
                  {exp.hypothesis}
                </div>
                {exp.methodology && (
                  <div>
                    <span className="font-medium">Methodology: </span>
                    {exp.methodology}
                  </div>
                )}
                {exp.outcome && (
                  <div>
                    <span className="font-medium">Outcome: </span>
                    {exp.outcome}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
