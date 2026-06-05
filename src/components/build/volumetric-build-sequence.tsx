"use client";

/**
 * SPIKE — volumetric build-sequence animation.
 *
 * Shows the *process* of a volumetric (modular) build rather than a finished
 * static model: each transportable module is craned down onto the slab in
 * sequence. This is the "show the build type as an action" direction (vs the
 * static System Explorer renders). Volumetric is the first system prototyped.
 *
 * Dev-only, mounted on /build/test-3d. Verification is by eye (Three.js renders
 * client-side). The module grid is the same partitioning the System Explorer's
 * volumetric panel uses (computeModulePlacements), so the sequence lands the
 * modules exactly where the static render shows them.
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

function ModuleBox({
  placement,
  index,
  total,
  progress,
}: {
  placement: ModulePlacement;
  index: number;
  total: number;
  progress: number;
}) {
  const per = 1 / total;
  const start = index * per;
  const dur = per * 0.8; // each module animates over 80% of its slot, then settles
  const t = clamp01((progress - start) / dur);
  const ease = easeOutCubic(t);
  const dropFrom = placement.boxH * 6; // craned down from this height
  const remaining = (1 - ease) * dropFrom;
  const y = placement.boxH / 2 + remaining;
  const arrived = progress >= start;
  const active = t > 0 && t < 1;

  const skinMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: SKIN_COLOR,
        roughness: 0.6,
        metalness: 0.15,
        transparent: true,
        opacity: 0.55, // see interior partitions through the module skin
      }),
    [],
  );
  const geo = useMemo(
    () => new THREE.BoxGeometry(placement.w, placement.boxH, placement.d),
    [placement.w, placement.boxH, placement.d],
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);

  if (!arrived) return null;

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
      {/* Crane cable while descending — top stays ~fixed in the sky, shrinks as it lands */}
      {active && remaining > 0.1 && (
        <mesh position={[0, placement.boxH / 2 + remaining / 2, 0]}>
          <cylinderGeometry args={[0.04, 0.04, remaining, 6]} />
          <meshBasicMaterial color="#444444" />
        </mesh>
      )}
    </group>
  );
}

function Scene({
  layout,
  progress,
}: {
  layout: SpatialLayout;
  progress: number;
}) {
  const { width, depth } = layout.bounds;
  const wallHeight = layout.wall_height || 2.4;
  const placements = useMemo(
    () => computeModulePlacements(layout, wallHeight),
    [layout, wallHeight],
  );
  const maxDim = Math.max(width, depth);
  const camDist = maxDim * 1.6;

  return (
    <Canvas shadows dpr={[1, 1.5]} gl={{ antialias: true }}>
      <Suspense fallback={null}>
        <PerspectiveCamera
          makeDefault
          position={[camDist, camDist * 0.8, camDist]}
          fov={42}
        />
        <OrbitControls
          enableDamping
          dampingFactor={0.1}
          maxPolarAngle={Math.PI / 2.1}
          minDistance={maxDim * 0.5}
          maxDistance={camDist * 3}
          target={[0, maxDim * 0.15, 0]}
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
          position={[0, 0.005, 0]}
          opacity={0.45}
          scale={maxDim * 2.5}
          blur={2.5}
          far={maxDim}
          resolution={512}
        />
        {/* Everything centred at the origin to match the base renderer's translation */}
        <group position={[-width / 2, 0, -depth / 2]}>
          {/* Slab the modules land on */}
          <mesh position={[width / 2, -0.075, depth / 2]} receiveShadow>
            <boxGeometry args={[width + 0.6, 0.15, depth + 0.6]} />
            <meshStandardMaterial color="#cfc8bc" roughness={0.95} />
          </mesh>
          {placements.map((p, i) => (
            <ModuleBox
              key={i}
              placement={p}
              index={i}
              total={placements.length}
              progress={progress}
            />
          ))}
        </group>
      </Suspense>
    </Canvas>
  );
}

export function VolumetricBuildSequence({ layout }: { layout: SpatialLayout }) {
  const wallHeight = layout.wall_height || 2.4;
  const total = useMemo(
    () => computeModulePlacements(layout, wallHeight).length,
    [layout, wallHeight],
  );

  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const progressRef = useRef(0); // animation source of truth (avoids stale closures)
  const lastTsRef = useRef<number | null>(null);

  // ~0.9s per module so the crane-in is readable; min 4s overall.
  const durationMs = Math.max(4000, total * 900);

  // Keep manual writes (slider / reset / replay) in sync with the ref the
  // animation reads from.
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

  const installed = Math.min(total, Math.floor(progress * total + 1e-6));
  const atEnd = progress >= 1;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p className="font-medium">
          Spike — volumetric build sequence (modules craned into place)
        </p>
        <p className="mt-1">
          Shows the build as an <strong>action</strong>, not a static model: each
          factory-finished module is lowered onto the slab in turn. Same module
          grid as the System Explorer&apos;s volumetric render. Orbit to look
          around; scrub or play to watch the assembly.
        </p>
      </div>

      <div className="h-[480px] overflow-hidden rounded-lg border bg-gradient-to-b from-sky-100 to-white">
        <Scene layout={layout} progress={progress} />
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
        <span className="tabular-nums text-xs font-medium text-zinc-700">
          {installed} / {total} modules installed
        </span>
      </div>
    </div>
  );
}
