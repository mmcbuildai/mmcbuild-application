import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface AutoTrackingStatsProps {
  stats: {
    totalAutoHours: number;
    pendingCount: number;
    approvedCount: number;
    rejectedCount: number;
    approvalRate: number;
  };
}

export function AutoTrackingStats({ stats }: AutoTrackingStatsProps) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Auto-Tracked Hours
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{stats.totalAutoHours.toFixed(1)}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Pending Review
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-yellow-600">
            {stats.pendingCount}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            Approval Rate
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold text-green-600">
            {(stats.approvalRate * 100).toFixed(0)}%
          </p>
          <p className="text-sm text-muted-foreground">
            {stats.approvedCount} approved, {stats.rejectedCount} rejected
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
