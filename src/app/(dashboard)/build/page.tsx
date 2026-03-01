import { ModuleHero } from "@/components/shared/module-hero";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Hammer } from "lucide-react";

export default function BuildPage() {
  return (
    <div>
      <ModuleHero
        module="build"
        heading={
          <>
            Build{" "}
            <span className="text-teal-400">Smarter</span>, Not Harder
          </>
        }
        description="AI-powered design optimisation for prefabrication, SIP panels, and modular construction opportunities."
      />

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
