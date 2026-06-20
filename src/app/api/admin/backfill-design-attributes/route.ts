import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOperatorEmail } from "@/lib/auth/operator";
import { inngest } from "@/lib/inngest/client";

// One-off operator backfill: queue the lightweight design-attribute extraction
// for EXISTING plans that have no design_attributes yet (the extraction only
// runs automatically on new uploads). Operator-gated. Safe to re-run — it only
// targets plans still missing attributes, so already-populated plans are
// skipped. Each queued plan costs one vision call, so the count is returned for
// cost awareness; capped per run to avoid a large burst.
const MAX_PER_RUN = 300;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  if (!isOperatorEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Plans missing attributes that have a stored file. Vision-path filtering
  // (pdf/image) happens inside the extractor — non-vision kinds return early.
  const { data: plans, error } = await admin
    .from("plans")
    .select("id, file_kind")
    .is("design_attributes", null)
    .not("file_path", "is", null)
    .order("created_at", { ascending: false })
    .limit(MAX_PER_RUN);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (plans ?? []) as Array<{ id: string; file_kind: string | null }>;
  const candidates = rows.filter((p) => {
    const kind = p.file_kind ?? "pdf";
    return kind === "pdf" || kind === "image";
  });

  let queued = 0;
  for (const p of candidates) {
    try {
      await inngest.send({
        name: "plan/attributes.requested",
        data: { planId: p.id },
      });
      queued++;
    } catch (e) {
      console.error(`[backfill-design-attributes] failed to queue ${p.id}:`, e);
    }
  }

  return NextResponse.json({
    scanned: rows.length,
    vision_candidates: candidates.length,
    queued,
    capped: rows.length >= MAX_PER_RUN,
    note: "Re-run after a minute to catch any remaining once these complete.",
  });
}
