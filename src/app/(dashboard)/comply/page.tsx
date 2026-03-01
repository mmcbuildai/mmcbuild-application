import { ShieldCheck } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function ComplyPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">MMC Comply</h1>
        <p className="text-muted-foreground">
          AI-powered NCC compliance checking
        </p>
      </div>

      <Card className="flex flex-col items-center justify-center py-12">
        <ShieldCheck className="mb-4 h-12 w-12 text-muted-foreground" />
        <CardHeader className="text-center">
          <CardTitle>NCC Compliance Engine</CardTitle>
          <CardDescription>
            Upload a building plan and run automated compliance checks against
            the National Construction Code. Coming in Stage 2.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
