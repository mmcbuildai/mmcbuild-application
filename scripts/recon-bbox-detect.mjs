// Test: can Claude identify drawing bboxes in the model-space CloudConvert dump?
// Renders the PDF at high res, sends to Sonnet, asks for bbox + type per drawing.

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const envFile = fs.readFileSync(".env.local", "utf8");
const env = {};
envFile.split("\n").forEach((l) => {
  const m = l.match(/^([A-Z_]+)=(.+)$/);
  if (m) env[m[1]] = m[2].replace(/^"|"$/g, "");
});

const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

const pdfPath = process.argv[2];
if (!pdfPath) throw new Error("usage: node scripts/recon-bbox-detect.mjs <input.pdf>");

console.log("[recon] Rendering PDF page at high res for bbox detection…");
const { pdf } = await import("pdf-to-img");
const pages = await pdf(fs.readFileSync(pdfPath), { scale: 4.0 });
let firstPagePng = null;
for await (const img of pages) {
  firstPagePng = img;
  break;
}
if (!firstPagePng) throw new Error("Could not render PDF");

const outImg = pdfPath.replace(/\.pdf$/, "--hires.png");
fs.writeFileSync(outImg, firstPagePng);
console.log(`[recon] Wrote ${outImg} (${(firstPagePng.length / 1024 / 1024).toFixed(2)}MB)`);

const BBOX_PROMPT = `You are looking at a single PDF page rendered from a DWG file. This DWG was exported in MODEL SPACE — all drawings (floor plans, elevations, sections, schedules, details) are placed at their world coordinates in one big canvas.

Identify EACH distinct architectural drawing visible on this page. For each one, return:
- type: one of floor_plan_ground, floor_plan_upper, elevation_n, elevation_s, elevation_e, elevation_w, elevation_other, section, roof_plan, schedule, site_plan, details, title_block, other
- bbox: bounding box as percentages of the full page (0-100), with origin at TOP-LEFT
- title: the drawing title text if visible (e.g. "GROUND FLOOR PLAN", "NORTH ELEVATION")
- confidence: 0.0-1.0

Floor plans show top-down view of rooms with walls. Elevations show one side of the building as a long horizontal strip. Sections show a vertical slice (visible floor/ceiling lines, often with hatching). Schedules are tables of items.

Be precise on bboxes — they will be used to crop the source PDF for downstream extraction. Add 2-3% padding around each drawing so we don't crop dimension lines or labels.

Return ONLY valid JSON, no preamble:
{
  "drawings": [
    { "type": "floor_plan_ground", "bbox": {"x":12,"y":18,"w":24,"h":20}, "title": "GROUND FLOOR PLAN", "confidence": 0.95 },
    { "type": "elevation_n", "bbox": {"x":40,"y":18,"w":30,"h":8}, "title": "NORTH ELEVATION", "confidence": 0.92 }
  ]
}`;

const b64 = firstPagePng.toString("base64");
console.log(`[recon] Sending ${(b64.length / 1024 / 1024).toFixed(2)}MB image to Claude Sonnet for bbox detection…`);

const t0 = Date.now();
const resp = await anthropic.messages.create({
  model: "claude-sonnet-4-6",
  max_tokens: 4096,
  system: BBOX_PROMPT,
  messages: [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: "image/png", data: b64 } },
        { type: "text", text: "Identify all drawings and return their bboxes as JSON." },
      ],
    },
  ],
});

console.log(`[recon] Response in ${Date.now() - t0}ms`);
const textBlock = resp.content.find((b) => b.type === "text");
if (!textBlock || textBlock.type !== "text") {
  console.error("No text response");
  process.exit(1);
}

const text = textBlock.text;
console.log("\n--- raw response ---");
console.log(text.slice(0, 2000));

// Try to parse JSON
const jsonMatch = text.match(/\{[\s\S]*\}/);
if (jsonMatch) {
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    console.log("\n--- parsed ---");
    console.log(`detected ${parsed.drawings?.length || 0} drawings:`);
    (parsed.drawings || []).forEach((d, i) => {
      console.log(`  ${i + 1}. ${d.type} (${d.confidence}) bbox=[${d.bbox.x.toFixed(1)},${d.bbox.y.toFixed(1)} ${d.bbox.w.toFixed(1)}x${d.bbox.h.toFixed(1)}] title="${d.title || ''}"`);
    });

    // Save the parsed result for downstream use
    const outJson = pdfPath.replace(/\.pdf$/, "--bboxes.json");
    fs.writeFileSync(outJson, JSON.stringify(parsed, null, 2));
    console.log(`\n[recon] Wrote ${outJson}`);
  } catch (e) {
    console.error("JSON parse failed:", e.message);
  }
}
