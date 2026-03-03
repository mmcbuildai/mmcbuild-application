interface ProgressBarProps {
  value: number;
  className?: string;
}

export function ProgressBar({ value, className }: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));

  return (
    <div className={`flex items-center gap-3 ${className ?? ""}`}>
      <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 transition-all duration-300"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs font-medium text-muted-foreground min-w-[3ch] text-right">
        {clamped}%
      </span>
    </div>
  );
}
