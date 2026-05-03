import { Suspense } from "react";
import { ModuleHero } from "@/components/shared/module-hero";
import { ExplainerVideo } from "@/components/shared/explainer-video";
import { BillingContent } from "./billing-content";

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <ModuleHero
        module="billing"
        heading={
          <>
            Manage Your{" "}
            <span className="text-emerald-400">Subscription</span>
          </>
        }
        description="View your plan, track usage, and manage billing."
      />

      <ExplainerVideo
        module="billing"
        videoUrl="/videos/billing-explainer.mp4"
        title="How runs, tiers, and trials work"
        description="MMC Build is priced by run, not seats. A run is a single AI analysis — Comply check, Build optimisation, or Quote. The trial gives you ten runs at no cost, and only successful analyses count against your allowance."
        bullets={[
          {
            heading: "Trial",
            body: "Ten free runs, no credit card. Watch the in-app counter — upgrade prompts appear before you hit zero, never after.",
          },
          {
            heading: "Tiers",
            body: "Practitioner (solo) gets unlimited projects + a generous monthly run pool. Team adds seats and a shared pool. Pick what matches actual usage.",
          },
          {
            heading: "Transparency",
            body: "Every run is logged. See which projects consumed your allowance and which modules you use most. Failed runs don't count.",
          },
        ]}
      />

      <Suspense
        fallback={
          <div className="space-y-6 animate-pulse">
            <div className="h-48 bg-slate-100 rounded-2xl" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="h-64 bg-slate-100 rounded-2xl" />
              <div className="h-64 bg-slate-100 rounded-2xl" />
              <div className="h-64 bg-slate-100 rounded-2xl" />
            </div>
          </div>
        }
      >
        <BillingContent />
      </Suspense>
    </div>
  );
}
