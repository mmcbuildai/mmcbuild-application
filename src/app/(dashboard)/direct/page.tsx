import { Users } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DirectPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">MMC Direct</h1>
        <p className="text-muted-foreground">
          Trade and consultant directory
        </p>
      </div>

      <Card className="flex flex-col items-center justify-center py-12">
        <Users className="mb-4 h-12 w-12 text-muted-foreground" />
        <CardHeader className="text-center">
          <CardTitle>Trade Directory</CardTitle>
          <CardDescription>
            Browse verified builders, architects, suppliers, and trades
            specialising in MMC methods. Coming in Stage 5.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
