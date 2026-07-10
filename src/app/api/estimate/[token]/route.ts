import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Public, anonymous retrieval of an indicative estimate by opaque token.
// Mirrors /api/remediation/[token]: validate the token + expiry via the
// service-role admin client; never log the token; never widen operations.
export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  // @cross-tenant-ok: opaque-token-gated public retrieval; estimate_id comes from the validated token row (not caller-supplied) and expiry is enforced
  const { token } = await params;
  const admin = createAdminClient();

  const { data: tok } = await admin
    .from("marketplace_estimate_tokens" as never)
    .select("estimate_id, expires_at")
    .eq("token", token)
    .single();

  if (!tok) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 404 });
  }

  const t = tok as { estimate_id: string; expires_at: string };
  if (new Date(t.expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  const { data: estimate } = await admin
    .from("marketplace_estimates" as never)
    .select(
      "id, enquiry_id, status, low_cents, high_cents, currency, line_items, disclaimer, rate_source_type, created_at"
    )
    .eq("id", t.estimate_id)
    .single();

  if (!estimate) {
    return NextResponse.json({ error: "Estimate not found" }, { status: 404 });
  }

  const { data: enquiry } = await admin
    .from("marketplace_enquiries" as never)
    .select("raw_query, region, discovered_intent")
    .eq("id", (estimate as { enquiry_id: string }).enquiry_id)
    .single();

  return NextResponse.json({ estimate, enquiry });
}
