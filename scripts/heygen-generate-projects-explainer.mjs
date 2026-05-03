#!/usr/bin/env node
/**
 * Generate the Projects landing-page explainer video via HeyGen.
 *
 * Output: public/videos/projects-explainer.mp4
 * Cost:   ~$1 per render (Public Avatar III tier, ~60s clip)
 *
 * Usage:
 *   node scripts/heygen-generate-projects-explainer.mjs
 *   node scripts/heygen-generate-projects-explainer.mjs --avatar <id> --voice <id>
 *   node scripts/heygen-generate-projects-explainer.mjs --dry-run
 */
import { join } from "path";
import {
  runHeyGenGenerator,
  DEFAULT_AVATAR_ID,
  DEFAULT_VOICE_ID,
  DEFAULT_BACKGROUND_HEX,
} from "./heygen/_lib.mjs";

// ~150 words. Projects is the entry point — every other module needs an
// active project to operate on. Pitch is "set up once, every module reuses it".
const SCRIPT = `Projects is the foundation of MMC Build. Every analysis you run — Comply, Build, Quote — pulls from one project record, so you set up the address, the design intent, and the drawings once, and every module shares them.

Creating a project takes about a minute. Drop in the address and we auto-derive the climate zone, wind region, and council from public data. Add your concept or schematic plans — PDF, DWG, DXF, even SketchUp or Revit exports if you have them. Then walk through a short questionnaire that captures the design stage, what you're trying to get out of the project, and the basic NCC inputs.

Once activated, the project is shared across modules. Run a Comply check, jump straight to Build for MMC suggestions, then to Quote for supplier costing — all on the same project, no re-entering data, no version drift between runs.`;

await runHeyGenGenerator({
  module: "projects",
  avatarId: DEFAULT_AVATAR_ID,
  voiceId: DEFAULT_VOICE_ID,
  script: SCRIPT,
  backgroundHex: DEFAULT_BACKGROUND_HEX,
  outputPath: join(process.cwd(), "public", "videos", "projects-explainer.mp4"),
});
