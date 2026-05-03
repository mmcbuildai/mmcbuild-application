import { PlayCircle } from "lucide-react";
import { moduleThemes, type ModuleKey } from "@/lib/module-themes";

interface ExplainerBullet {
  heading: string;
  body: string;
}

interface ExplainerVideoProps {
  module: ModuleKey;
  title: string;
  description: string;
  bullets: ExplainerBullet[];
  /** Optional embed URL (YouTube/Vimeo/Mux). When omitted, shows placeholder. */
  videoUrl?: string;
}

export function ExplainerVideo({
  module,
  title,
  description,
  bullets,
  videoUrl,
}: ExplainerVideoProps) {
  const theme = moduleThemes[module];

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div
        className={`relative aspect-video w-full ${theme.heroGradient} flex items-center justify-center`}
      >
        {videoUrl ? (
          <iframe
            src={videoUrl}
            title={title}
            className="absolute inset-0 h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        ) : (
          <div className="flex flex-col items-center gap-3 text-white/90">
            <PlayCircle className="h-14 w-14 opacity-70" strokeWidth={1.25} />
            <span className="rounded-full bg-white/15 border border-white/25 px-3 py-1 text-xs font-medium uppercase tracking-wide backdrop-blur-sm">
              Explainer video coming soon
            </span>
          </div>
        )}
      </div>

      <div className="p-5 space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {bullets.map((b) => (
            <div
              key={b.heading}
              className="rounded-md border bg-muted/30 p-3 space-y-1"
            >
              <p className={`text-xs font-semibold uppercase tracking-wide ${theme.accent}`}>
                {b.heading}
              </p>
              <p className="text-sm text-muted-foreground leading-snug">
                {b.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
