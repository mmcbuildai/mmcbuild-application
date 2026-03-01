import { ModuleHero } from "@/components/shared/module-hero";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calculator } from "lucide-react";

function QuotePreviewCard() {
  return (
    <div className="bg-white/[0.08] border border-white/15 rounded-2xl backdrop-blur-xl p-6 shadow-2xl">
      <div className="flex items-center gap-3 mb-4">
        <Calculator className="w-5 h-5 text-white/70" />
        <span className="text-base font-medium text-white/90">
          AI Cost Analysis
        </span>
      </div>
      <div className="space-y-3">
        <div className="bg-white/[0.06] border border-white/10 rounded-xl px-5 py-4">
          <p className="text-xs uppercase text-white/60">Base Cost</p>
          <p className="text-2xl font-bold text-white">$485,000</p>
        </div>
        <div className="bg-white/[0.06] border border-white/10 rounded-xl px-5 py-4">
          <p className="text-xs uppercase text-white/60">MMC Alternative</p>
          <p className="text-2xl font-bold text-green-400">$445,000</p>
          <p className="text-sm text-green-400">&#8595; 8% savings</p>
        </div>
        <div className="bg-white/[0.06] border border-white/10 rounded-xl px-5 py-4 space-y-2">
          <p className="text-xs uppercase text-white/60">Cost Breakdown</p>
          <div className="flex justify-between text-sm text-white">
            <span>Materials</span>
            <span>$280,000</span>
          </div>
          <div className="flex justify-between text-sm text-white">
            <span>Labour</span>
            <span>$125,000</span>
          </div>
          <div className="flex justify-between text-sm text-white">
            <span>Components</span>
            <span>$40,000</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function QuotePage() {
  return (
    <div>
      <ModuleHero
        module="quote"
        heading={
          <>
            <span className="text-violet-400">Intelligent</span> Quoting Made
            Simple
          </>
        }
        description="Generate itemised cost breakdowns using supplier price lists and AI analysis. Compare traditional vs MMC construction costs instantly."
        previewCard={<QuotePreviewCard />}
      />

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
