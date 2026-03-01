import { moduleThemes, type ModuleKey } from "@/lib/module-themes";

interface ModuleHeroProps {
  module: ModuleKey;
  heading: React.ReactNode;
  description: string;
  showDemoButton?: boolean;
  previewCard?: React.ReactNode;
}

export function ModuleHero({
  module,
  heading,
  description,
  showDemoButton = false,
  previewCard,
}: ModuleHeroProps) {
  const theme = moduleThemes[module];
  const Icon = theme.icon;

  return (
    <div className={`${theme.heroGradient} -m-6 mb-6`}>
      <div className="max-w-7xl mx-auto px-6 lg:px-16 py-16 lg:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          {/* Left column — Text content */}
          <div className="space-y-6">
            {/* Badge pill */}
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/15 border border-white/25 backdrop-blur-sm">
              <Icon className="w-4 h-4 text-white" />
              <span className="text-sm font-medium text-white">
                {theme.badgeLabel}
              </span>
            </div>

            {/* Heading */}
            <h1 className="text-4xl lg:text-5xl font-extrabold italic text-white leading-tight">
              {heading}
            </h1>

            {/* Description */}
            <p className="text-lg text-white/70 max-w-lg">{description}</p>

            {/* CTA buttons */}
            {showDemoButton && (
              <div className="flex items-center gap-4">
                <button
                  className={`inline-flex items-center gap-2 px-6 py-3 rounded-full ${theme.accentBg} text-white font-medium text-sm shadow-md ${theme.accentHover} hover:shadow-lg transition-all`}
                >
                  Try Live Demo
                </button>
              </div>
            )}
          </div>

          {/* Right column — Preview card */}
          {previewCard && (
            <div className="hidden lg:block">{previewCard}</div>
          )}
        </div>
      </div>
    </div>
  );
}
