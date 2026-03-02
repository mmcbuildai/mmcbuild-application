const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  awaiting: { label: "Awaiting", className: "bg-yellow-100 text-yellow-800" },
  acknowledged: { label: "Acknowledged", className: "bg-blue-100 text-blue-800" },
  in_progress: { label: "In Progress", className: "bg-orange-100 text-orange-800" },
  completed: { label: "Completed", className: "bg-green-100 text-green-800" },
  disputed: { label: "Disputed", className: "bg-red-100 text-red-800" },
};

export function RemediationBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status];
  if (!config) return null;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${config.className}`}
    >
      {config.label}
    </span>
  );
}
