# SCRUM-194 — CAD export feasibility (SketchUp / Revit) + go-no-go for SCRUM-53

**Status:** go/no-go memo. **Author:** engineering. **Date:** 2026-07-16.
**Unblocks:** SCRUM-53 ("Add Export formats — SKP, RVT for MMC Build", priority **Highest**).

---

## 1. TL;DR / recommendation

**Do not build native `.skp` or `.rvt` writers.** Native SketchUp file authoring needs a
native C++ SDK binary that cannot run on our Vercel/Node serverless runtime, and native Revit
`.rvt` files effectively cannot be authored outside the Revit desktop application at all.

**Instead, deliver the same user value — "get my MMC design into SketchUp / Revit" — through
open interchange formats, which is exactly the direction the codebase already started in:**

1. **Keep + polish the existing `.dae` (COLLADA)** export — it already opens in SketchUp, Revit,
   and Rhino. Fix the fidelity gaps its own code flags (real door/window cutouts, per-material
   SketchUp components).
2. **Add `.ifc` (IFC 2x3/4)** — the *correct* BIM path into Revit: Revit opens an IFC and
   saves it as `.rvt`. Authorable in our stack today via the `web-ifc` WASM library (writes IFC
   in Node at native speed), driven off the same `SpatialLayout` model as the current exporters.
3. **Add `.glb`/`.gltf`** (optional, cheap) — a lightweight, universally-viewable 3D file for
   sharing/preview, produced by serializing the three.js scene we already render.

Net: the "SKP/RVT" ask is satisfied **honestly** — `.dae` covers SketchUp import, `.ifc` covers
the Revit path — without shipping a fake or broken native file. Effort is **moderate** and reuses
existing infrastructure.

---

## 2. What SCRUM-53 asks vs. what already exists

SCRUM-53 asks for `.skp` and `.rvt` export from MMC Build. **Build already has a working CAD
export pipeline** that the ticket appears unaware of:

| Format | File | Route | UI | Notes |
|---|---|---|---|---|
| **COLLADA `.dae`** | `src/lib/build/dae-exporter.ts` | `src/app/api/build/report/[checkId]/dae/route.ts` | "Export 3D model (.dae)" button in `design-report.tsx` | Opens in **SketchUp / Revit / Rhino**. Walls as extruded boxes, room-polygon floors, openings as coloured markers (not real cutouts). `meter` units, `Z_UP`. Its own code comments name **SCRUM-53** as the follow-up for real cutouts / SketchUp components. |
| **AutoCAD `.dxf`** | `src/lib/build/dxf-exporter.ts` | `.../[checkId]/dxf/route.ts` | `.dxf` button | 2D wall footprints as LINE entities, layered (unchanged / source-overlay / changes). `$INSUNITS = 6` (metres). |

So the real question SCRUM-53 poses is **"the existing `.dae` opens in both tools already — do we
also need *native* `.skp`/`.rvt`, and can we even produce them?"** — answered below.

### The data we export from

All exporters consume one canonical model: **`SpatialLayout`** (`src/lib/build/spatial/types.ts`),
persisted as jsonb in `design_checks.spatial_layout`. It is a **2D-plan-plus-scalar-height** model,
entirely in **metres**:

- **walls** — centreline `start`/`end` `Point2D` + scalar `thickness`, `height_m`, `type`,
  `material`, `cladding`, `storey`.
- **rooms** — closed `Point2D[]` polygon + `area_m2`, `floor_level`, `type`.
- **openings** — wall-relative centre `position` + width/height/sill (metres).
- **roof / storeys / materials** — scalar metadata.

There is **no true 3D mesh persisted** — 3D is generated on the fly by extrusion in
`buildFloorPlan3D()` (`src/lib/build/spatial/geometry.ts`), which returns a `THREE.Group` with
semantic `userData` tags on every mesh. This matters for the format choice below.

---

## 3. Feasibility per format

| Format | Can we author it in our stack? | Verdict |
|---|---|---|
| **`.skp` (SketchUp native)** | Only via the **SketchUp Desktop C SDK** (or the `SketchUpNET` C#/C++ wrapper). Both are **native binaries** — they cannot run in Vercel/Node serverless functions or Inngest. Would require a separate native worker/container. No pure-JS/WASM writer exists. | **NO-GO** (not worth a native side-service; `.dae` already imports into SketchUp). |
| **`.rvt` (Revit native)** | **Not authorable outside Revit.** The Revit API itself barely supports creating `.rvt` from scratch, and it only runs inside the Revit desktop app. The industry-standard path *into* Revit is **IFC** (Revit opens/links IFC, then saves `.rvt`). | **NO-GO on native**; **GO via IFC**. |
| **`.ifc` (IFC 2x3 / 4)** | **Yes.** `web-ifc` (ThatOpen Engine) reads *and writes* IFC in Node via WASM at native speed. We can author `IfcWall` / `IfcSlab` / `IfcSpace` / `IfcWindow`/`IfcDoor` straight from `SpatialLayout` — same pure-model → string/binary pattern as the current `.dae`/`.dxf` exporters. Alternative: shell out to Python **IfcOpenShell** as a worker (heavier; not needed). | **GO** — the recommended Revit path. |
| **`.glb` / `.gltf`** | **Yes.** We already build a `THREE.Group` scene (`buildFloorPlan3D`). three.js `GLTFExporter` serializes it directly (client-side, or headless three server-side). | **GO** (optional) — lightweight universal 3D. |
| **`.dae` (COLLADA)** | **Already shipped.** Opens in SketchUp/Revit/Rhino. | **Keep + improve fidelity.** |

---

## 4. Recommended build for SCRUM-53 (thin-first)

**Phase 1 — IFC export (the "Revit" answer).** New `src/lib/build/ifc-exporter.ts` +
`.../[checkId]/ifc/route.ts` + an "Export to Revit (.ifc)" button, mirroring the existing
`.dae`/`.dxf` wiring. Author `IfcWall`/`IfcSlab`/`IfcSpace` from `SpatialLayout` via `web-ifc`.
Acceptance: the file opens in Revit (Open IFC) and can be saved as `.rvt`; walls/rooms/storeys
land in the right places at the right metric dimensions. Copy on the button states the
IFC→Revit-save-as flow honestly (same pattern as the current `.dae` copy).

**Phase 2 — `.dae` fidelity (the "SketchUp" answer, already 80% there).** Close the gaps its own
comment flags: real opening cutouts (boolean the window/door out of the wall box) and per-material
grouping so it lands as usable SketchUp geometry rather than a massing block.

**Phase 3 (optional) — `.glb`.** Add a "Download 3D model (.glb)" via `GLTFExporter` off the
existing scene for lightweight sharing/preview (viewable in any glTF viewer, Windows 3D Viewer,
etc.). Cheap; nice-to-have.

**Explicitly out of scope:** native `.skp` and native `.rvt` writers (Phase-1/2 give both tools a
working import path; native authoring is disproportionate cost for no added user value).

**Rough effort:** Phase 1 ≈ 2–3 days (incl. Revit round-trip verification), Phase 2 ≈ 1–2 days,
Phase 3 ≈ 0.5 day. No new paid dependency (`web-ifc` and three.js `GLTFExporter` are MIT/free).

---

## 5. Ticket hygiene

- **SCRUM-53** should be **re-scoped** from "native SKP + RVT" to "IFC (Revit) + improved DAE
  (SketchUp) + optional GLB", per §4. Recommend updating the ticket title/description accordingly.
- **SCRUM-194** (this spike) is **satisfied by this memo** — the go/no-go is decided and the thin
  PoC is the Phase-1 IFC exporter. Can be closed on acceptance of this recommendation, with SCRUM-53
  carrying the build.

---

## Sources
- SketchUp Desktop SDK / C API (native only) — https://developer.trimble.com/docs/sketchup/tools/sdk/ ; `SketchUpNET` wrapper — https://github.com/moethu/SketchUpNET
- Revit → IFC as the interop path; native `.rvt` not authorable outside Revit — https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/Revit-Export-a-project-to-IFC.html ; https://github.com/Autodesk/revit-ifc/issues/380
- `web-ifc` reads/writes IFC in JS/Node at native speed — https://github.com/ThatOpen/engine_web-ifc ; https://www.npmjs.com/package/web-ifc
- IfcOpenShell (alternative Python authoring toolkit) — https://ifcopenshell.org/
