"use client";

/**
 * Multi-system build-sequence storyboard.
 *
 * Shows each construction methodology as its real, ordered build PROCESS — a
 * labelled numbered stepper that drives a coordinated 3D build-up on the same
 * extracted footprint. Each named construction stage visibly builds in order
 * (site → slab → frame/walls/modules → roof → finish), methodology by
 * methodology:
 *   - Traditional (brick veneer) — slab → timber frame → roof → brick skin
 *   - Traditional (double brick)  — slab → masonry courses → roof
 *   - Panelised  — slab+stubs → panels tilted up → cassettes/roof
 *   - Volumetric — slab+stubs → modules craned in → stitch → roof
 *   - 3D-printed — slab+gantry → walls printed → lintels → roof
 *
 * The stepper is the source of truth for the sequence; the 3D scene renders
 * each stage from the step the timeline is currently in. Pick the system (and
 * Traditional wall type) with the selector; Play / scrub the timeline.
 *
 * Mounted on the per-project Design Optimisation Report (via BuildExplorer3D)
 * and on the /build/test-3d harness ("Build Sequence" tab).
 */

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, ContactShadows } from "@react-three/drei";
import { Check } from "lucide-react";
import * as THREE from "three";
import {
  computeModulePlacements,
  type ModulePlacement,
  type MMCSystem,
  type TraditionalVariant,
} from "@/lib/build/system-renderer";
import type { SpatialLayout } from "@/lib/build/spatial/types";
import {
  getStoreyBaseElevation,
  getTopStoreyIndex,
  getRoofBaseHeight,
} from "@/lib/build/spatial";

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// Per-system palettes (match the static System Explorer renders)
const COLORS = {
  veneerBrick: "#b0704a",
  masonryBlock: "#b8b3a8",
  masonryCourse: "#8a8378",
  timber: "#9a6b3f",
  panel: "#f2efe9",
  panelSeam: "#3a3a40",
  moduleSkin: 0xb9c4cf,
  moduleEdge: "#f59e0b",
  concrete: "#bcae98",
  concreteRidge: "#9a8e78",
  roof: "#3f4651",
  slab: "#cfc8bc",
  deck: "#b07a43",
};

// ----------------------------------------------------------------------------
// Geometry helpers
// ----------------------------------------------------------------------------

interface WallSeg {
  id: number;
  cx: number;
  cz: number;
  len: number;
  angle: number;
  height: number;
  thickness: number;
  /** Y elevation (m) of this segment's base — 0 for ground, stacked for upper storeys. */
  baseY: number;
  /** Storey index this segment belongs to (0 = ground). */
  storey: number;
}

/** Synthesise a rectangular footprint perimeter for one storey at `baseY`. */
function perimeterSegs(
  layout: SpatialLayout,
  wallHeight: number,
  storey: number,
  baseY: number,
  idBase: number,
): WallSeg[] {
  const w =
    layout.bounds?.width && layout.bounds.width > 0.5 ? layout.bounds.width : 12;
  const d =
    layout.bounds?.depth && layout.bounds.depth > 0.5 ? layout.bounds.depth : 10;
  const th = 0.12;
  return [
    { id: idBase + 0, cx: w / 2, cz: 0, len: w, angle: 0, height: wallHeight, thickness: th, baseY, storey },
    { id: idBase + 1, cx: w / 2, cz: d, len: w, angle: 0, height: wallHeight, thickness: th, baseY, storey },
    { id: idBase + 2, cx: 0, cz: d / 2, len: d, angle: Math.PI / 2, height: wallHeight, thickness: th, baseY, storey },
    { id: idBase + 3, cx: w, cz: d / 2, len: d, angle: Math.PI / 2, height: wallHeight, thickness: th, baseY, storey },
  ];
}

/**
 * External wall segments for EVERY storey, each tagged with its base elevation
 * so the sequence stacks upper floors instead of collapsing everything to the
 * ground. A storey whose extraction returned too few external walls (the common
 * "data but no geometry" case — and why a 2nd storey used to be missing here)
 * gets a synthesised footprint perimeter at its own elevation, so every storey
 * up to the roof always has a wall outline to build. Uses the same storey
 * elevation maths as the canonical 3D viewer (getStoreyBaseElevation), so the
 * build-sequence storeys line up with Compare System / Standard Model.
 */
function externalWallSegs(layout: SpatialLayout, wallHeight: number): WallSeg[] {
  const top = getTopStoreyIndex(layout);
  const out: WallSeg[] = [];
  let idc = 0;

  for (let storey = 0; storey <= top; storey++) {
    const baseY = getStoreyBaseElevation(layout, storey);
    const real = layout.walls
      .filter((w) => w.type === "external" && (w.storey ?? 0) === storey)
      .map((w) => {
        const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
        const angle = Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x);
        return {
          id: idc++,
          cx: (w.start.x + w.end.x) / 2,
          cz: (w.start.y + w.end.y) / 2,
          len,
          angle,
          height: w.height_m && w.height_m > 0 ? w.height_m : wallHeight,
          thickness: w.thickness || 0.12,
          baseY,
          storey,
        };
      })
      .filter((s) => s.len > 0.3);

    if (real.length >= 3) {
      out.push(...real);
    } else {
      const synth = perimeterSegs(layout, wallHeight, storey, baseY, idc);
      idc += synth.length;
      out.push(...synth);
    }
  }

  return out;
}

// ----------------------------------------------------------------------------
// Step model — the ordered, named construction stages per methodology.
// `stage` tells the 3D scene which element set to drive for that step.
// ----------------------------------------------------------------------------

type StageKind =
  | "site"
  | "slab"
  | "frame"
  | "panels"
  | "modules"
  | "walls"
  | "print"
  | "stitch"
  | "roof"
  | "lockup"
  | "finish";

interface StepDef {
  label: string;
  weight: number;
  stage: StageKind;
}
interface StepWindow extends StepDef {
  index: number;
  start: number;
  end: number;
}

function stepDefsFor(system: MMCSystem, variant: TraditionalVariant): StepDef[] {
  if (system === "volumetric")
    return [
      { label: "Site prep & set-out", weight: 1, stage: "site" },
      { label: "Footings & slab + service stubs", weight: 1, stage: "slab" },
      { label: "Modules craned & set in sequence", weight: 1.6, stage: "modules" },
      { label: "Modules stitched & weatherproofed", weight: 0.9, stage: "stitch" },
      { label: "Roof / parapet finish", weight: 1, stage: "roof" },
      { label: "Site connections & external finish", weight: 1, stage: "finish" },
    ];
  if (system === "panelised")
    return [
      { label: "Site prep & set-out", weight: 1, stage: "site" },
      { label: "Footings & slab + service stubs", weight: 1, stage: "slab" },
      { label: "Wall panels tilted into place", weight: 1.6, stage: "panels" },
      { label: "Floor / roof cassettes installed", weight: 1, stage: "roof" },
      { label: "Panel joints sealed, roof cover", weight: 0.8, stage: "lockup" },
      { label: "Fit-out", weight: 1, stage: "finish" },
    ];
  if (system === "printed")
    return [
      { label: "Site prep & set-out", weight: 1, stage: "site" },
      { label: "Slab + printer gantry set-up", weight: 1, stage: "slab" },
      { label: "Walls printed layer-by-layer", weight: 1.8, stage: "print" },
      { label: "Openings formed, lintels placed", weight: 0.7, stage: "lockup" },
      { label: "Roof structure & cover", weight: 1, stage: "roof" },
      { label: "Render / seal & fit-out", weight: 1, stage: "finish" },
    ];
  if (variant === "masonry")
    return [
      { label: "Site prep & set-out", weight: 1, stage: "site" },
      { label: "Footings & slab", weight: 1, stage: "slab" },
      { label: "Masonry walls laid course-by-course", weight: 1.8, stage: "walls" },
      { label: "Roof structure & cover", weight: 1, stage: "roof" },
      { label: "Lock-up", weight: 0.7, stage: "lockup" },
      { label: "Fit-out", weight: 1, stage: "finish" },
    ];
  // traditional brick veneer over timber frame (AU practice: frame → roof → brick)
  return [
    { label: "Site prep & set-out", weight: 1, stage: "site" },
    { label: "Footings & slab", weight: 1, stage: "slab" },
    { label: "Timber wall frames erected", weight: 1.2, stage: "frame" },
    { label: "Roof trusses & roof cover", weight: 1, stage: "roof" },
    { label: "Brick veneer skin laid", weight: 1.3, stage: "walls" },
    { label: "Windows / doors — lock-up", weight: 0.7, stage: "lockup" },
    { label: "Services rough-in & fit-out", weight: 1, stage: "finish" },
  ];
}

function buildSteps(defs: StepDef[]): StepWindow[] {
  const total = defs.reduce((s, d) => s + d.weight, 0);
  let acc = 0;
  return defs.map((d, i) => {
    const start = acc / total;
    acc += d.weight;
    return { ...d, index: i, start, end: acc / total };
  });
}

function stageWin(steps: StepWindow[], stage: StageKind) {
  return steps.find((s) => s.stage === stage);
}
function stageLocalT(steps: StepWindow[], progress: number, stage: StageKind): number {
  const w = stageWin(steps, stage);
  if (!w) return 0;
  return clamp01((progress - w.start) / (w.end - w.start));
}
function stageReached(steps: StepWindow[], progress: number, stage: StageKind): boolean {
  const w = stageWin(steps, stage);
  return w ? progress >= w.start : false;
}

// ----------------------------------------------------------------------------
// Animated element primitives
// ----------------------------------------------------------------------------

/** Volumetric module — craned down from above, easing onto the slab (or the
 *  storey below it for upper levels, via baseY). */
function ModuleBox({
  placement,
  t,
  baseY = 0,
}: {
  placement: ModulePlacement;
  t: number;
  baseY?: number;
}) {
  const geo = useMemo(
    () => new THREE.BoxGeometry(placement.w, placement.boxH, placement.d),
    [placement.w, placement.boxH, placement.d],
  );
  const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);
  if (t <= 0) return null;
  const ease = easeOutCubic(t);
  const remaining = (1 - ease) * placement.boxH * 3;
  const active = t > 0 && t < 1;
  const appear = clamp01(t * 2);
  return (
    <group position={[placement.cx, baseY + placement.boxH / 2 + remaining, placement.cz]}>
      {/* JSX material (opacity driven by `appear`) rather than mutating a
          memoized THREE material — keeps the r3f immutability rule happy.
          No env map (Environment removed for offline reliability) → metalness 0;
          metallic surfaces with no environment render dark. */}
      <mesh geometry={geo} castShadow>
        <meshStandardMaterial
          color={COLORS.moduleSkin}
          roughness={0.6}
          metalness={0}
          transparent
          opacity={0.6 * appear}
        />
      </mesh>
      <lineSegments geometry={edges}>
        <lineBasicMaterial
          color={active ? "#ffffff" : COLORS.moduleEdge}
          transparent
          opacity={appear}
        />
      </lineSegments>
    </group>
  );
}

/** A wall panel that rises up from the slab into place (panelised). */
function RisePanel({
  seg,
  offset,
  width,
  t,
}: {
  seg: WallSeg;
  offset: number;
  width: number;
  t: number;
}) {
  if (t <= 0) return null;
  const ease = easeOutCubic(t);
  const dirX = Math.cos(seg.angle);
  const dirZ = Math.sin(seg.angle);
  const cx = seg.cx + dirX * offset;
  const cz = seg.cz + dirZ * offset;
  // rises from below into place at this storey's elevation
  const y = seg.baseY + seg.height / 2 - (1 - ease) * seg.height * 1.1;
  const active = t > 0 && t < 1;
  return (
    <group position={[cx, y, cz]} rotation={[0, -seg.angle, 0]}>
      <mesh castShadow>
        <boxGeometry args={[width, seg.height, seg.thickness + 0.02]} />
        <meshStandardMaterial color={COLORS.panel} roughness={0.75} />
      </mesh>
      <lineSegments>
        <edgesGeometry
          args={[new THREE.BoxGeometry(width, seg.height, seg.thickness + 0.02)]}
        />
        <lineBasicMaterial color={active ? "#ffffff" : COLORS.panelSeam} />
      </lineSegments>
    </group>
  );
}

/** A wall that grows upward from its base (printed / masonry / brick). */
function GrowWall({
  seg,
  t,
  color,
  courseColor,
  coursePitch,
}: {
  seg: WallSeg;
  t: number;
  color: string;
  courseColor?: string;
  coursePitch?: number;
}) {
  if (t <= 0) return null;
  const h = Math.max(0.01, seg.height * easeOutCubic(t));
  const courses: number[] = [];
  if (courseColor && coursePitch) {
    for (let y = coursePitch; y < h; y += coursePitch) courses.push(y);
  }
  return (
    <group position={[seg.cx, seg.baseY, seg.cz]} rotation={[0, -seg.angle, 0]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <boxGeometry args={[seg.len, h, seg.thickness]} />
        <meshStandardMaterial color={color} roughness={0.9} />
      </mesh>
      {courses.map((y, i) => (
        <mesh key={i} position={[0, y, 0]}>
          <boxGeometry args={[seg.len, 0.02, seg.thickness + 0.03]} />
          <meshStandardMaterial color={courseColor!} roughness={0.95} />
        </mesh>
      ))}
    </group>
  );
}

/** Timber frame studs along a wall, growing up (traditional veneer). */
function FrameWall({ seg, t }: { seg: WallSeg; t: number }) {
  const mat = useMemoTimber();
  if (t <= 0) return null;
  const h = seg.height * easeOutCubic(t);
  const studs = Math.max(2, Math.round(seg.len / 0.6));
  return (
    <group position={[seg.cx, seg.baseY, seg.cz]} rotation={[0, -seg.angle, 0]}>
      {Array.from({ length: studs + 1 }, (_, k) => {
        const x = (k / studs) * seg.len - seg.len / 2;
        return (
          <mesh key={k} position={[x, h / 2, 0]} material={mat}>
            <boxGeometry args={[0.05, h, seg.thickness]} />
          </mesh>
        );
      })}
      <mesh position={[0, h, 0]} material={mat}>
        <boxGeometry args={[seg.len, 0.06, seg.thickness]} />
      </mesh>
    </group>
  );
}
function useMemoTimber() {
  return useMemo(
    () => new THREE.MeshStandardMaterial({ color: COLORS.timber, roughness: 0.85 }),
    [],
  );
}

// ----------------------------------------------------------------------------
// Scene — renders each stage from where the timeline currently is.
// ----------------------------------------------------------------------------

function Scene({
  layout,
  system,
  variant,
  progress,
  steps,
}: {
  layout: SpatialLayout;
  system: MMCSystem;
  variant: TraditionalVariant;
  progress: number;
  steps: StepWindow[];
}) {
  // Guard degenerate bounds so a zero-sized layout doesn't collapse the scene.
  const rawWidth = layout.bounds?.width ?? 0;
  const rawDepth = layout.bounds?.depth ?? 0;
  const width = rawWidth > 0.5 ? rawWidth : 12;
  const depth = rawDepth > 0.5 ? rawDepth : 10;
  const wallHeight = layout.wall_height || 2.4;
  // Multi-storey: the roof lands on the TOP storey (not a single wall height),
  // and each storey's floor plate + walls stack at their own elevation. Uses the
  // same maths as the canonical 3D viewer so this lines up with Compare System /
  // Standard Model. Single-storey → roofBase === wallHeight (no behaviour change).
  const top = getTopStoreyIndex(layout);
  const roofBase = getRoofBaseHeight(layout);
  const maxDim = Math.max(width, depth);
  const camDist = maxDim * 1.8;

  const placements = useMemo(
    () => computeModulePlacements(layout, wallHeight),
    [layout, wallHeight],
  );
  const segs = useMemo(
    () => externalWallSegs(layout, wallHeight),
    [layout, wallHeight],
  );
  // Base elevation of every storey (0 = ground at 0) — used to stack upper-floor
  // plates and volumetric modules above the ground floor.
  const storeyBaseYs = useMemo(
    () => Array.from({ length: top + 1 }, (_, s) => getStoreyBaseElevation(layout, s)),
    [layout, top],
  );

  const slabShown = stageReached(steps, progress, "slab");
  const slabT = easeOutCubic(stageLocalT(steps, progress, "slab"));
  const outlineT = 1 - slabT;
  const frameT = easeOutCubic(stageLocalT(steps, progress, "frame"));
  const wallsT = easeOutCubic(stageLocalT(steps, progress, "walls"));
  const panelsT = stageLocalT(steps, progress, "panels");
  const modulesT = stageLocalT(steps, progress, "modules");
  const printT = easeOutCubic(stageLocalT(steps, progress, "print"));
  const roofShown = stageReached(steps, progress, "roof");
  const roofT = easeOutCubic(stageLocalT(steps, progress, "roof"));
  const finishT = easeOutCubic(stageLocalT(steps, progress, "finish"));

  const groundColor = useMemo(
    () => new THREE.Color("#e8e4dc").lerp(new THREE.Color("#cfe3c4"), finishT),
    [finishT],
  );

  // Per-element stagger within a stage (modules / panels rise one after another).
  const elemT = (i: number, count: number, stageT: number) =>
    clamp01(stageT * count - i);

  // Walls have started once their grow stage has any progress.
  const wallsStarted =
    wallsT > 0 || printT > 0 || panelsT > 0 || modulesT > 0 || frameT > 0;

  const showCrane =
    system === "volumetric" &&
    stageReached(steps, progress, "modules") &&
    !stageReached(steps, progress, "roof");
  const showPrinter =
    system === "printed" &&
    stageReached(steps, progress, "print") &&
    !stageReached(steps, progress, "roof");

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
          target={[0, maxDim * 0.12 + roofBase * 0.25, 0]}
        />
        {/* Lights only — no <Environment> HDR (its CDN fetch is blocked on
            guest/co-working networks and blanked the whole scene). */}
        <ambientLight intensity={0.65} />
        <directionalLight
          position={[maxDim * 1.2, maxDim * 2, maxDim * 0.6]}
          intensity={1.1}
          castShadow
          shadow-mapSize-width={1024}
          shadow-mapSize-height={1024}
        />
        <directionalLight
          position={[-maxDim, maxDim * 1.5, -maxDim * 0.6]}
          intensity={0.35}
        />
        <ContactShadows
          position={[0, 0.004, 0]}
          opacity={0.4}
          scale={maxDim * 3}
          blur={2.5}
          far={maxDim}
          resolution={512}
        />

        {/* Ground */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[maxDim * 3.5, maxDim * 3.5]} />
          <meshStandardMaterial color={`#${groundColor.getHexString()}`} roughness={1} />
        </mesh>

        {/* Everything in layout space, centred */}
        <group position={[-width / 2, 0, -depth / 2]}>
          {/* Set-out tape (fades as the slab arrives) */}
          {!wallsStarted && outlineT > 0.01 && (
            <group>
              {[
                { x: width / 2, z: 0, w: width, d: 0.08 },
                { x: width / 2, z: depth, w: width, d: 0.08 },
                { x: 0, z: depth / 2, w: 0.08, d: depth },
                { x: width, z: depth / 2, w: 0.08, d: depth },
              ].map((s, i) => (
                <mesh key={i} position={[s.x, 0.02, s.z]}>
                  <boxGeometry args={[s.w, 0.02, s.d]} />
                  <meshBasicMaterial color="#d8a24a" transparent opacity={outlineT * 0.9} />
                </mesh>
              ))}
            </group>
          )}

          {/* Slab / footings */}
          {slabShown && (
            <mesh position={[width / 2, -0.075, depth / 2]} receiveShadow>
              <boxGeometry args={[width + 0.6, 0.15, depth + 0.6]} />
              <meshStandardMaterial
                color={COLORS.slab}
                roughness={0.95}
                transparent
                opacity={slabT}
              />
            </mesh>
          )}

          {/* Service stubs (volumetric + panelised) — fade in with the slab */}
          {slabShown &&
            (system === "volumetric" || system === "panelised") &&
            placements.map((p, i) => (
              <mesh key={`stub-${i}`} position={[p.cx, 0.15, p.cz]}>
                <cylinderGeometry args={[0.06, 0.06, 0.3, 8]} />
                <meshStandardMaterial color="#2b6cb0" transparent opacity={slabT} />
              </mesh>
            ))}

          {/* Upper-storey floor plates — appear as the structure rises so each
              level reads as a real floor (not walls floating in a gap). Ground
              (storey 0) already has the big slab above; this stacks the floors
              between it and the roof for a multi-storey plan. */}
          {wallsStarted &&
            storeyBaseYs.slice(1).map((by, idx) => (
              <mesh
                key={`floor-${idx + 1}`}
                position={[width / 2, by - 0.09, depth / 2]}
                receiveShadow
                castShadow
              >
                <boxGeometry args={[width + 0.3, 0.18, depth + 0.3]} />
                <meshStandardMaterial color={COLORS.slab} roughness={0.95} />
              </mesh>
            ))}

          {/* ---- System assembly ---- */}
          {system === "volumetric" &&
            storeyBaseYs.map((by, s) =>
              placements.map((p, i) => (
                <ModuleBox
                  key={`mod-${s}-${i}`}
                  placement={p}
                  baseY={by}
                  t={elemT(
                    s * placements.length + i,
                    placements.length * storeyBaseYs.length,
                    modulesT,
                  )}
                />
              )),
            )}

          {system === "panelised" &&
            segs
              .flatMap((seg) => {
                const n = Math.max(1, Math.round(seg.len / 2.4));
                const pw = seg.len / n;
                return Array.from({ length: n }, (_, k) => ({
                  seg,
                  offset: (k + 0.5) * pw - seg.len / 2,
                  width: pw - 0.04,
                  key: `${seg.id}-${k}`,
                }));
              })
              .map((panel, idx, arr) => (
                <RisePanel
                  key={panel.key}
                  seg={panel.seg}
                  offset={panel.offset}
                  width={panel.width}
                  t={elemT(idx, arr.length, panelsT)}
                />
              ))}

          {system === "printed" &&
            segs.map((seg) => (
              <GrowWall
                key={`pr-${seg.id}`}
                seg={seg}
                t={printT}
                color={COLORS.concrete}
                courseColor={COLORS.concreteRidge}
                coursePitch={0.18}
              />
            ))}

          {system === "traditional" &&
            variant === "masonry" &&
            segs.map((seg) => (
              <GrowWall
                key={`ma-${seg.id}`}
                seg={seg}
                t={wallsT}
                color={COLORS.masonryBlock}
                courseColor={COLORS.masonryCourse}
                coursePitch={0.2}
              />
            ))}

          {system === "traditional" && variant === "brick-veneer" && (
            <>
              {segs.map((seg) => (
                <FrameWall key={`fr-${seg.id}`} seg={seg} t={frameT} />
              ))}
              {segs.map((seg) => (
                <GrowWall
                  key={`bv-${seg.id}`}
                  seg={seg}
                  t={wallsT}
                  color={COLORS.veneerBrick}
                />
              ))}
            </>
          )}

          {/* Roof (all systems) — lowers into place onto the TOP storey's walls
              (roofBase), so it sits on the building rather than floating a single
              storey up on a multi-storey plan. */}
          {roofShown && (
            <mesh
              position={[
                width / 2,
                roofBase + 0.2 + (1 - roofT) * wallHeight * 0.9,
                depth / 2,
              ]}
              castShadow
            >
              <boxGeometry args={[width + 0.3, 0.14, depth + 0.3]} />
              <meshStandardMaterial
                color={COLORS.roof}
                roughness={0.7}
                metalness={0}
                transparent
                opacity={roofT}
              />
            </mesh>
          )}

          {/* Finish: entry deck */}
          {stageReached(steps, progress, "finish") && (
            <mesh position={[width / 2, 0.1, depth + 0.7]}>
              <boxGeometry args={[Math.min(2.4, width * 0.5), 0.2, 1.2]} />
              <meshStandardMaterial color={COLORS.deck} roughness={0.8} transparent opacity={finishT} />
            </mesh>
          )}

          {/* Crane (volumetric) — fades in while modules are being set. */}
          {showCrane && (
            <group position={[width + 1.6, 0, depth * 0.5]}>
              <mesh position={[0, roofBase * 1.8, 0]}>
                <boxGeometry args={[0.22, roofBase * 3.6, 0.22]} />
                <meshStandardMaterial
                  color="#555c63"
                  metalness={0}
                  roughness={0.6}
                  transparent
                  opacity={clamp01(modulesT * 3)}
                />
              </mesh>
              <mesh position={[-width * 0.4, roofBase * 3.4, 0]}>
                <boxGeometry args={[width * 0.9, 0.16, 0.16]} />
                <meshStandardMaterial
                  color="#555c63"
                  metalness={0}
                  roughness={0.6}
                  transparent
                  opacity={clamp01(modulesT * 3)}
                />
              </mesh>
            </group>
          )}

          {/* Printer gantry (printed) — rises with the print. */}
          {showPrinter && (
            <group
              position={[
                width / 2,
                0.2 + roofBase * easeOutCubic(printT) + 0.4,
                depth / 2,
              ]}
            >
              <mesh>
                <boxGeometry args={[width + 0.8, 0.12, 0.12]} />
                <meshStandardMaterial
                  color="#445"
                  metalness={0}
                  roughness={0.5}
                  transparent
                  opacity={clamp01(printT * 4)}
                />
              </mesh>
              <mesh rotation={[0, Math.PI / 2, 0]}>
                <boxGeometry args={[depth + 0.8, 0.12, 0.12]} />
                <meshStandardMaterial
                  color="#445"
                  metalness={0}
                  roughness={0.5}
                  transparent
                  opacity={clamp01(printT * 4)}
                />
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

const SYSTEM_OPTIONS: { id: MMCSystem; label: string }[] = [
  { id: "traditional", label: "Traditional" },
  { id: "panelised", label: "Panelised" },
  { id: "volumetric", label: "Volumetric" },
  { id: "printed", label: "3D-printed" },
];

export function BuildSequence({ layout }: { layout: SpatialLayout }) {
  const [system, setSystem] = useState<MMCSystem>("traditional");
  const [variant, setVariant] = useState<TraditionalVariant>("brick-veneer");

  const steps = useMemo(
    () => buildSteps(stepDefsFor(system, variant)),
    [system, variant],
  );

  const [progress, setProgress] = useState(0);
  const [playing, setPlaying] = useState(true);
  const progressRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);

  // ~2.2s per named step so each stage is readable.
  const durationMs = Math.max(12000, steps.length * 2200);

  const setProgressBoth = (v: number) => {
    progressRef.current = v;
    setProgress(v);
  };

  const restart = () => {
    lastTsRef.current = null;
    setProgressBoth(0);
    setPlaying(true);
  };
  const selectSystem = (s: MMCSystem) => {
    setSystem(s);
    restart();
  };
  const selectVariant = (v: TraditionalVariant) => {
    setVariant(v);
    restart();
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
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, durationMs]);

  const currentIndex = (() => {
    const i = steps.findIndex((s) => progress < s.end);
    return i === -1 ? steps.length - 1 : i;
  })();
  const atEnd = progress >= 1;

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p className="font-medium">
          Build sequence — watch each system go up step by step
        </p>
        <p className="mt-1">
          Same footprint, built five ways. Pick a system below; Traditional has a
          brick-veneer / double-brick toggle. The numbered steps are the real
          construction sequence for that method — Play or scrub to watch each
          stage build in order.
        </p>
      </div>

      {/* System selector */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border bg-zinc-50 p-0.5 text-xs">
          {SYSTEM_OPTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectSystem(s.id)}
              className={`rounded px-2.5 py-1 transition-colors ${
                system === s.id
                  ? "bg-white shadow-sm font-medium text-zinc-900"
                  : "text-zinc-600 hover:text-zinc-900"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {system === "traditional" && (
          <div className="inline-flex rounded-md border bg-white p-0.5 text-[11px]">
            {(
              [
                ["brick-veneer", "Brick veneer / timber frame"],
                ["masonry", "Double brick / block"],
              ] as [TraditionalVariant, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => selectVariant(v)}
                className={`rounded px-2 py-0.5 transition-colors ${
                  variant === v
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

      {/* 3D + stepper */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_280px]">
        <div className="h-[420px] overflow-hidden rounded-lg border bg-gradient-to-b from-sky-100 to-white lg:h-[480px]">
          <Scene
            layout={layout}
            system={system}
            variant={variant}
            progress={progress}
            steps={steps}
          />
        </div>

        {/* Numbered construction-stage stepper (the sequence source of truth) */}
        <ol className="flex flex-col gap-1.5 rounded-lg border bg-white p-3">
          {steps.map((s) => {
            const status =
              s.index < currentIndex
                ? "done"
                : s.index === currentIndex
                  ? "active"
                  : "todo";
            const fill = clamp01((progress - s.start) / (s.end - s.start));
            return (
              <li key={`${s.stage}-${s.index}`} className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                    status === "done"
                      ? "bg-teal-600 text-white"
                      : status === "active"
                        ? "bg-amber-500 text-white"
                        : "bg-zinc-200 text-zinc-500"
                  }`}
                >
                  {status === "done" ? <Check className="h-3.5 w-3.5" /> : s.index + 1}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p
                    className={`text-xs leading-snug ${
                      status === "todo"
                        ? "text-zinc-500"
                        : "font-medium text-zinc-900"
                    }`}
                  >
                    {s.label}
                  </p>
                  {status === "active" && (
                    <div className="mt-1 h-1 overflow-hidden rounded-full bg-zinc-200">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-[width] duration-100"
                        style={{ width: `${fill * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Controls */}
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
