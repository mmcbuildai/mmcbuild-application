"use client";

import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  PerspectiveCamera,
  Environment,
  ContactShadows,
} from "@react-three/drei";
import {
  buildFloorPlan3DForSystem,
  SYSTEM_SPECS,
  SYSTEM_METRICS,
  type MMCSystem,
  type TraditionalVariant,
} from "@/lib/build/system-renderer";
import type { SpatialLayout } from "@/lib/build/spatial/types";

const SYSTEMS: MMCSystem[] = [
  "traditional",
  "panelised",
  "volumetric",
  "printed",
];

function SystemCanvas({
  layout,
  system,
  variant = "brick-veneer",
}: {
  layout: SpatialLayout;
  system: MMCSystem;
  variant?: TraditionalVariant;
}) {
  const sceneGroup = useMemo(
    () => buildFloorPlan3DForSystem(layout, system, variant),
    [layout, system, variant],
  );
  const maxDim = Math.max(layout.bounds.width, layout.bounds.depth);
  const camDist = maxDim * 1.4;

  return (
    <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true }}>
      <Suspense fallback={null}>
        <PerspectiveCamera
          makeDefault
          position={[camDist, camDist * 0.7, camDist]}
          fov={40}
        />
        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={maxDim * 0.5}
          maxDistance={camDist * 3}
          target={[0, maxDim * 0.15, 0]}
        />
        {/* Clay aesthetic substrate */}
        <ambientLight intensity={0.35} />
        <directionalLight
          position={[maxDim * 1.2, maxDim * 2, maxDim * 0.6]}
          intensity={1.0}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
          shadow-camera-left={-maxDim}
          shadow-camera-right={maxDim}
          shadow-camera-top={maxDim}
          shadow-camera-bottom={-maxDim}
        />
        <directionalLight
          position={[-maxDim, maxDim * 1.5, -maxDim * 0.6]}
          intensity={0.25}
        />
        <Environment preset="city" />
        <ContactShadows
          position={[0, 0.005, 0]}
          opacity={0.45}
          scale={maxDim * 2.5}
          blur={2.5}
          far={maxDim}
          resolution={512}
        />
        <primitive object={sceneGroup} />
      </Suspense>
    </Canvas>
  );
}

export function SystemExplorerView({ layout }: { layout: SpatialLayout }) {
  const [traditionalVariant, setTraditionalVariant] =
    useState<TraditionalVariant>("brick-veneer");
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p className="font-medium">
          Indicative — subject to MMC Build confirmation
        </p>
        <p className="mt-1">
          Numbers shown for each system are AU-residential rules of thumb. Cost /
          time / labour deltas will be replaced with MMC Build&apos;s confirmed
          figures in v0.5.x. Use this view to compare what each MMC system means
          for <strong>your</strong> design before choosing one.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {SYSTEMS.map((sys) => {
          const spec = SYSTEM_SPECS[sys];
          const metrics = SYSTEM_METRICS[sys];
          return (
            <div
              key={sys}
              className="overflow-hidden rounded-lg border bg-white shadow-sm"
              style={{
                borderTopColor: spec.accent,
                borderTopWidth: 3,
              }}
            >
              <div
                className="border-b px-4 py-3"
                style={{ backgroundColor: `${spec.accent}12` }}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3
                    className="text-base font-semibold"
                    style={{ color: spec.accent }}
                  >
                    {spec.label}
                  </h3>
                  <span className="text-[11px] uppercase tracking-wide text-zinc-500">
                    {spec.subtitle}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-600">{spec.tagline}</p>
                {sys === "traditional" && (
                  <div className="mt-2 inline-flex rounded-md border bg-white p-0.5 text-[11px]">
                    {(
                      [
                        ["brick-veneer", "Brick veneer"],
                        ["masonry", "Double brick / block"],
                      ] as [TraditionalVariant, string][]
                    ).map(([v, label]) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setTraditionalVariant(v)}
                        className={`rounded px-2 py-0.5 transition-colors ${
                          traditionalVariant === v
                            ? "bg-zinc-900 text-white"
                            : "text-zinc-600 hover:text-zinc-900"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="h-[320px] bg-gradient-to-b from-zinc-100 to-white">
                <SystemCanvas
                  layout={layout}
                  system={sys}
                  variant={sys === "traditional" ? traditionalVariant : "brick-veneer"}
                />
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t bg-zinc-50/50 px-4 py-3 text-xs">
                <div>
                  <div className="text-zinc-500">Cost vs traditional</div>
                  <div className="font-semibold text-zinc-900">
                    {metrics.capex_delta}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500">Time to lockup</div>
                  <div className="font-semibold text-zinc-900">
                    {metrics.time_to_lockup_weeks}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500">On-site labour reduction</div>
                  <div className="font-semibold text-zinc-900">
                    {metrics.onsite_labour_reduction}
                  </div>
                </div>
                <div>
                  <div className="text-zinc-500">Transport / access</div>
                  <div className="font-semibold text-zinc-900">
                    {metrics.transport}
                  </div>
                </div>
              </div>

              <div className="space-y-2 border-t px-4 py-3 text-xs">
                <div>
                  <p className="font-medium text-emerald-700">Pros</p>
                  <ul className="mt-1 space-y-0.5 list-disc pl-4 text-zinc-700">
                    {metrics.pros.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="font-medium text-rose-700">Cons</p>
                  <ul className="mt-1 space-y-0.5 list-disc pl-4 text-zinc-700">
                    {metrics.cons.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </div>
                {metrics.suitability.length > 0 && (
                  <div>
                    <p className="font-medium text-zinc-700">Suitability</p>
                    <ul className="mt-1 space-y-0.5 list-disc pl-4 text-zinc-700">
                      {metrics.suitability.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-3 text-xs text-zinc-600">
        <p className="font-medium text-zinc-800">Coming soon — Hybrid</p>
        <p className="mt-1">
          Mix systems where it matters most: e.g. concrete slab + panelised
          walls + modular wet-area pods. The Hybrid configurator will let you
          assign a system per building element.
        </p>
      </div>
    </div>
  );
}
