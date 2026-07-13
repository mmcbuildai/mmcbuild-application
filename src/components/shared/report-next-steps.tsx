import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

export type NextStep = { title: string; description: string; href: string };

/**
 * "What's next" footer for a module report. The report is the end of one
 * module's workflow, so there's no "next" — give the user optional jumps to the
 * other modules for this project plus a clear way back, instead of leaving them
 * staring at a finished report wondering what to do (Karen/Karthik, beta day 1).
 */
export function ReportNextSteps({
  projectId,
  steps,
}: {
  projectId: string;
  steps: NextStep[];
}) {
  return (
    <div className="space-y-4 border-t pt-6">
      <div>
        <h2 className="text-lg font-semibold">What would you like to do next?</h2>
        <p className="text-sm text-muted-foreground">
          Optional — carry this project into another module, or head back.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-lg border p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/40"
          >
            <div className="flex items-center justify-between">
              <span className="font-medium">{s.title}</span>
              <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{s.description}</p>
          </Link>
        ))}
      </div>
      <Link
        href={`/projects/${projectId}`}
        className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to project
      </Link>
    </div>
  );
}
