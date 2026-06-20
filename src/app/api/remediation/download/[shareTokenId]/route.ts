import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Authenticated download of a contributor's remediation attachment.
//
// This is the BUILDER-facing surface — deliberately SEPARATE from the public
// `/api/remediation/[token]` endpoints. It is gated by Supabase auth + an
// org-ownership check, and never touches or logs the public share token.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shareTokenId: string }> }
) {
  const { shareTokenId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  // Resolve the requesting user's org (same convention as the authed actions).
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const admin = createAdminClient();

  const { data: shareToken } = await admin
    .from("finding_share_tokens" as never)
    .select("id, org_id, response_file_path")
    .eq("id", shareTokenId)
    .single();

  if (!shareToken) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const st = shareToken as {
    id: string;
    org_id: string;
    response_file_path: string | null;
  };

  // Org-ownership gate — a builder may only download attachments on their own org.
  // Return 404 (not 403) so we don't reveal the existence of other orgs' rows.
  if (st.org_id !== profile.org_id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!st.response_file_path) {
    return NextResponse.json({ error: "No attachment" }, { status: 404 });
  }

  const { data: signed, error: signError } = await admin.storage
    .from("remediation-uploads")
    .createSignedUrl(st.response_file_path, 60);

  if (signError || !signed?.signedUrl) {
    return NextResponse.json(
      { error: "Failed to generate download link" },
      { status: 500 }
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
