// Multi-candidate fallback: iterate through floor-plan candidates in order, run
// extraction on each, return the first one that the extractor confirms is a
// real floor plan with walls + rooms.

import fs from "node:fs";
import sharp from "sharp";
import Anthropic from "@anthropic-ai/sdk";

const envFile = fs.readFileSync(".env.local", "utf8");
const env = {};
envFile.split("\n").forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
});
const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const pdfPath = process.argv[2];
const bboxJson = JSON.parse(fs.readFileSync(pdfPath.replace(/\.pdf$/, "--bboxes-v2.json"), "utf8"));

const candidates = bboxJson.drawings
  .filter((d) => d.type === "floor_plan_ground" || d.type === "floor_plan_upper")
  .sort((a, b) => (b.confidence - a.confidence) || (b.bbox.w * b.bbox.h - a.bbox.w * a.bbox.h));
console.log(`[multi] ${candidates.length} floor-plan candidates to try`);

// Re-render at scale 6 (we cached this so just re-render)
console.log("[multi] Rendering source at scale 6…");
const { pdf: pdfToImg } = await import("pdf-to-img");
const pages = await pdfToImg(fs.readFileSync(pdfPath), { scale: 6.0 });
let fullPng = null;
for await (const img of pages) { fullPng = img; break; }
const meta = await sharp(fullPng).metadata();

const EXTRACT_PROMPT = `You are analysing a cropped image from a CAD drawing set. The image was tagged as a potential floor plan but you should VERIFY before extracting.

A real FLOOR PLAN has:
- Top-down view of building interior
- Internal partition walls visible (parallel lines between rooms)
- Room labels (Living, Bedroom, Kitchen, etc.) OR clear room divisions
- The extent stops at building external walls (NOT showing lot, streets, neighbouring properties)

If the image is anything else (site plan, elevation, schedule, detail, cover sheet), return:
{"error":"not_a_floor_plan","detected":"site_plan|elevation|schedule|details|cover|other"}

If it IS a floor plan, extract:
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

Trace EVERY wall segment — don't skip internal partitions. Return ONLY JSON.`;

const PAD = 2;
const MAX_TRIES = 6;

for (let i = 0; i < Math.min(candidates.length, MAX_TRIES); i++) {
  const pick = candidates[i];
  console.log(`\n[multi] === Try ${i + 1}/${Math.min(candidates.length, MAX_TRIES)}: ${pick.type} "${pick.title}" bbox=${JSON.stringify(pick.bbox)} ===`);

  const px = Math.max(0, Math.floor(((pick.bbox.x - PAD) / 100) * meta.width));
  const py = Math.max(0, Math.floor(((pick.bbox.y - PAD) / 100) * meta.height));
  const pw = Math.min(meta.width - px, Math.ceil(((pick.bbox.w + 2*PAD) / 100) * meta.width));
  const ph = Math.min(meta.height - py, Math.ceil(((pick.bbox.h + 2*PAD) / 100) * meta.height));

  const cropped = await sharp(fullPng)
    .extract({ left: px, top: py, width: pw, height: ph })
    .png()
    .toBuffer();

  const outCrop = pdfPath.replace(/\.pdf$/, `--multi-c${i+1}.png`);
  fs.writeFileSync(outCrop, cropped);

  const b64 = cropped.toString("base64");
  const t0 = Date.now();
  const resp = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8192,
    thinking: { type: "enabled", budget_tokens: 4096 },
    system: EXTRACT_PROMPT,
    messages: [{
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
        { type: "text", text: "Verify floor plan + extract, or return not_a_floor_plan error. ONLY JSON." },
      ],
    }],
  });
  console.log(`[multi]   extraction in ${Date.now() - t0}ms`);

  const text = resp.content.find(b => b.type === "text").text;
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) { console.log("[multi]   no JSON in response"); continue; }
  const layout = JSON.parse(m[0]);

  if (layout.error) {
    console.log(`[multi]   ❌ rejected: ${layout.error} (${layout.detected})`);
    continue;
  }
  const w = layout.walls?.length || 0;
  const r = layout.rooms?.length || 0;
  const conf = layout.confidence || 0;
  console.log(`[multi]   walls=${w} rooms=${r} bounds=${layout.bounds?.width}×${layout.bounds?.depth}m conf=${conf}`);
  if (w >= 4 && r >= 1 && conf >= 0.5) {
    console.log(`\n✅ WINNER — candidate ${i + 1} produced viable extraction`);
    console.log(`   walls: ${w}, rooms: ${r}, openings: ${layout.openings?.length || 0}`);
    console.log(`   notes: ${(layout.notes || '').slice(0, 200)}`);
    fs.writeFileSync(pdfPath.replace(/\.pdf$/, "--multi-WINNER.json"), JSON.stringify({ candidate: pick, layout }, null, 2));
    process.exit(0);
  } else if (w > 0 || r > 0) {
    console.log("[multi]   ⚠️  sparse, continuing");
  }
}

console.log("\n[multi] ❌ No candidate produced a viable floor-plan extraction.");
