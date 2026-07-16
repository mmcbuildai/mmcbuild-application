import { CheckCircle2, AlertCircle } from "lucide-react";
import type { DesignAttributes } from "@/lib/comply/questionnaire-prefill";
import { derivePlanInputs } from "@/lib/comply/plan-inputs";

/**
 * Shows which plan inputs were detected in the upload (SCRUM-187), so the user
 * knows up-front what's missing rather than discovering thin Build/Quote output
 * downstream. Reads the on-upload design attributes — no new analysis.
 */
export function PlanInputsChecklist({
  attributes,
  extracted,
}: {
  attributes: DesignAttributes | null;
  extracted: boolean;
}) {
  if (!extracted) {
    return (
      <p className="text-sm text-muted-foreground">
        We haven&rsquo;t read detailed inputs from your plans yet. Comply will
        still analyse what&rsquo;s uploaded — running MMC Build first extracts
        more detail for richer Build and Quote results.
      </p>
    );
  }

  const inputs = derivePlanInputs(attributes);
  const missing = inputs.filter((i) => !i.present);

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {inputs.map((input) => (
          <li key={input.label} className="flex items-start gap-2 text-sm">
            {input.present ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            )}
            <span className={input.present ? "" : "text-muted-foreground"}>
              {input.label}
              {!input.present && (
                <span className="block text-xs text-muted-foreground">
                  {input.limitedNote}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {missing.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {missing.length} input{missing.length > 1 ? "s were" : " was"} not
          detected in your upload. You can proceed, but Build and Quote results
          may be limited — re-upload with the missing sheets (e.g. elevations or
          a schedule of finishes) for the most complete analysis.
        </div>
      )}
    </div>
  );
}
