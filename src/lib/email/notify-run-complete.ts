import { db } from "@/lib/supabase/db";
import { sendEmail } from "./resend";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://app.mmcbuild.com.au";

type RunKind = "comply" | "quote" | "optimisation";

const META: Record<
  RunKind,
  { table: string; label: string; path: (projectId: string) => string }
> = {
  comply: {
    table: "compliance_checks",
    label: "compliance report",
    path: (p) => `/comply/${p}`,
  },
  quote: {
    table: "cost_estimates",
    label: "cost estimation report",
    path: (p) => `/quote/${p}`,
  },
  optimisation: {
    table: "design_checks",
    label: "design optimisation report",
    path: (p) => `/build/${p}`,
  },
};

/**
 * Email the run owner when a long AI job finishes, so they can leave the page or
 * close the tab and still be told it's ready — the in-app "Notify me" browser
 * notification only fires while the tab is open. Best-effort + never throws (so
 * it can't fail the job); call it inside a single Inngest `step.run` so it isn't
 * re-sent on a step retry. Resolves the owner from `created_by` → profiles.email.
 *
 * NOTE: currently fires for every completed run. A per-run opt-in (only email
 * when the user actually clicked "Notify me") needs a `notify_email` column —
 * deferred until a prod migration can be applied (the CLI token in use lacks the
 * privilege to push one).
 */
export async function notifyRunComplete(
  kind: RunKind,
  rowId: string,
  ok: boolean,
  reason?: string | null,
): Promise<void> {
  try {
    const admin = db();
    const m = META[kind];

    const { data: row } = await admin
      .from(m.table)
      .select("project_id, created_by")
      .eq("id", rowId)
      .single();
    const r = (row as { project_id?: string; created_by?: string } | null) ?? null;
    if (!r?.created_by || !r.project_id) return;

    const { data: prof } = await admin
      .from("profiles")
      .select("email, full_name")
      .eq("id", r.created_by)
      .single();
    const email = (prof as { email?: string } | null)?.email;
    if (!email) return;
    const name = (prof as { full_name?: string } | null)?.full_name ?? "there";

    const { data: proj } = await admin
      .from("projects")
      .select("name")
      .eq("id", r.project_id)
      .single();
    const projectName = (proj as { name?: string } | null)?.name ?? "your project";
    const url = `${APP_URL}${m.path(r.project_id)}`;

    if (ok) {
      await sendEmail({
        to: email,
        subject: `Your ${m.label} is ready — ${projectName}`,
        html: `<p>Hi ${name},</p>
<p>Your ${m.label} for <strong>${projectName}</strong> is ready to view in MMC Build.</p>
<p><a href="${url}">Open the report</a></p>
<p>— MMC Build</p>`,
      });
    } else {
      await sendEmail({
        to: email,
        subject: `Your ${m.label} couldn't be completed — ${projectName}`,
        html: `<p>Hi ${name},</p>
<p>Your ${m.label} for <strong>${projectName}</strong> didn't finish${reason ? `: ${reason}` : "."}</p>
<p><a href="${url}">Open MMC Build to try again</a></p>
<p>— MMC Build</p>`,
      });
    }
  } catch (e) {
    console.error("[notifyRunComplete] non-fatal:", (e as Error).message);
  }
}
