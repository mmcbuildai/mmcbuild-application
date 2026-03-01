import { Calculator } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function QuotePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">MMC Quote</h1>
        <p className="text-muted-foreground">
          AI-powered cost estimation and quoting
        </p>
      </div>

      <Card className="flex flex-col items-center justify-center py-12">
        <Calculator className="mb-4 h-12 w-12 text-muted-foreground" />
        <CardHeader className="text-center">
          <CardTitle>Cost Estimation</CardTitle>
          <CardDescription>
            Generate itemised cost breakdowns using supplier price lists and
            AI analysis. Coming in Stage 4.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
