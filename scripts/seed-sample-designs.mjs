#!/usr/bin/env node
/**
 * Seed the stable `plan-uploads/samples/` folder with ready sample designs that
 * beta testers can use when they don't have their own plan. Copies a few known
 * good plans (currently tester uploads) into samples/ so the sample-design
 * picker has stable files to clone from. Idempotent: skips a sample that already
 * exists. The destination names MUST match src/lib/beta/sample-designs.ts.
 *
 * Run ONCE against prod (creds in env / .env.local):
 *   node scripts/seed-sample-designs.mjs            # dry-run, lists actions
 *   node scripts/seed-sample-designs.mjs --apply    # copy the files
 *
 * If a SOURCE path is missing (file moved/deleted), it logs and skips — edit the
 * SAMPLES map below to point at a current good plan, then re-run.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* rely on real env */
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");
const BUCKET = "plan-uploads";
const admin = createClient(url, key, { auth: { persistSession: false } });

// dest (must match sample-designs.ts samplePath) -> source path to copy from.
const SAMPLES = {
  "samples/gladesville-two-storey.pdf":
    "fef03b67-2f82-4250-93de-87ded6e297ef/0484d6cf-7d4a-49f2-9f83-858c5cf0e236/1781779368183_1780977413263_260603_Architectural_Drawings.pdf",
  "samples/manor-home.pdf":
    "00000000-0000-0000-0000-000000000000/77c7a695-e030-4240-a021-6190aecea78d/1777592776488_MH01_Manor_Homes_01_by_Studio_Johnston-01.pdf",
  "samples/terrace.pdf":
    "71d9fefc-97ec-442c-b22c-eb01be1c5583/929b572f-0bfd-469e-8068-683c1a7cbe7e/1781405698797_TH01_Terraces_01_by_Carter_Williamson-01.pdf",
};

async function exists(path) {
  const dir = path.split("/").slice(0, -1).join("/");
  const file = path.split("/").pop();
  const { data } = await admin.storage.from(BUCKET).list(dir, { search: file });
  return (data ?? []).some((o) => o.name === file);
}

async function main() {
  console.log(APPLY ? "MODE: APPLY\n" : "MODE: DRY-RUN (no copies)\n");
  for (const [dest, source] of Object.entries(SAMPLES)) {
    if (await exists(dest)) {
      console.log(`  skip   ${dest} (already exists)`);
      continue;
    }
    if (!(await exists(source))) {
      console.log(`  MISS   source not found: ${source}\n         -> edit SAMPLES to a current good plan for ${dest}`);
      continue;
    }
    if (!APPLY) {
      console.log(`  would copy  ${source}\n           -> ${dest}`);
      continue;
    }
    const { error } = await admin.storage.from(BUCKET).copy(source, dest);
    if (error) console.log(`  FAIL   ${dest}: ${error.message}`);
    else console.log(`  copied ${dest}`);
  }
  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
