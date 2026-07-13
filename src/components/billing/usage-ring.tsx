"use client";

interface UsageRingProps {
  used: number;
  limit: number;
  label?: string;
}

export function UsageRing({ used, limit, label = "runs used" }: UsageRingProps) {
  const percentage = limit > 0 ? Math.min((used / limit) * 100, 100) : 0;
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Colour thresholds: emerald < 80%, amber 80-99%, red 100%
  let strokeColor = "stroke-brandgreen-400";
  let textColor = "text-brandgreen-400";
  if (percentage >= 100) {
    strokeColor = "stroke-red-400";
    textColor = "text-red-400";
  } else if (percentage >= 80) {
    strokeColor = "stroke-amber-400";
    textColor = "text-amber-400";
  }

  return (
    <div
      className="flex flex-col items-center gap-2"
      role="progressbar"
      aria-valuenow={used}
      aria-valuemax={limit}
      aria-label={`${used} of ${limit} compliance ${label}`}
    >
      <div className="relative w-36 h-36">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
          {/* Background ring */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-slate-200"
          />
          {/* Progress ring */}
          <circle
            cx="70"
            cy="70"
            r={radius}
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            className={`${strokeColor} transition-all duration-500`}
            style={{
              strokeDasharray: circumference,
              strokeDashoffset,
            }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${textColor}`}>
            {used}/{limit}
          </span>
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
      </div>
      {percentage >= 80 && percentage < 100 && (
        <p className="text-sm text-amber-500 font-medium">Almost at limit</p>
      )}
      {percentage >= 100 && (
        <p className="text-sm text-red-500 font-medium">
          Limit reached — <a href="/billing" className="underline">upgrade</a>
        </p>
      )}
    </div>
  );
}
