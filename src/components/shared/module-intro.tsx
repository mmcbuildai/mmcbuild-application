import { moduleThemes, type ModuleKey } from "@/lib/module-themes";

interface ModuleIntroProps {
  module: ModuleKey;
  description: string;
}

/**
 * Compact explanatory header shown at the top of each MMC module landing page.
 * Answers what the module is / what to do here / why it matters
 * (per the explanatory-header product standard). Pulls the module label, icon,
 * and accent colour from the shared module theme so it stays consistent with the
 * rest of the chrome.
 */
export function ModuleIntro({ module, description }: ModuleIntroProps) {
  const theme = moduleThemes[module];
  const Icon = theme.icon;

  return (
    <div className="flex items-start gap-3 rounded-xl border bg-muted/30 p-4 sm:p-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-background">
        <Icon className={`h-5 w-5 ${theme.accent}`} />
      </div>
      <div className="space-y-1">
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">
          {theme.label}
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}
