import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RD_STAGES } from "@/lib/rd-constants";

interface RdSummaryProps {
  summary: {
    totalHours: number;
    byStage: Record<string, number>;
    byTag: Record<string, number>;
    eligibleHours: number;
  };
}

export function RdSummary({ summary }: RdSummaryProps) {
  const eligiblePct =
    summary.totalHours > 0
      ? ((summary.eligibleHours / summary.totalHours) * 100).toFixed(1)
      : "0";

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Total Hours
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{summary.totalHours.toFixed(1)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            R&D Eligible Hours
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-green-600">
            {summary.eligibleHours.toFixed(1)}
          </p>
          <p className="text-sm text-muted-foreground">{eligiblePct}% of total</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            R&D Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span>Core R&D</span>
            <span className="font-medium">
              {(summary.byTag["core_rd"] ?? 0).toFixed(1)}h
            </span>
          </div>
          <div className="flex justify-between">
            <span>Supporting</span>
            <span className="font-medium">
              {(summary.byTag["rd_supporting"] ?? 0).toFixed(1)}h
            </span>
          </div>
          <div className="flex justify-between text-muted-foreground">
            <span>Not Eligible</span>
            <span>{(summary.byTag["not_eligible"] ?? 0).toFixed(1)}h</span>
          </div>
        </CardContent>
      </Card>

      <Card className="md:col-span-3">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Hours by Stage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {RD_STAGES.map((stage) => {
              const hours = summary.byStage[stage.value] ?? 0;
              const pct =
                summary.totalHours > 0
                  ? (hours / summary.totalHours) * 100
                  : 0;
              return (
                <div key={stage.value} className="flex items-center gap-3">
                  <span className="w-48 text-sm truncate">{stage.label}</span>
                  <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium w-16 text-right">
                    {hours.toFixed(1)}h
                  </span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
