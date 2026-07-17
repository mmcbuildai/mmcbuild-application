# Spike: 3D rendering approach — are we hand-building too much?

**Status:** proposed (not yet scheduled). Raised 2026-07-17 alongside the SCRUM-163
renderer fixes. **Decision made this sprint:** finish the cheap deterministic fixes now
(pitched + per-system roof, interior walls); run this spike separately before any further
large investment in bespoke geometry.

## The question

We hand-roll a lot of Three.js geometry (`geometry.ts`, `system-renderer.ts`,
`build-sequence.tsx`) — every roof form, wall extrusion, and per-system texture is bespoke.
Meanwhile LLMs and generative tools produce impressive 3D from prompts. Are we over-investing
in building the 3D from scratch?

## Framing — two separate layers (do not conflate)

1. **Structured extraction** (plan → walls/rooms/roof/storeys as data). **KEEP — it's the moat.**
   It's the only thing that lets us (a) map an MMC suggestion to *specific walls*
   (`affected_wall_ids` overlays), (b) drive Quote (cost) and Comply (compliance) off the same
   geometry, (c) stay auditable in a REGULATED product. This is not the thing to replace.
2. **Meshing / rendering** (that data → the 3D you see). **This is where the bespoke effort
   compounds** and where the spike should focus.

## Options for the meshing layer

| Option | Fit | Pros | Cons |
|---|---|---|---|
| **A. Keep bespoke Three.js** (today) | Working, integrated | Deterministic; cheap per render; offline; overlays trivial | Every fidelity step is bespoke eng; struggles with real roof/opening/multi-storey detail |
| **B. Parametric / IFC-driven render** | **Most promising** | Reuse structured extraction; real building geometry (openings, roof forms, storeys) "for free"; we already emit IFC (SCRUM-53); still deterministic + overlay-able | New rendering dependency; mapping MMC overlays onto IFC elements needs design |
| **C. LLM emits the scene code** | Poor for engine | Leverages LLM spatial reasoning | Non-deterministic; per-render cost/latency; hard to make robust/safe; overlays fragile |
| **D. Generative 3D (Meshy/Rodin/Luma/Tripo)** | Post-MVP hero image only | Photoreal fast | Hallucinates geometry; can't carry MMC overlays; non-deterministic; BYOK/GPU cost — wrong for a REGULATED decision tool |

## Recommendation to evaluate in the spike

- **Primary:** Option **B (parametric/IFC-driven)** — keep extraction, replace the hand-rolled
  prism zoo with a real building-geometry pipeline. Prototype: extraction → IFC/glTF → render,
  with a proof that MMC `affected_wall_ids` overlays still map onto elements.
- **D (generative)** only as a *post-MVP* "looks like the actual house" visual pass — which is
  exactly the v2/v3/v4 fidelity Karen parked as post-MVP. Never as the engine.
- **C** ruled out for the engine (reliability + overlay loss).

## Why not just prompt for it now

A generative blob trades a ~1-day credibility win (the deterministic fixes) for a mesh that
can't carry the MMC suggestion overlays that *are* the product, and can silently change shape
between runs — unacceptable for a cost/compliance tool. Generative is a v2 enhancement, not the
engine.

## Suggested next step

Run `/office-hours` or `/spec` on Option B: scope an IFC/parametric render pipeline that
preserves the extraction + overlay model, with a thin PoC on Karen's Mittagong plan.
