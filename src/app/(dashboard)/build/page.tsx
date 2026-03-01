import { Hammer } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function BuildPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">MMC Build</h1>
        <p className="text-muted-foreground">
          Design optimisation for modern methods of construction
        </p>
      </div>

      <Card className="flex flex-col items-center justify-center py-12">
        <Hammer className="mb-4 h-12 w-12 text-muted-foreground" />
        <CardHeader className="text-center">
          <CardTitle>Design Optimisation</CardTitle>
          <CardDescription>
            AI-powered suggestions for prefabrication, SIP panels, and modular
            construction opportunities. Coming in Stage 3.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
