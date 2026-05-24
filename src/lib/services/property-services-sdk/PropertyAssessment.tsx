/**
 * PropertyAssessment — Use case input + AI suitability display.
 *
 * Renders after PropertyProfile is available. Offers:
 * 1. Quick-select use case buttons (product-specific)
 * 2. Free-text input for unstructured questions
 * 3. Assessment result display
 *
 * Designed to be vendored into each product's src/lib/property-services/
 */
"use client";

import { useState } from "react";
import type { PropertyProfile, SuitabilityAssessment } from "./types";

interface PropertyAssessmentProps {
  profile: PropertyProfile;
  onAssess: (useCase: string) => Promise<SuitabilityAssessment | null>;
  assessing: boolean;
  assessment: SuitabilityAssessment | null;
  product: "f2k" | "dealfindrs" | "mmcbuild";
}

const QUICK_OPTIONS: Record<string, string[]> = {
  f2k: [
    "Build a modular home",
    "Construct a duplex",
    "Multi-unit residential development",
    "Knockdown rebuild",
  ],
  dealfindrs: [
    "Subdivide and sell lots",
    "Build and hold investment units",
    "Development feasibility analysis",
    "Land banking assessment",
  ],
  mmcbuild: [
    "Single modular home",
    "Modular duplex",
    "Multi-module residential project",
    "Relocatable / transportable dwelling",
  ],
};

export function PropertyAssessment({
  profile,
  onAssess,
  assessing,
  assessment,
  product,
}: PropertyAssessmentProps) {
  const [customInput, setCustomInput] = useState("");
  const options = QUICK_OPTIONS[product] || QUICK_OPTIONS.f2k;

  function handleQuickSelect(useCase: string) {
    onAssess(useCase);
  }

  function handleSubmit() {
    if (customInput.trim()) {
      onAssess(customInput.trim());
    }
  }

  return (
    <div className="space-y-3">
      {/* Use case input — only show if no assessment yet */}
      {!assessment && !assessing && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-800">
            What do you want to do with this property?
          </p>

          {/* Quick options */}
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => handleQuickSelect(opt)}
                className="px-3 py-1.5 text-xs font-medium rounded-full border border-blue-300 bg-white text-blue-700 hover:bg-blue-100 transition-colors"
              >
                {opt}
              </button>
            ))}
          </div>

          {/* Free text */}
          <div className="flex gap-2">
            <input
              type="text"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder="Or describe your use case / ask a question..."
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!customInput.trim()}
              className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Assess
            </button>
          </div>
        </div>
      )}

      {/* Loading state */}
      {assessing && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
          <span className="text-sm text-blue-700">Analysing suitability against zoning and planning rules...</span>
        </div>
      )}

      {/* Assessment result */}
      {assessment && !assessing && (
        <div className={`rounded-lg border p-4 space-y-3 ${
          assessment.suitable
            ? "border-emerald-200 bg-emerald-50/50"
            : "border-amber-200 bg-amber-50/50"
        }`}>
          {/* Verdict */}
          <div className="flex items-start gap-2">
            <span className={`mt-0.5 text-lg ${assessment.suitable ? "text-emerald-600" : "text-amber-600"}`}>
              {assessment.suitable ? "✓" : "⚠"}
            </span>
            <div>
              <p className={`text-sm font-semibold ${assessment.suitable ? "text-emerald-800" : "text-amber-800"}`}>
                {assessment.suitable ? "Suitable" : "Potential Issues"} — {assessment.confidence} confidence
              </p>
              <p className="text-sm text-gray-700 mt-1">{assessment.verdict}</p>
            </div>
          </div>

          {/* Zoning compatibility */}
          <div className="border-t pt-2">
            <p className="text-xs font-semibold text-gray-600 mb-1">Zoning Compatibility</p>
            <p className="text-sm text-gray-700">{assessment.zoningCompatibility.details}</p>
            {assessment.zoningCompatibility.permittedAs && (
              <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                assessment.zoningCompatibility.permittedAs === "as_of_right"
                  ? "bg-emerald-100 text-emerald-700"
                  : assessment.zoningCompatibility.permittedAs === "not_permitted"
                  ? "bg-red-100 text-red-700"
                  : "bg-amber-100 text-amber-700"
              }`}>
                {assessment.zoningCompatibility.permittedAs.replace(/_/g, " ")}
              </span>
            )}
          </div>

          {/* Overlay impacts */}
          {assessment.overlayImpacts.length > 0 && (
            <div className="border-t pt-2">
              <p className="text-xs font-semibold text-gray-600 mb-1">Overlay Impacts</p>
              <div className="space-y-1">
                {assessment.overlayImpacts.map((oi, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 text-xs px-1.5 py-0.5 rounded font-medium ${
                      oi.impact === "blocking" ? "bg-red-100 text-red-700"
                        : oi.impact === "requires_action" ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {oi.impact.replace(/_/g, " ")}
                    </span>
                    <span className="text-gray-700">{oi.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Requirements */}
          {assessment.requirements.length > 0 && (
            <div className="border-t pt-2">
              <p className="text-xs font-semibold text-gray-600 mb-1">Requirements</p>
              <ul className="space-y-0.5">
                {assessment.requirements.map((r, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                    <span className="text-gray-400 mt-0.5">•</span> {r}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next steps */}
          {assessment.nextSteps.length > 0 && (
            <div className="border-t pt-2">
              <p className="text-xs font-semibold text-gray-600 mb-1">Next Steps</p>
              <ul className="space-y-0.5">
                {assessment.nextSteps.map((s, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1">
                    <span className="text-blue-500 mt-0.5">→</span> {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Re-assess button */}
          <div className="border-t pt-2">
            <button
              type="button"
              onClick={() => {
                setCustomInput("");
                // Parent should reset assessment — trigger with empty string signals reset
                // For now, just allow typing a new use case
              }}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Try a different use case →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
