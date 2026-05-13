import { NextResponse } from "next/server";
import { leadSchema, type LeadInput } from "@/lib/validators/lead";
import { db } from "@/lib/supabase/db";
import { submitToHubSpotForm } from "@/lib/hubspot/forms";
import { notifyKarenOfNewLead } from "@/lib/email/leads";

export const runtime = "nodejs";

type LeadRow = {
  form_type: LeadInput["formType"];
  first_name: string;
  last_name: string | null;
  email: string;
  phone_country: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  interest: string | null;
  message: string | null;
  source_page: string | null;
};

function toRow(lead: LeadInput): LeadRow {
  return {
    form_type: lead.formType,
    first_name: lead.firstName,
    last_name: lead.lastName || null,
    email: lead.email,
    phone_country: lead.phoneCountry || null,
    phone: lead.phone || null,
    company: lead.company || null,
    role: lead.role || null,
    interest: lead.interest || null,
    message: lead.message || null,
    source_page: lead.sourcePage || null,
  };
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = leadSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_failed", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const lead = parsed.data;

  // 1. Persist to Supabase (source of truth). If this fails, 500 — never lose a lead.
  // Using db() helper since leads is not yet in generated Database types.
  const supabase = db();
  const { data: inserted, error: insertErr } = await supabase
    .from("leads")
    .insert(toRow(lead))
    .select("id")
    .single();

  if (insertErr || !inserted) {
    console.error("[/api/leads] supabase insert failed", insertErr);
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }

  const leadId = inserted.id as string;

  // 2. HubSpot sync (CRM). Failure is non-fatal — Inngest retry later.
  const hsResult = await submitToHubSpotForm(lead);
  if (hsResult.ok) {
    await supabase
      .from("leads")
      .update({
        hubspot_sync_status: "synced",
        hubspot_synced_at: new Date().toISOString(),
        hubspot_error: null,
      })
      .eq("id", leadId);
  } else {
    console.warn("[/api/leads] hubspot sync failed", hsResult);
    await supabase
      .from("leads")
      .update({
        hubspot_sync_status: "failed",
        hubspot_error: hsResult.error,
        hubspot_retry_count: 1,
        hubspot_last_retry_at: new Date().toISOString(),
      })
      .eq("id", leadId);
  }

  // 3. Email alert to Karen. Always attempted, never blocks success response.
  const emailResult = await notifyKarenOfNewLead(lead);
  if (emailResult.ok) {
    await supabase
      .from("leads")
      .update({ email_alert_sent_at: new Date().toISOString(), email_alert_error: null })
      .eq("id", leadId);
  } else {
    console.warn("[/api/leads] resend failed", emailResult.error);
    await supabase.from("leads").update({ email_alert_error: emailResult.error }).eq("id", leadId);
  }

  return NextResponse.json({ ok: true, id: leadId });
}
