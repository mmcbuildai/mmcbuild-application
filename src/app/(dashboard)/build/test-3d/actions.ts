"use server";

// The /build/test-3d harness used to run extraction synchronously inside
// this Server Action. That worked for PDFs (single Sonnet call) but blew
// past the Vercel edge ~60s connection-close window for DWG/RVT/SKP files
// that need CloudConvert + sheet decomposer + multiple AI calls. Per the
// project rule (CLAUDE.md: "operations >5s MUST use Inngest"), this is
// now an enqueue → poll flow backed by test_3d_jobs + an Inngest worker.
//
// The harness submits a file → enqueueTest3D creates a job row and fires
// `test3d/extract.requested` → Inngest runs the extractor without a
// connection timeout → harness polls getTest3DStatus every 2s until the
// row says status='done' or 'error'.

import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { inngest } from "@/lib/inngest/client";
import type { Test3DResult } from "@/lib/build/test-3d-types";

// NOTE: "use server" files in Next.js can only export async functions at
// runtime. `export type { Test3DResult }` looks fine to TypeScript but
// Turbopack treats it as a value re-export in the SSR bundle and the
// module fails to evaluate with "ReferenceError: Test3DResult is not
// defined". Consumers (e.g. test-3d-harness.tsx) must import the type
// directly from "@/lib/build/test-3d-types".

export type EnqueueTest3DInput = {
  storagePath: string;
  fileName: string;
  pageInput?: string;
};

export type EnqueueTest3DResult =
  | { jobId: string }
  | { error: string };

export async function enqueueTest3D(
  input: EnqueueTest3DInput,
): Promise<EnqueueTest3DResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Unauthorised" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.org_id) return { error: "Profile / org not found" };

  const { storagePath, fileName, pageInput } = input;

  // db() returns the admin client cast to any so it can address tables
  // that aren't in the generated Supabase types yet (test_3d_jobs is a
  // brand-new table — re-running supabase gen types would obviate this).
  // We've already verified the user above via getUser() and write the
  // canonical user_id below, so RLS is enforced by our own auth check
  // rather than by the table policy.
  const { data: job, error: insertError } = await db()
    .from("test_3d_jobs")
    .insert({
      user_id: user.id,
      org_id: profile.org_id,
      storage_path: storagePath,
      file_name: fileName,
      page_input: pageInput ?? null,
      status: "queued",
    })
    .select("id")
    .single();

  if (insertError || !job) {
    return { error: `Failed to enqueue job: ${insertError?.message ?? "unknown"}` };
  }

  await inngest.send({
    name: "test3d/extract.requested",
    data: {
      jobId: job.id,
      storagePath,
      fileName,
      pageInput,
    },
  });

  return { jobId: job.id };
}

export type Test3DStatus =
  | { status: "queued"; stage?: string | null }
  | { status: "processing"; stage?: string | null }
  | { status: "done"; result: Test3DResult }
  | { status: "error"; error: string }
  | { status: "not_found" }
  | { status: "unauthorised" };

export async function getTest3DStatus(jobId: string): Promise<Test3DStatus> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthorised" };

  const { data, error } = await db()
    .from("test_3d_jobs")
    .select("status, result, error, stage, user_id")
    .eq("id", jobId)
    .maybeSingle();

  if (error || !data) return { status: "not_found" };
  const row = data as {
    status: string;
    result: Test3DResult | null;
    error: string | null;
    stage: string | null;
    user_id: string;
  };
  if (row.user_id !== user.id) return { status: "unauthorised" };

  if (row.status === "done" && row.result) {
    return { status: "done", result: row.result };
  }
  if (row.status === "error") {
    return { status: "error", error: row.error ?? "Unknown error" };
  }
  if (row.status === "processing") return { status: "processing", stage: row.stage };
  return { status: "queued", stage: row.stage };
}
