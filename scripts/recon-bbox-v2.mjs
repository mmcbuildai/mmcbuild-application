// V2 bbox detector: sharper discrimination between site_plan vs floor_plan_ground.
// Also returns only HIGH-confidence drawings + sorts by size (larger = primary).

import fs from "node:fs";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";
import { pdf as pdfToImg } from "pdf-to-img";

const envFile = fs.readFileSync(".env.local", "utf8");
const env = {};
envFile.split("\n").forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
});
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const pdfPath = process.argv[2];
if (!pdfPath) throw new Error("usage: node scripts/recon-bbox-v2.mjs <input.pdf>");

console.log("[v2] Rendering at scale 6.0…");
const t0 = Date.now();
const pages = await pdfToImg(fs.readFileSync(pdfPath), { scale: 6.0 });
let fullPng = null;
for await (const img of pages) { fullPng = img; break; }
console.log(`[v2] Rendered in ${Date.now() - t0}ms`);

// Downsample for bbox detection — Claude doesn't need 4800×3600, 2000-wide is plenty
// for finding drawing boundaries and reading titles.
const meta = await sharp(fullPng).metadata();
const bboxImg = await sharp(fullPng).resize(2400, null, { fit: "inside" }).png().toBuffer();
const bboxMeta = await sharp(bboxImg).metadata();
console.log(`[v2] bbox input: ${bboxMeta.width} × ${bboxMeta.height} (${(bboxImg.length/1024).toFixed(0)}KB)`);

const BBOX_PROMPT_V2 = `You are looking at a single PDF page rendered from a DWG. The DWG was exported in MODEL SPACE — multiple paper-space sheets have been arranged as TILES in one big canvas. Each tile is one complete drawing.

YOUR JOB: locate each TILE on the canvas and classify what drawing it contains.

CRITICAL TYPE DISTINCTIONS — read these carefully:

- floor_plan_ground / floor_plan_upper:
  * Top-down view of building INTERIOR
  * MUST show internal partition WALLS (visible as parallel lines or single bold lines between rooms)
  * MUST show distinct ROOMS (labelled "Living", "Bedroom", "Kitchen", or similar)
  * The drawing extent stops at the building's external walls — does NOT show lot boundaries, streets, neighbouring lots
  * Often dimensioned with internal room sizes
  * If a drawing shows JUST a filled building footprint with no visible internal walls, it is a SITE PLAN not a floor plan

- site_plan:
  * Building shown as a SOLID FILLED FOOTPRINT or simple outline
  * Surrounding context: lot boundaries, streets, kerbs, neighbouring properties, easements
  * No internal walls or room labels visible
  * Title often "SITE PLAN", "LOCATION PLAN", "SETTING OUT"

- elevation_n / s / e / w / other:
  * Side view of building (looking horizontally)
  * Tall rectangle showing facade with roof line above, ground line below
  * Windows, doors visible
  * Title often "NORTH ELEVATION", "EAST ELEVATION", or labelled "ELEVATION A"

- section:
  * Vertical slice through building
  * Shows floor/ceiling lines, often with hatching, internal heights
  * Title "SECTION A-A" etc.

- roof_plan: top-down view of the roof itself (ridge lines, hips, gutters, no rooms below)
- schedule: a TABLE of items (doors, windows, fixtures, finishes)
- details: small construction details (joinery, junctions, junctions, wall sections)
- cover / title_block: title page, sheet index, revision table
- other: anything else

IMPORTANT — only return drawings with confidence >= 0.7. Be conservative on floor_plan_* tags — if you're not certain you see internal walls + room labels, tag as site_plan or other. False positives on floor_plan_ground waste downstream extraction budget.

Output ONLY valid JSON (no markdown fences):

{
  "drawings": [
    { "type": "floor_plan_ground", "bbox": {"x":12,"y":18,"w":24,"h":20}, "title": "GROUND FLOOR PLAN", "confidence": 0.95, "evidence": "internal walls visible, rooms labelled" }
  ]
}

bbox is in PERCENTAGES of the full image (0-100) with origin TOP-LEFT. Add 2-3% padding so dimension lines aren't cut.`;

const b64 = bboxImg.toString("base64");
console.log(`[v2] Sending ${(b64.length/1024/1024).toFixed(2)}MB to Sonnet for bbox detection…`);

const t1 = Date.now();
const resp = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 6000,
  thinking: { type: "enabled", budget_tokens: 4096 },
  system: BBOX_PROMPT_V2,
  messages: [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
        { type: "text", text: "Identify all drawing tiles. Be conservative on floor_plan_*. Return ONLY JSON." },
      ],
    },
  ],
});
console.log(`[v2] Response in ${Date.now() - t1}ms`);

const textBlock = resp.content.find((b) => b.type === "text");
const text = textBlock.text;
const jsonMatch = text.match(/\{[\s\S]*\}/);
if (!jsonMatch) {
  console.error("No JSON in response:\n", text.slice(0, 1000));
  process.exit(1);
}
const parsed = JSON.parse(jsonMatch[0]);
const drawings = parsed.drawings || [];
console.log(`\n[v2] ${drawings.length} drawings detected:`);
const byType = {};
drawings.forEach((d) => {
  byType[d.type] = (byType[d.type] || 0) + 1;
});
Object.entries(byType).sort((a,b) => b[1] - a[1]).forEach(([t, c]) => console.log(`  ${c}× ${t}`));

const floorPlans = drawings
  .filter((d) => d.type === "floor_plan_ground" || d.type === "floor_plan_upper")
  .sort((a, b) => (b.confidence - a.confidence) || (b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h));
console.log(`\n[v2] ${floorPlans.length} floor-plan candidates (sorted by confidence × area):`);
floorPlans.forEach((d, i) =>
  console.log(`  ${i + 1}. ${d.type} (${d.confidence}) "${d.title}" bbox=${JSON.stringify(d.bbox)} — ${d.evidence || ''}`)
);

fs.writeFileSync(pdfPath.replace(/\.pdf$/, "--bboxes-v2.json"), JSON.stringify(parsed, null, 2));

// Now run extraction on the top floor-plan candidate using the high-res render
if (floorPlans.length === 0) {
  console.log("\n[v2] No floor plans detected — falling back to all candidates");
  process.exit(0);
}

console.log(`\n[v2] Running extraction on top candidate…`);
const pick = floorPlans[0];

const PAD = 2;
const px = Math.max(0, Math.floor(((pick.bbox.x - PAD) / 100) * meta.width));
const py = Math.max(0, Math.floor(((pick.bbox.y - PAD) / 100) * meta.height));
const pw = Math.min(meta.width - px, Math.ceil(((pick.bbox.w + 2*PAD) / 100) * meta.width));
const ph = Math.min(meta.height - py, Math.ceil(((pick.bbox.h + 2*PAD) / 100) * meta.height));

const cropped = await sharp(fullPng)
  .extract({ left: px, top: py, width: pw, height: ph })
  .png()
  .toBuffer();
const outCrop = pdfPath.replace(/\.pdf$/, "--v2-crop-fp.png");
fs.writeFileSync(outCrop, cropped);
console.log(`[v2] Crop: ${pw}×${ph}, ${(cropped.length/1024).toFixed(0)}KB`);

const EXTRACT_PROMPT = `You are analysing a cropped floor plan from a CAD drawing set. Extract walls and rooms as JSON.

If the image is NOT a floor plan (e.g. a site plan, elevation, schedule), return {"error":"not_a_floor_plan","detected":"site_plan/elevation/etc","walls":[],"rooms":[]}.

Otherwise extract:
{
  "walls": [{"id":"w1","start":{"x":0,"y":0},"end":{"x":6,"y":0},"thickness":0.09,"type":"external"}],
  "rooms": [{"id":"r1","name":"Living","polygon":[{"x":0,"y":0},{"x":6,"y":0},{"x":6,"y":4},{"x":0,"y":4}],"area_m2":24}],
  "openings": [{"id":"o1","type":"door","position":{"x":3,"y":0},"width":0.82,"wall_id":"w1"}],
  "bounds":{"min":{"x":0,"y":0},"max":{"x":12,"y":10},"width":12,"depth":10},
  "wall_height":2.4,
  "storeys":1,
  "confidence":0.8,
  "notes":"..."
}

Trace EVERY wall segment. External walls form a closed perimeter loop. Use metres. Return ONLY JSON.`;

const cropB64 = cropped.toString("base64");
const t2 = Date.now();
const eResp = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 8192,
  thinking: { type: "enabled", budget_tokens: 4096 },
  system: EXTRACT_PROMPT,
  messages: [{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: "image/png", data: cropB64 } },
      { type: "text", text: "Extract the spatial layout. If not a floor plan, return error. Return ONLY JSON." },
    ],
  }],
});
console.log(`[v2] Extraction in ${Date.now() - t2}ms`);
const eText = eResp.content.find(b => b.type === "text").text;
const eMatch = eText.match(/\{[\s\S]*\}/);
if (eMatch) {
  const layout = JSON.parse(eMatch[0]);
  if (layout.error) {
    console.log(`\n❌ Top candidate rejected: ${layout.error} (detected as ${layout.detected})`);
    console.log("Will need multi-candidate fallback or different bbox.");
  } else {
    console.log(`\n--- extraction ---`);
    console.log(`walls: ${layout.walls?.length || 0}`);
    console.log(`rooms: ${layout.rooms?.length || 0}`);
    console.log(`openings: ${layout.openings?.length || 0}`);
    console.log(`bounds: ${layout.bounds?.width || '?'} × ${layout.bounds?.depth || '?'}m`);
    console.log(`confidence: ${layout.confidence || '?'}`);
    if (layout.notes) console.log(`notes: ${layout.notes.slice(0, 200)}`);
    const w = layout.walls?.length || 0, r = layout.rooms?.length || 0;
    if (w >= 4 && r >= 1) console.log("\n✅ VIABLE");
    else console.log("\n⚠️  SPARSE");
  }
}
