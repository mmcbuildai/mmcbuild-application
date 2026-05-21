// End-to-end test: take the bbox JSON from recon-bbox-detect, crop the source PDF
// to a single floor-plan bbox using sharp on a high-res render, and feed to
// the existing extractor.

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
const bboxJsonPath = pdfPath.replace(/\.pdf$/, "--bboxes.json");
if (!fs.existsSync(bboxJsonPath)) throw new Error("Run recon-bbox-detect.mjs first");

const bboxes = JSON.parse(fs.readFileSync(bboxJsonPath, "utf8"));
const floorPlans = bboxes.drawings
  .filter((d) => d.type === "floor_plan_ground" || d.type === "floor_plan_upper")
  .sort((a, b) => (b.confidence - a.confidence) || (b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h));
console.log(`[crop] ${floorPlans.length} floor-plan candidates`);
if (floorPlans.length === 0) {
  console.error("No floor plans detected");
  process.exit(1);
}
const pick = floorPlans[0];
console.log(`[crop] Top candidate: ${pick.type} "${pick.title}" bbox=${JSON.stringify(pick.bbox)}`);

// Render the source PDF page at high resolution. The source PDF is 800×600 pts,
// scale 6 → 4800×3600 PNG. That gives each crop reasonable detail even at small bbox.
console.log("\n[crop] Rendering full PDF page at scale 6 (≈4800×3600)…");
const t0 = Date.now();
const pages = await pdfToImg(fs.readFileSync(pdfPath), { scale: 6.0 });
let fullPng = null;
for await (const img of pages) {
  fullPng = img;
  break;
}
if (!fullPng) throw new Error("Could not render page");
console.log(`[crop] Render took ${Date.now() - t0}ms, ${(fullPng.length / 1024 / 1024).toFixed(2)}MB`);

const meta = await sharp(fullPng).metadata();
console.log(`[crop] Full PNG: ${meta.width} × ${meta.height}`);

// Compute crop in pixel coords. Add 2% padding around the bbox.
const PAD_PCT = 2;
const px = Math.max(0, Math.floor(((pick.bbox.x - PAD_PCT) / 100) * meta.width));
const py = Math.max(0, Math.floor(((pick.bbox.y - PAD_PCT) / 100) * meta.height));
const pw = Math.min(
  meta.width - px,
  Math.ceil(((pick.bbox.w + 2 * PAD_PCT) / 100) * meta.width),
);
const ph = Math.min(
  meta.height - py,
  Math.ceil(((pick.bbox.h + 2 * PAD_PCT) / 100) * meta.height),
);
console.log(`[crop] Crop in px: x=${px} y=${py} w=${pw} h=${ph}`);

const cropped = await sharp(fullPng)
  .extract({ left: px, top: py, width: pw, height: ph })
  .png()
  .toBuffer();
const outCrop = pdfPath.replace(/\.pdf$/, "--crop-fp.png");
fs.writeFileSync(outCrop, cropped);
console.log(`[crop] Wrote ${outCrop} (${(cropped.length / 1024).toFixed(0)}KB)`);

// Send to extractor (image variant — extractSpatialLayout takes PNG base64)
console.log("\n[crop] Running floor-plan extraction on cropped PNG…");

const SHORT_PROMPT = `You are analysing a single floor plan cropped from a CAD drawing set. Extract walls and rooms as JSON:

{
  "walls": [{"id":"w1","start":{"x":0,"y":0},"end":{"x":6,"y":0},"thickness":0.09,"type":"external"}],
  "rooms": [{"id":"r1","name":"Living","polygon":[{"x":0,"y":0},{"x":6,"y":0},{"x":6,"y":4},{"x":0,"y":4}],"area_m2":24}],
  "openings": [],
  "bounds":{"min":{"x":0,"y":0},"max":{"x":12,"y":10},"width":12,"depth":10},
  "wall_height":2.4,
  "storeys":1,
  "confidence":0.8,
  "notes":"..."
}

Trace every wall segment. Don't skip internal partitions. External walls form a closed perimeter. Use metres. If dimensions are annotated use them; otherwise estimate. Return ONLY JSON, no preamble.`;

const b64 = cropped.toString("base64");
console.log(`[crop] Sending ${(b64.length / 1024 / 1024).toFixed(2)}MB cropped PNG to Sonnet…`);

const t1 = Date.now();
const resp = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 8192,
  thinking: { type: "enabled", budget_tokens: 4096 },
  system: SHORT_PROMPT,
  messages: [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
        { type: "text", text: "Extract the spatial layout from this floor plan. Return ONLY JSON." },
      ],
    },
  ],
});
console.log(`[crop] Extraction in ${Date.now() - t1}ms`);

const textBlock = resp.content.find((b) => b.type === "text");
const thinkingBlock = resp.content.find((b) => b.type === "thinking");
if (thinkingBlock && thinkingBlock.type === "thinking") {
  console.log("\n--- thinking summary (last 800 chars) ---");
  console.log(thinkingBlock.thinking.slice(-800));
}
if (!textBlock || textBlock.type !== "text") {
  console.error("No text response");
  process.exit(1);
}
const text = textBlock.text;

const jsonMatch = text.match(/\{[\s\S]*\}/);
if (jsonMatch) {
  try {
    const layout = JSON.parse(jsonMatch[0]);
    console.log("\n--- extraction summary ---");
    console.log(`walls: ${layout.walls?.length || 0}`);
    console.log(`rooms: ${layout.rooms?.length || 0}`);
    console.log(`openings: ${layout.openings?.length || 0}`);
    console.log(`bounds: ${layout.bounds?.width || '?'} × ${layout.bounds?.depth || '?'}m`);
    console.log(`confidence: ${layout.confidence || '?'}`);
    if (layout.notes) console.log(`notes: ${layout.notes.slice(0, 250)}`);

    const outJson = pdfPath.replace(/\.pdf$/, "--extracted-layout.json");
    fs.writeFileSync(outJson, JSON.stringify(layout, null, 2));
    console.log(`\n[crop] Wrote ${outJson}`);

    const walls = layout.walls?.length || 0;
    const rooms = layout.rooms?.length || 0;
    if (walls >= 4 && rooms >= 1) {
      console.log("\n✅ VIABLE — non-empty extraction. Tier 2 approach works.");
    } else if (walls > 0 || rooms > 0) {
      console.log("\n⚠️  PARTIAL — extraction returned but sparse. May need higher render scale or different bbox.");
    } else {
      console.log("\n❌ EMPTY — no walls/rooms extracted. Bbox may be wrong or drawing too small to read.");
    }
  } catch (e) {
    console.error("JSON parse failed:", e.message);
    console.log("Raw text:", text.slice(0, 1500));
  }
}
