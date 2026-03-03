import Link from "next/link";
import {
  CheckCircle,
  Circle,
  Upload,
  ClipboardList,
  Users,
  FileCheck,
} from "lucide-react";

interface ReadinessIndicatorsProps {
  projectId: string;
  hasPlans: boolean;
  hasQuestionnaire: boolean;
  contributorCount: number;
  certificationCount: number;
}

export function ReadinessIndicators({
  projectId,
  hasPlans,
  hasQuestionnaire,
  contributorCount,
  certificationCount,
}: ReadinessIndicatorsProps) {
  const items = [
    {
      label: "Plans uploaded",
      ready: hasPlans,
      required: true,
      icon: Upload,
      href: `/projects/${projectId}?tab=documents`,
    },
    {
      label: "Questionnaire completed",
      ready: hasQuestionnaire,
      required: true,
      icon: ClipboardList,
      href: `/projects/${projectId}?tab=questionnaire`,
    },
    {
      label: `${certificationCount} certification${certificationCount !== 1 ? "s" : ""}`,
      ready: certificationCount > 0,
      required: false,
      icon: FileCheck,
      href: `/projects/${projectId}?tab=documents`,
    },
    {
      label: `${contributorCount} contributor${contributorCount !== 1 ? "s" : ""}`,
      ready: contributorCount > 0,
      required: false,
      icon: Users,
      href: `/projects/${projectId}?tab=team`,
    },
  ];

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/50 transition-colors"
        >
          {item.ready ? (
            <CheckCircle className="h-4 w-4 shrink-0 text-green-600" />
          ) : (
            <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={item.ready ? "" : "text-muted-foreground"}>
            {item.label}
          </span>
          {item.required && !item.ready && (
            <span className="ml-auto text-xs text-orange-600">Required</span>
          )}
        </Link>
      ))}
    </div>
  );
}
