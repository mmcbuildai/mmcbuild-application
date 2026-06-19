#!/usr/bin/env node
/**
 * Reclaim Supabase storage by trimming test/cruft files from the plan-uploads
 * bucket (the one over quota: ~1.75 GB / 133 files against a 1 GB free cap).
 *
 * SAFE by design:
 *  - Targets clearly-disposable artifacts BY PATH:
 *      <org>/test-3d/...            test-3d extraction working files
 *      <org>/test-3d/optimised/...  generated optimisation outputs (regenerable)
 *      00000000-0000-0000-0000-000000000000/...  sentinel/system-org test uploads
 *  - NEVER deletes a file referenced by a live plans.file_path (safety net), so
 *    a real tester's uploaded plan is always kept even if it somehow sat under
 *    one of those paths.
 *  - Deletes via the Storage API remove() — NOT a raw SQL delete on
 *    storage.objects — so the underlying blob is actually freed (a raw row
 *    delete just orphans the blob, which keeps counting against quota).
 *
 * --include-orphans additionally removes ANY plan-uploads file not referenced by
 * a live plan (broader sweep). Guarded: only runs if the plans join matched at
 * least 3 real files, so a file_path/object-name format mismatch can't nuke
 * everything.
 *
 * Usage (from repo root, prod creds in env / .env.local):
 *   node scripts/trim-storage.mjs                     # dry-run, safe set
 *   node scripts/trim-storage.mjs --apply             # delete the safe set
 *   node scripts/trim-storage.mjs --include-orphans   # dry-run, broader set
 *   node scripts/trim-storage.mjs --include-orphans --apply
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  try {
    for (const line of readFileSync(".env.local", "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* rely on real env */
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (env or .env.local)."
  );
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const INCLUDE_ORPHANS = process.argv.includes("--include-orphans");
const BUCKET = "plan-uploads";

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sizeOf = (o) => Number(o.metadata?.size ?? 0);
function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

function category(name) {
  if (name.includes("/test-3d/optimised/")) return "test-3d optimised (generated)";
  if (name.includes("/test-3d/")) return "test-3d working files";
  if (name.startsWith("00000000-0000-0000-0000-000000000000/"))
    return "sentinel/system-org test uploads";
  return "orphan (not referenced by a live plan)";
}
const isSafePath = (name) =>
  name.includes("/test-3d/") ||
  name.startsWith("00000000-0000-0000-0000-000000000000/");

async function main() {
  // 1. KEEP — every live plan's file_path. Never delete these.
  const { data: plans, error: planErr } = await admin
    .from("plans")
    .select("file_path");
  if (planErr) throw planErr;
  const keep = new Set(
    (plans ?? []).map((p) => p.file_path).filter(Boolean)
  );

  // 2. All objects in the bucket (paged from storage.objects).
  const objs = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .schema("storage")
      .from("objects")
      .select("name, metadata")
      .eq("bucket_id", BUCKET)
      .range(from, from + PAGE - 1);
    if (error) throw error;
    objs.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }

  const referencedCount = objs.filter((o) => keep.has(o.name)).length;

  // 3. Candidate set.
  let candidates = objs.filter((o) => isSafePath(o.name) && !keep.has(o.name));
  if (INCLUDE_ORPHANS) {
    if (referencedCount < 3) {
      console.error(
        `\n⚠️  Refusing --include-orphans: only ${referencedCount} objects matched a live ` +
          `plans.file_path, so the path format may not match object names. The safe ` +
          `path-based set is still shown/used below.\n`
      );
    } else {
      const extra = objs.filter(
        (o) => !isSafePath(o.name) && !keep.has(o.name)
      );
      candidates = [...candidates, ...extra];
    }
  }

  // 4. Report.
  const byCat = new Map();
  for (const o of candidates) {
    const c = category(o.name);
    const e = byCat.get(c) ?? { files: 0, bytes: 0 };
    e.files++;
    e.bytes += sizeOf(o);
    byCat.set(c, e);
  }
  const total = candidates.reduce((s, o) => s + sizeOf(o), 0);
  const bucketTotal = objs.reduce((s, o) => s + sizeOf(o), 0);

  console.log(
    `\n${BUCKET}: ${objs.length} files, ${fmt(bucketTotal)} total. ` +
      `${referencedCount} referenced by a live plan (kept).`
  );
  console.log(`\nReclaimable candidates by category:`);
  for (const [c, e] of [...byCat.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
    console.log(`  ${fmt(e.bytes).padStart(9)}  ${String(e.files).padStart(4)} files  ${c}`);
  }
  console.log(`  ${"-".repeat(9)}`);
  console.log(`  ${fmt(total).padStart(9)}  ${String(candidates.length).padStart(4)} files  TOTAL reclaimable`);
  console.log(
    `\n  After trim: ${fmt(bucketTotal - total)} (from ${fmt(bucketTotal)})`
  );

  if (!APPLY) {
    console.log(
      `\nDRY-RUN — nothing deleted. Re-run with --apply to remove the above` +
        `${INCLUDE_ORPHANS ? "" : " (add --include-orphans for the broader set)"}.`
    );
    return;
  }

  // 5. Delete via the Storage API in batches.
  console.log(`\nAPPLY — deleting ${candidates.length} files...`);
  let removed = 0;
  let freed = 0;
  for (let i = 0; i < candidates.length; i += 100) {
    const batch = candidates.slice(i, i + 100);
    const { error } = await admin.storage
      .from(BUCKET)
      .remove(batch.map((o) => o.name));
    if (error) {
      console.error(`  batch ${i / 100 + 1} failed: ${error.message}`);
      continue;
    }
    removed += batch.length;
    freed += batch.reduce((s, o) => s + sizeOf(o), 0);
    console.log(`  ${removed}/${candidates.length} removed (${fmt(freed)} freed)`);
  }
  console.log(`\nDone. Removed ${removed} files, freed ${fmt(freed)}.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
