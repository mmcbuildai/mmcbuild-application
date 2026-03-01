import { ShieldCheck, CheckCircle, XCircle } from "lucide-react";

const complianceRows = [
  { label: "NCC Volume 1", passed: true },
  { label: "NCC Volume 2", passed: true },
  { label: "Fire Safety", passed: false, issues: 1 },
  { label: "Structural", passed: true },
  { label: "Energy Efficiency", passed: true },
];

export function ComplyPreviewCard() {
  return (
    <div className="bg-white/[0.08] border border-white/15 rounded-2xl backdrop-blur-xl p-6 shadow-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <ShieldCheck className="w-5 h-5 text-white/70" />
        <span className="text-base font-medium text-white/90">
          Live Compliance Check
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-green-400 text-xs font-medium">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          Live
        </span>
      </div>

      {/* Rows */}
      <div className="space-y-3">
        {complianceRows.map((row) => (
          <div
            key={row.label}
            className="bg-white/[0.06] border border-white/10 rounded-xl px-5 py-4 flex justify-between items-center"
          >
            <span className="text-sm font-medium text-white">{row.label}</span>
            {row.passed ? (
              <span className="flex items-center gap-1.5 text-sm font-medium text-green-400">
                <CheckCircle className="w-4 h-4" />
                Passed
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm font-medium text-red-400">
                <XCircle className="w-4 h-4" />
                {row.issues} Issue{row.issues !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
