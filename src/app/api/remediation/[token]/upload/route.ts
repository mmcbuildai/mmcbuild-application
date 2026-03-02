import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const admin = createAdminClient();

  // Validate token
  const { data: shareToken } = await admin
    .from("finding_share_tokens" as never)
    .select("id, finding_id, org_id, expires_at")
    .eq("token", token)
    .single();

  if (!shareToken) {
    return NextResponse.json({ error: "Invalid link" }, { status: 404 });
  }

  const st = shareToken as { id: string; finding_id: string; org_id: string; expires_at: string };

  if (new Date(st.expires_at) < new Date()) {
    return NextResponse.json({ error: "This link has expired" }, { status: 410 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  // 10MB limit
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = `${st.org_id}/${st.finding_id}/${Date.now()}-${file.name}`;

  const { error: uploadError } = await admin.storage
    .from("remediation-uploads")
    .upload(filePath, buffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      { error: `Upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    file_path: filePath,
    file_name: file.name,
  });
}
