"use client";

/**
 * SPIKE — volumetric build-sequence storyboard.
 *
 * Shows the *process* of a volumetric (modular) build as an action across the
 * full workflow, not just the craning beat:
 *
 *   1. Site prep & set-out        — footprint marked out on bare ground
 *   2. Footings, slab & stub-ups  — slab fades in + per-module service stubs
 *   3. Crane set-up & delivery    — crane silhouette appears
 *   4..N. Crane in Module A,B,C…  — each module craned down onto the slab
 *   N+1. Inter-module stitch      — roof cap over joins + services go live
 *   N+2. External finish          — entry/deck, site greened, crane removed
 *
 * Dev-only, mounted on /build/test-3d. Module count + grid follow the plan's
 * footprint (computeModulePlacements) — the same grid the static System
 * Explorer volumetric render uses. Verification is by eye (Three.js client-side).
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  OrbitControls,
  PerspectiveCamera,
  Environment,
  ContactShadows,
} from "@react-three/drei";
import * as THREE from "three";
import {
  computeModulePlacements,
  SYSTEM_SPECS,
  type ModulePlacement,
} from "@/lib/build/system-renderer";
import type { SpatialLayout } from "@/lib/build/spatial/types";

const SKIN_COLOR = 0xb9c4cf; // cool steel module skin (matches the static render)
const ACCENT = SYSTEM_SPECS.volumetric.accent; // amber module edge

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

// ----------------------------------------------------------------------------
// Phase model — site prep + per-module install + stitch + finish
// ----------------------------------------------------------------------------

interface PhaseWindow {
  id: string;
  label: string;
  index: number;
  start: number;
  end: number;
}

function buildPhases(moduleCount: number): PhaseWindow[] {
  const defs: { id: string; label: string; w: number }[] = [
    { id: "site", label: "Site prep & set-out", w: 1 },
    { id: "slab", label: "Footings, slab & service stub-ups", w: 1.1 },
    { id: "crane", label: "Crane set-up & delivery", w: 0.7 },
  ];
  for (let i = 0; i < moduleCount; i++) {
    defs.push({
      id: `mod${i}`,
      label: `Crane in Module ${String.fromCharCode(65 + i)}`,
      w: 1,
    });
  }
  defs.push({ id: "stitch", label: "Inter-module stitch & weatherproof", w: 1.1 });
  defs.push({ id: "finish", label: "External finish & site reinstatement", w: 1.1 });

  const totalW = defs.reduce((s, d) => s + d.w, 0);
  let acc = 0;
  return defs.map((d, i) => {
    const start = acc / totalW;
    acc += d.w;
    return { id: d.id, label: d.label, index: i, start, end: acc / totalW };
  });
}

function phaseById(phases: PhaseWindow[], id: string): PhaseWindow | undefined {
  return phases.find((p) => p.id === id);
}
function localT(phases: PhaseWindow[], progress: number, id: string): number {
  const w = phaseById(phases, id);
  if (!w) return 0;
  return clamp01((progress - w.start) / (w.end - w.start));
}
function reached(phases: PhaseWindow[], progress: number, id: string): boolean {
  const w = phaseById(phases, id);
  return w ? progress >= w.start : false;
}
function passed(phases: PhaseWindow[], progress: number, id: string): boolean {
  const w = phaseById(phases, id);
  return w ? progress >= w.end : false;
}

// ----------------------------------------------------------------------------
// Module
// ----------------------------------------------------------------------------

function ModuleBox({
  placement,
  dropT,
}: {
  placement: ModulePlacement;
  dropT: number;
}) {
  const skinMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: SKIN_COLOR,
        roughness: 0.6,
        metalness: 0.15,
        transparent: true,
        opacity: 0.55,
      }),
    [],
  );
  const geo = useMemo(
    () => new THREE.BoxGeometry(placement.w, placement.boxH, placement.d),
    [placement.w, placement.boxH, placement.d],
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);

  if (dropT <= 0) return null;

  const ease = easeOutCubic(dropT);
  const dropFrom = placement.boxH * 6;
  const remaining = (1 - ease) * dropFrom;
  const y = placement.boxH / 2 + remaining;
  const active = dropT > 0 && dropT < 1;

  return (
    <group position={[placement.cx, y, placement.cz]}>
      <mesh geometry={geo} material={skinMat} castShadow />
      <lineSegments geometry={edges}>
        <lineBasicMaterial
          color={active ? "#ffffff" : ACCENT}
          transparent
          opacity={active ? 1 : 0.9}
        />
      </lineSegments>
      {/* Crane cable while descending — top stays ~fixed, shrinks as it lands */}
      {active && remaining > 0.1 && (
        <mesh position={[0, placement.boxH / 2 + remaining / 2, 0]}>
          <cylinderGeometry args={[0.04, 0.04, remaining, 6]} />
          <meshBasicMaterial color="#444444" />
        </mesh>
      )}
    </group>
  );
}

// ----------------------------------------------------------------------------
// Scene
// ----------------------------------------------------------------------------

function Scene({
  layout,
  progress,
  phases,
}: {
  layout: SpatialLayout;
  progress: number;
  phases: PhaseWindow[];
}) {
  const { width, depth } = layout.bounds;
  const wallHeight = layout.wall_height || 2.4;
  const placements = useMemo(
    () => computeModulePlacements(layout, wallHeight),
    [layout, wallHeight],
  );
  const boxH = wallHeight + 0.25;
  const maxDim = Math.max(width, depth);
  const camDist = maxDim * 1.8;

  const slabShown = reached(phases, progress, "slab");
  const slabT = easeOutCubic(localT(phases, progress, "slab"));
  const outlineShown = !passed(phases, progress, "slab");
  const outlineOpacity = (1 - slabT) * 0.9;
  const servicesLive = reached(phases, progress, "stitch");
  const craneShown =
    reached(phases, progress, "crane") && !reached(phases, progress, "finish");
  const stitchT = easeOutCubic(localT(phases, progress, "stitch"));
  const finishT = easeOutCubic(localT(phases, progress, "finish"));

  const groundColor = useMemo(
    () => new THREE.Color("#e8e4dc").lerp(new THREE.Color("#cfe3c4"), finishT),
    [finishT],
  );

  const tape = 0.08; // set-out tape width

  return (
    <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true }}>
      <Suspense fallback={null}>
        <PerspectiveCamera
          makeDefault
          position={[camDist, camDist * 0.85, camDist]}
          fov={42}
        />
        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={maxDim * 0.5}
          maxDistance={camDist * 3}
          target={[0, maxDim * 0.12, 0]}
        />
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[maxDim * 1.2, maxDim * 2, maxDim * 0.6]}
          intensity={1.0}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight
          position={[-maxDim, maxDim * 1.5, -maxDim * 0.6]}
          intensity={0.25}
        />
        <Environment preset="city" />
        <ContactShadows
          position={[0, 0.004, 0]}
          opacity={0.4}
          scale={maxDim * 3}
          blur={2.5}
          far={maxDim}
          resolution={512}
        />

        {/* Ground (centred at origin) */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
          <planeGeometry args={[maxDim * 3.5, maxDim * 3.5]} />
          <meshStandardMaterial color={`#${groundColor.getHexString()}`} roughness={1} />
        </mesh>

        {/* Everything below in layout space, centred to the origin */}
        <group position={[-width / 2, 0, -depth / 2]}>
          {/* 1 · Set-out tape (fades as the slab arrives) */}
          {outlineShown && (
            <group>
              {[
                { x: width / 2, z: 0, w: width, d: tape },
                { x: width / 2, z: depth, w: width, d: tape },
                { x: 0, z: depth / 2, w: tape, d: depth },
                { x: width, z: depth / 2, w: tape, d: depth },
              ].map((s, i) => (
                <mesh key={i} position={[s.x, 0.02, s.z]}>
                  <boxGeometry args={[s.w, 0.02, s.d]} />
                  <meshBasicMaterial
                    color="#d8a24a"
                    transparent
                    opacity={outlineOpacity}
                  />
                </mesh>
              ))}
            </group>
          )}

          {/* 2 · Slab + per-module service stub-ups */}
          {slabShown && (
            <group>
              <mesh position={[width / 2, -0.075, depth / 2]} receiveShadow>
                <boxGeometry args={[width + 0.6, 0.15, depth + 0.6]} />
                <meshStandardMaterial
                  color="#cfc8bc"
                  roughness={0.95}
                  transparent
                  opacity={slabT}
                />
              </mesh>
              {placements.map((p, i) => (
                <group key={i}>
                  {/* water/waste stub */}
                  <mesh position={[p.cx - 0.25, 0.15, p.cz]}>
                    <cylinderGeometry args={[0.06, 0.06, 0.3, 8]} />
                    <meshStandardMaterial
                      color="#2b6cb0"
                      emissive={servicesLive ? "#2b6cb0" : "#000000"}
                      emissiveIntensity={servicesLive ? 0.9 : 0}
                    />
                  </mesh>
                  {/* electrical stub */}
                  <mesh position={[p.cx + 0.25, 0.15, p.cz]}>
                    <cylinderGeometry args={[0.06, 0.06, 0.3, 8]} />
                    <meshStandardMaterial
                      color="#f59e0b"
                      emissive={servicesLive ? "#f59e0b" : "#000000"}
                      emissiveIntensity={servicesLive ? 0.9 : 0}
                    />
                  </mesh>
                </group>
              ))}
            </group>
          )}

          {/* 4..N · Modules crane in, one per phase */}
          {placements.map((p, i) => (
            <ModuleBox
              key={i}
              placement={p}
              dropT={localT(phases, progress, `mod${i}`)}
            />
          ))}

          {/* N+1 · Stitch: roof cap fades in over the joined modules */}
          {reached(phases, progress, "stitch") && (
            <mesh position={[width / 2, boxH + 0.06, depth / 2]} castShadow>
              <boxGeometry args={[width + 0.2, 0.12, depth + 0.2]} />
              <meshStandardMaterial
                color="#3f4651"
                roughness={0.7}
                metalness={0.2}
                transparent
                opacity={stitchT}
              />
            </mesh>
          )}

          {/* N+2 · Finish: entry deck appears */}
          {reached(phases, progress, "finish") && (
            <mesh position={[width / 2, 0.1, depth + 0.7]}>
              <boxGeometry args={[Math.min(2.4, width * 0.5), 0.2, 1.2]} />
              <meshStandardMaterial
                color="#b07a43"
                roughness={0.8}
                transparent
                opacity={finishT}
              />
            </mesh>
          )}

          {/* 3 · Crane silhouette (mast + jib), removed at finish */}
          {craneShown && (
            <group position={[width + 1.6, 0, depth * 0.5]}>
              <mesh position={[0, boxH * 1.6, 0]}>
                <boxGeometry args={[0.22, boxH * 3.2, 0.22]} />
                <meshStandardMaterial color="#555c63" metalness={0.3} roughness={0.6} />
              </mesh>
              <mesh position={[-width * 0.4, boxH * 3.1, 0]}>
                <boxGeometry args={[width * 0.9, 0.16, 0.16]} />
                <meshStandardMaterial color="#555c63" metalness={0.3} roughness={0.6} />
              </mesh>
            </group>
          )}
        </group>
      </Suspense>
    </Canvas>
  );
}

// ----------------------------------------------------------------------------
// Component
// ----------------------------------------------------------------------------

export function VolumetricBuildSequence({ layout }: { layout: SpatialLayout }) {
  const wallHeight = layout.wall_height || 2.4;
  const placements = useMemo(
    () => computeModulePlacements(layout, wallHeight),
    [layout, wallHeight],
  );
  const phases = useMemo(() => buildPhases(placements.length), [placements.length]);

  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const progressRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);

  // Pace the whole storyboard so each phase is readable.
  const durationMs = Math.max(9000, phases.length * 1600);

  const setProgressBoth = (v: number) => {
    progressRef.current = v;
    setProgress(v);
  };

  useEffect(() => {
    if (!playing) {
      lastTsRef.current = null;
      return;
    }
    let raf = 0;
    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      const np = Math.min(1, progressRef.current + dt / durationMs);
      progressRef.current = np;
      setProgress(np);
      if (np >= 1) {
        setPlaying(false); // async (rAF) callback — stops at the end
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, durationMs]);

  const current =
    phases.find((p) => progress < p.end) ?? phases[phases.length - 1];
  const atEnd = progress >= 1;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p className="font-medium">
          Spike — volumetric build sequence (full workflow)
        </p>
        <p className="mt-1">
          Shows the build as an <strong>action</strong> across the whole
          workflow: set-out → slab + service stubs → crane → modules craned in
          one by one → stitch &amp; weatherproof → finish. Module count follows
          the plan&apos;s footprint. Orbit to look around; play or scrub.
        </p>
      </div>

      <div className="h-[480px] overflow-hidden rounded-lg border bg-gradient-to-b from-sky-100 to-white">
        <Scene layout={layout} progress={progress} phases={phases} />
      </div>

      {/* Phase label + segmented timeline */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-zinc-700">
          Phase {current.index + 1} / {phases.length} —{" "}
          <span className="text-amber-700">{current.label}</span>
        </p>
        <div className="flex gap-1">
          {phases.map((p) => {
            const fill = clamp01((progress - p.start) / (p.end - p.start));
            return (
              <div
                key={p.id}
                className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200"
                title={p.label}
              >
                <div
                  className="h-full rounded-full bg-amber-500 transition-[width] duration-100"
                  style={{ width: `${fill * 100}%` }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-zinc-50 px-4 py-3 text-sm">
        <button
          type="button"
          onClick={() => {
            if (atEnd) setProgressBoth(0);
            setPlaying((p) => !p);
          }}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
        >
          {playing ? "Pause" : atEnd ? "Replay" : "Play"}
        </button>
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            setProgressBoth(0);
          }}
          className="rounded-md border px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Reset
        </button>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(progress * 1000)}
          onChange={(e) => {
            setPlaying(false);
            setProgressBoth(Number(e.target.value) / 1000);
          }}
          className="h-1.5 flex-1 min-w-[160px] cursor-pointer accent-amber-500"
          aria-label="Build sequence progress"
        />
      </div>
    </div>
  );
}
