import { GraduationCap } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function TrainPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">MMC Train</h1>
        <p className="text-muted-foreground">
          Training modules for construction professionals
        </p>
      </div>

      <Card className="flex flex-col items-center justify-center py-12">
        <GraduationCap className="mb-4 h-12 w-12 text-muted-foreground" />
        <CardHeader className="text-center">
          <CardTitle>Training Modules</CardTitle>
          <CardDescription>
            Self-paced courses on modern methods of construction with
            completion certificates. Coming in Stage 6.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
