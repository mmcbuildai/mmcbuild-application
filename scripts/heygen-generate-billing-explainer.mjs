#!/usr/bin/env node
/**
 * Generate the Billing module explainer video via HeyGen.
 *
 * Output: public/videos/billing-explainer.mp4
 * Cost:   ~$1 per render (Public Avatar III tier, ~60s clip)
 *
 * Usage:
 *   node scripts/heygen-generate-billing-explainer.mjs
 *   node scripts/heygen-generate-billing-explainer.mjs --avatar <id> --voice <id>
 *   node scripts/heygen-generate-billing-explainer.mjs --dry-run
 */
import { join } from "path";
import {
  runHeyGenGenerator,
  DEFAULT_AVATAR_ID,
  DEFAULT_VOICE_ID,
  DEFAULT_BACKGROUND_HEX,
} from "./heygen/_lib.mjs";

// ~150 words. Practical, no-surprises tone — the goal is to remove ambiguity
// about what's free, what counts as a "run", and how the trial converts.
const SCRIPT = `Billing in MMC Build is built around runs, not seats. A run is a single AI analysis — one Comply check, one Build optimisation, or one Quote. You get ten free runs on the trial, with no credit card needed to get started.

When you upgrade, you pick the tier that matches how you'll actually use the platform. Solo designers tend to land on the practitioner tier — unlimited projects, a generous monthly run allowance. Larger studios go to the team tier, with seats for collaborators and a shared run pool.

Every run is logged here so you can see exactly where your allowance went, which projects consumed it, and which modules you're using most. If a run fails for technical reasons it doesn't count against your allowance — only successful analyses do.

Trial users see their remaining runs in the sidebar; upgrade prompts appear before you hit zero, never after.`;

await runHeyGenGenerator({
  module: "billing",
  avatarId: DEFAULT_AVATAR_ID,
  voiceId: DEFAULT_VOICE_ID,
  script: SCRIPT,
  backgroundHex: DEFAULT_BACKGROUND_HEX,
  outputPath: join(process.cwd(), "public", "videos", "billing-explainer.mp4"),
});
