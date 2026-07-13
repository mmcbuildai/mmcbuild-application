"use client";

import { useState, useMemo, Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Html, Grid } from "@react-three/drei";
import {
  buildFloorPlan3D,
  buildSuggestionHighlight,
  getStoreyBaseElevation,
  getTopStoreyIndex,
  type SpatialLayout,
  type SuggestionOverlay,
} from "@/lib/build/spatial";

// Storey index → human label. 0 = Ground, 1 = First, etc.
function storeyLabel(index: number): string {
  const ordinals = ["Ground", "First", "Second", "Third", "Fourth", "Fifth"];
  return ordinals[index] ?? `Level ${index}`;
}

// ============================================
// Mobile detection
// ============================================

function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return isMobile;
}

// ============================================
// Sub-components rendered inside Canvas
// ============================================

function BuildingModel({
  layout,
  storeyFilter,
}: {
  layout: SpatialLayout;
  storeyFilter: number | null;
}) {
  const group = useMemo(
    () => buildFloorPlan3D(layout, { storeyFilter }),
    [layout, storeyFilter],
  );
  return <primitive object={group} />;
}

function SuggestionHighlights({
  overlays,
  layout,
}: {
  overlays: SuggestionOverlay[];
  layout: SpatialLayout;
}) {
  return (
    <>
      {overlays.map((overlay) => {
        const colour = parseInt(overlay.colour.replace("#", ""), 16);
        const group = buildSuggestionHighlight(
          overlay.affected_wall_ids,
          layout,
          colour,
          overlay.opacity ?? 0.35
        );
        return <primitive key={overlay.id} object={group} />;
      })}
    </>
  );
}

function RoomLabels({
  layout,
  storeyFilter,
}: {
  layout: SpatialLayout;
  storeyFilter: number | null;
}) {
  const centreX = layout.bounds.width / 2;
  const centreZ = layout.bounds.depth / 2;

  return (
    <>
      {layout.rooms.map((room) => {
        const storey = room.floor_level ?? 0;
        if (storeyFilter !== null && storey !== storeyFilter) return null;
        // Calculate room centre from polygon
        const cx =
          room.polygon.reduce((s, p) => s + p.x, 0) / room.polygon.length - centreX;
        const cz =
          room.polygon.reduce((s, p) => s + p.y, 0) / room.polygon.length - centreZ;
        // Float the label just above this storey's floor slab.
        const cy = getStoreyBaseElevation(layout, storey) + 0.1;

        return (
          <Html
            key={room.id}
            position={[cx, cy, cz]}
            center
            distanceFactor={15}
            style={{ pointerEvents: "none" }}
          >
            <div className="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-zinc-700 shadow-sm whitespace-nowrap">
              {room.name}
              {room.area_m2 ? (
                <span className="ml-1 text-zinc-400">
                  {room.area_m2.toFixed(0)}m²
                </span>
              ) : null}
            </div>
          </Html>
        );
      })}
    </>
  );
}

function SceneSetup({ layout, isMobile }: { layout: SpatialLayout; isMobile: boolean }) {
  const maxDim = Math.max(layout.bounds.width, layout.bounds.depth);
  const cameraDistance = maxDim * 1.2;

  return (
    <>
      <PerspectiveCamera
        makeDefault
        position={[cameraDistance, cameraDistance * 0.8, cameraDistance]}
        fov={45}
      />
      <OrbitControls
        enableDamping
        dampingFactor={0.1}
        maxPolarAngle={Math.PI / 2.1}
        minDistance={2}
        maxDistance={cameraDistance * 3}
        enablePan
        enableZoom
        enableRotate
      />
      <ambientLight intensity={0.6} />
      {/* disable post-processing on mobile — GPU budget */}
      <directionalLight
        position={[maxDim, maxDim * 1.5, maxDim * 0.5]}
        intensity={0.8}
        castShadow={!isMobile}
        shadow-mapSize-width={isMobile ? 0 : 1024}
        shadow-mapSize-height={isMobile ? 0 : 1024}
      />
      <directionalLight position={[-maxDim, maxDim, -maxDim]} intensity={0.3} />
      <Grid
        args={[50, 50]}
        cellSize={1}
        sectionSize={5}
        fadeDistance={30}
        position={[0, -0.01, 0]}
        cellColor="#e0e0e0"
        sectionColor="#c0c0c0"
      />
    </>
  );
}

// ============================================
// Main exported component
// ============================================

interface PlanViewer3DProps {
  layout: SpatialLayout;
  suggestions?: SuggestionOverlay[];
  className?: string;
  label?: string;
}

export function PlanViewer3D({
  layout,
  suggestions = [],
  className = "",
  label,
}: PlanViewer3DProps) {
  const [showLabels, setShowLabels] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [storeyFilter, setStoreyFilter] = useState<number | null>(null);
  const isMobile = useIsMobile();

  const topStorey = getTopStoreyIndex(layout);
  const isMultiStorey = topStorey >= 1;

  return (
    <div className={`relative rounded-lg border bg-zinc-50 ${className}`}>
      {/* Header bar */}
      <div className="flex items-center justify-between border-b bg-white px-3 py-2 rounded-t-lg">
        <span className="text-sm font-medium text-zinc-700">{label || "3D Plan View"}</span>
        <div className="flex items-center gap-2">
          {isMultiStorey && (
            <div
              role="group"
              aria-label="Storey"
              className="flex items-center rounded border border-zinc-200 bg-zinc-100 p-0.5"
            >
              {[null, ...Array.from({ length: topStorey + 1 }, (_, i) => i)].map(
                (level) => {
                  const selected = storeyFilter === level;
                  return (
                    <button
                      key={level === null ? "all" : level}
                      onClick={() => setStoreyFilter(level)}
                      aria-pressed={selected}
                      className={`rounded px-2 py-1.5 text-xs min-h-[44px] md:min-h-0 md:py-0.5 ${
                        selected
                          ? "bg-white text-zinc-800 shadow-sm"
                          : "text-zinc-500 hover:text-zinc-700"
                      }`}
                    >
                      {level === null ? "All" : storeyLabel(level)}
                    </button>
                  );
                },
              )}
            </div>
          )}
          <button
            onClick={() => setShowLabels(!showLabels)}
            className={`rounded px-3 py-1.5 text-xs min-h-[44px] md:min-h-0 md:px-2 md:py-0.5 ${
              showLabels
                ? "bg-zinc-200 text-zinc-800"
                : "bg-zinc-100 text-zinc-400"
            }`}
          >
            Labels
          </button>
          {suggestions.length > 0 && (
            <button
              onClick={() => setShowSuggestions(!showSuggestions)}
              className={`rounded px-3 py-1.5 text-xs min-h-[44px] md:min-h-0 md:px-2 md:py-0.5 ${
                showSuggestions
                  ? "bg-brand-100 text-brand-800"
                  : "bg-zinc-100 text-zinc-400"
              }`}
            >
              Suggestions
            </button>
          )}
        </div>
      </div>

      {/* Canvas — sizes off parent; fixed height only kicks in at md+ */}
      <div className="h-[60vh] sm:h-[70vh] md:h-[500px] w-full">
        <Canvas shadows={!isMobile}>
          <Suspense fallback={null}>
            <SceneSetup layout={layout} isMobile={isMobile} />
            <BuildingModel layout={layout} storeyFilter={storeyFilter} />
            {showLabels && (
              <RoomLabels layout={layout} storeyFilter={storeyFilter} />
            )}
            {showSuggestions && suggestions.length > 0 && (
              <SuggestionHighlights overlays={suggestions} layout={layout} />
            )}
          </Suspense>
        </Canvas>
      </div>

      {/* Footer — confidence + controls hint (touch-aware) */}
      <div className="flex flex-wrap items-center justify-between gap-1 border-t bg-white px-3 py-2 rounded-b-lg text-xs text-zinc-500">
        <span>
          Confidence: {(layout.confidence * 100).toFixed(0)}%
          {layout.notes && ` — ${layout.notes}`}
        </span>
        <span className="hidden md:inline">Scroll to zoom · Drag to rotate · Right-drag to pan</span>
        <span className="md:hidden">Pinch to zoom · Drag to rotate</span>
      </div>
    </div>
  );
}
