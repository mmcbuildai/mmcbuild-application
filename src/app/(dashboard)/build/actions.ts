"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/supabase/db";
import { revalidatePath } from "next/cache";
import type { SpatialLayout } from "@/lib/build/spatial/types";
import { SAMPLE_DESIGNS } from "@/lib/beta/sample-designs";
import {
  FEATURED_TIER,
  distinctCategories,
  groupFeaturedByCategory,
  type FeaturedProduct,
} from "@/lib/direct/featured-suppliers";
import { z } from "zod";

/**
 * Sample designs are COPIED into each tester's project under a fresh storage
 * path, so the per-plan extraction cache (org + storage_path) always misses and
 * re-runs the full multi-storey 3D build — and the demo wipe clears the tester's
 * copy every cycle. But the SAMPLE SOURCE file (under the protected demo org)
 * keeps its finished extraction across wipes. So when a plan is a copy of a known
 * sample (matched by file name), fall back to the source's cached layout — no
 * re-run. Read-only; db() bypasses RLS to read the cross-org source row.
 */
async function findCachedSampleLayout(
  fileName: string | null,
): Promise<SpatialLayout | null> {
  if (!fileName) return null;
  const sample = SAMPLE_DESIGNS.find((s) => s.fileName === fileName);
  if (!sample) return null;
  const { data } = await db()
    .from("test_3d_jobs")
    .select("result")
    .eq("storage_path", sample.samplePath)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const row =
    (data as unknown as { result: { layout: SpatialLayout | null } | null } | null) ??
    null;
  return row?.result?.layout ?? null;
}

export async function requestDesignOptimisation(
  projectId: string,
  planId: string
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return { error: "Profile not found" };
  }

  // Cross-tenant isolation (SCRUM-340): db() below bypasses RLS, so prove the
  // projectId belongs to the caller's org BEFORE any project-scoped query —
  // otherwise a foreign projectId leaks the other org's in-flight run id via
  // the duplicate-run guard. Same assert as updateSelectedSystems.
  const { data: ownerProject } = await db()
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .maybeSingle();
  if (
    !ownerProject ||
    (ownerProject as { org_id: string }).org_id !== profile.org_id
  ) {
    return { error: "Project not found" };
  }

  // Duplicate-run guard — don't spawn a second optimisation while one is already
  // running for this project (mirrors the Comply/Quote guard).
  {
    const { data: inFlight } = await db()
      .from("design_checks")
      .select("id")
      .eq("project_id", projectId)
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inFlight) {
      return {
        error: "already_running",
        checkId: (inFlight as { id: string }).id,
        message: "A design optimisation is already running for this project.",
      };
    }
  }

  // Create design check record
  const { data: check, error } = await db()
    .from("design_checks")
    .insert({
      project_id: projectId,
      org_id: profile.org_id,
      plan_id: planId,
      status: "queued",
      created_by: profile.id,
    })
    .select("id")
    .single();

  if (error || !check) {
    return { error: `Failed to create design check: ${(error as { message: string })?.message}` };
  }

  // Fire Inngest event
  await inngest.send({
    name: "design/optimisation.requested",
    data: {
      projectId,
      planId,
    },
  });

  return { checkId: (check as { id: string }).id };
}

export async function getDesignReport(checkId: string) {
  // Cross-tenant isolation (SCRUM-340): db() bypasses RLS, so this report must
  // be scoped to the caller's org — otherwise any checkId returns another org's
  // design report. Authenticate, resolve the caller's org, and reject a check
  // that isn't theirs with the same "not found" message (no existence leak).
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated", check: null, suggestions: [] };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) {
    return { error: "Profile not found", check: null, suggestions: [] };
  }

  const { data: check, error: checkError } = await db()
    .from("design_checks")
    .select("id, project_id, org_id, plan_id, status, summary, stage, spatial_layout, started_at, completed_at, created_at")
    .eq("id", checkId)
    .single();

  if (checkError || !check) {
    return { error: "Design check not found", check: null, suggestions: [] };
  }

  if ((check as { org_id: string }).org_id !== profile.org_id) {
    return { error: "Design check not found", check: null, suggestions: [] };
  }

  const { data: suggestions } = await db()
    .from("design_suggestions")
    .select("*")
    .eq("check_id", checkId)
    .order("sort_order", { ascending: true });

  // SCRUM-171: surface featured (Growth Partner) suppliers' products under
  // suggestions whose MMC category they match — up to 3 per category. Only
  // growth_partner + approved suppliers' active products qualify; free/verified
  // suppliers stay Directory-only. db() bypasses RLS, so the tier/status/active
  // filters are applied explicitly here.
  const featuredByCategory = await loadFeaturedProductsByCategory(
    (suggestions ?? []) as { technology_category: string }[],
  );

  return { check, suggestions: suggestions ?? [], featuredByCategory };
}

async function loadFeaturedProductsByCategory(
  suggestions: { technology_category: string }[],
): Promise<Record<string, FeaturedProduct[]>> {
  const categories = distinctCategories(suggestions);
  if (categories.length === 0) return {};

  const { data: products } = await db()
    .from("supplier_products")
    .select(
      "id, professional_id, technology_category, name, summary, sku, price_estimate, lead_time_days, professionals!inner(company_name, tier, status)",
    )
    .in("technology_category", categories)
    .eq("is_active", true)
    .eq("professionals.tier", FEATURED_TIER)
    .eq("professionals.status", "approved")
    .order("created_at", { ascending: true });

  const flat: FeaturedProduct[] = (
    (products ?? []) as unknown as {
      id: string;
      professional_id: string;
      technology_category: string;
      name: string;
      summary: string | null;
      sku: string | null;
      price_estimate: number | null;
      lead_time_days: number | null;
      professionals: { company_name: string } | null;
    }[]
  ).map((p) => ({
    product_id: p.id,
    professional_id: p.professional_id,
    company_name: p.professionals?.company_name ?? "Supplier",
    technology_category: p.technology_category,
    name: p.name,
    summary: p.summary,
    sku: p.sku,
    price_estimate: p.price_estimate,
    lead_time_days: p.lead_time_days,
  }));

  return groupFeaturedByCategory(flat, 3);
}

const referralSchema = z.object({
  professionalId: z.string().uuid(),
  projectId: z.string().uuid().nullable().optional(),
  suggestionId: z.string().uuid().nullable().optional(),
  productId: z.string().uuid().nullable().optional(),
});

/**
 * SCRUM-171 lead tracking: log a directory referral when a user clicks through
 * from a featured product on a Build suggestion to the supplier. Scoped to the
 * caller's org; best-effort (a logging failure must not block the navigation).
 */
export async function logDirectoryReferral(input: {
  professionalId: string;
  projectId?: string | null;
  suggestionId?: string | null;
  productId?: string | null;
}) {
  const parsed = referralSchema.safeParse(input);
  if (!parsed.success) return { error: "Invalid referral" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return { error: "Profile not found" };

  const { error } = await db().from("directory_referrals").insert({
    project_id: parsed.data.projectId ?? null,
    org_id: profile.org_id,
    suggestion_id: parsed.data.suggestionId ?? null,
    professional_id: parsed.data.professionalId,
    product_id: parsed.data.productId ?? null,
    created_by: profile.id,
  });

  if (error) return { error: "Failed to log referral" };
  return { success: true };
}

export async function updateSelectedSystems(
  projectId: string,
  systems: string[]
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .single();

  if (!project || project.org_id !== profile.org_id) {
    return { error: "Project not found" };
  }

  const { error } = await admin
    .from("projects")
    .update({
      selected_systems: systems,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", projectId);

  if (error) return { error: `Failed to update systems: ${error.message}` };

  revalidatePath(`/build/${projectId}`);
  revalidatePath(`/comply/${projectId}`);
  revalidatePath(`/quote/${projectId}`);
  return { success: true };
}

export async function getProjectSelectedSystems(projectId: string): Promise<string[]> {
  // Cross-tenant isolation (SCRUM-340): db() bypasses RLS, so scope this read to
  // the caller's org — a foreign projectId must not return another org's systems.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return [];

  const { data } = await db()
    .from("projects")
    .select("selected_systems, org_id")
    .eq("id", projectId)
    .single();

  if (!data || (data as { org_id: string }).org_id !== profile.org_id) return [];
  const systems = (data as { selected_systems: string[] | null }).selected_systems;
  return Array.isArray(systems) ? systems : [];
}

export async function getProjectDesignChecks(projectId: string) {
  // Cross-tenant isolation (SCRUM-340): db() bypasses RLS, so scope this list to
  // the caller's org — a foreign projectId must not return another org's runs.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return [];

  const { data } = await db()
    .from("design_checks")
    .select("id, status, summary, created_at, completed_at")
    .eq("project_id", projectId)
    .eq("org_id", profile.org_id)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export type SuggestionDecision =
  | "undecided"
  | "pursuing"
  | "considering"
  | "rejected";

export async function setSuggestionDecision(
  suggestionId: string,
  decision: SuggestionDecision,
  note?: string,
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) return { error: "Profile not found" };

  const admin = createAdminClient();

  const { data: suggestion } = await admin
    .from("design_suggestions")
    .select("id, check_id, design_checks!inner(org_id, project_id)")
    .eq("id", suggestionId)
    .single();

  const checkRow = (suggestion as unknown as
    | {
        id: string;
        check_id: string;
        design_checks: { org_id: string; project_id: string };
      }
    | null) ?? null;

  if (!checkRow || checkRow.design_checks.org_id !== profile.org_id) {
    return { error: "Suggestion not found" };
  }

  const updates: Record<string, unknown> = {
    decision,
    decided_by: profile.id,
    decided_at: new Date().toISOString(),
  };
  if (note !== undefined) {
    updates.decision_note = note.trim() ? note.trim() : null;
  }

  const { error } = await admin
    .from("design_suggestions")
    .update(updates as never)
    .eq("id", suggestionId);

  if (error) {
    return { error: `Failed to set decision: ${error.message}` };
  }

  revalidatePath(
    `/build/${checkRow.design_checks.project_id}/report/${checkRow.check_id}`,
  );
  return { success: true };
}

// ---------------------------------------------------------------------------
// System-preview (pre-selection): render the project's already-uploaded plan
// in all four MMC systems BEFORE the user picks a construction system, so they
// can see what each system means for their design. Mirrors the /build/test-3d
// harness pipeline (enqueue → Inngest → test_3d_jobs → poll) but runs against
// the plan already uploaded during project setup — no second upload.
//
// Caching: a completed test_3d_jobs row for the same plan storage path is
// reused (instant + no repeat AI cost). Only the first preview per plan runs
// the extractor. Poll with getTest3DStatus() from ./test-3d/actions.
// ---------------------------------------------------------------------------
// Return a previously-extracted layout for a plan if one exists (from a build-
// page preview or test-3d run). Used by the report page as a fallback when the
// inline optimisation extractor returned null — the preview's raster path is
// more robust on CAD doc-sets, so reusing its result keeps the report's 3D from
// silently disappearing. Read-only; returns null when nothing is cached.
export async function getCachedPlanLayout(
  planId: string,
): Promise<SpatialLayout | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile?.org_id) return null;

  const { data: planRow } = await db()
    .from("plans")
    .select("org_id, file_path")
    .eq("id", planId)
    .single();
  const plan = (planRow as unknown as {
    org_id: string;
    file_path: string | null;
  } | null) ?? null;
  if (!plan || plan.org_id !== profile.org_id || !plan.file_path) return null;

  const { data: doneRow } = await db()
    .from("test_3d_jobs")
    .select("result")
    .eq("org_id", profile.org_id)
    .eq("storage_path", plan.file_path)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cached = (doneRow as unknown as
    | { result: { layout: SpatialLayout | null } | null }
    | null) ?? null;
  return cached?.result?.layout ?? null;
}

// Gate check: does this plan have a VALID extracted 3D layout? Design
// Optimisation only unlocks once the design has successfully extracted — an
// uploaded design we can't reconstruct in 3D is treated as invalid and must be
// fixed + re-uploaded, not optimised. Requires a done job whose result actually
// carries a layout (a "done" job can still have a null layout on a bad plan).
// Filters on the jsonb path so it stays lightweight (selects only an id).
export async function hasValidExtraction(planId: string): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile?.org_id) return false;

  const { data: planRow } = await db()
    .from("plans")
    .select("org_id, file_path")
    .eq("id", planId)
    .single();
  const plan = (planRow as unknown as {
    org_id: string;
    file_path: string | null;
  } | null) ?? null;
  if (!plan || plan.org_id !== profile.org_id || !plan.file_path) return false;

  const { data: row } = await db()
    .from("test_3d_jobs")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("storage_path", plan.file_path)
    .eq("status", "done")
    // Use ->> (text extraction): a failed extraction stores jsonb `null` at
    // result.layout, and `->` yields jsonb-null which is NOT SQL NULL — so
    // `result->layout is null` would NOT exclude it and the gate would wrongly
    // unlock for invalid designs. `->>` returns SQL NULL for a json-null value
    // (and the object's text for a real layout), so this correctly excludes
    // layout-less "done" jobs.
    .not("result->>layout", "is", null)
    .limit(1)
    .maybeSingle();

  return !!row;
}

export type StartSystemPreviewResult =
  | { layout: SpatialLayout }
  | { jobId: string }
  | { error: string };

export async function startProjectSystemPreview(
  planId: string,
): Promise<StartSystemPreviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile?.org_id) return { error: "Profile not found" };

  // Load the plan and confirm it belongs to the caller's org.
  const { data: planRow } = await db()
    .from("plans")
    .select("id, org_id, file_path, file_name, status")
    .eq("id", planId)
    .single();

  const plan = (planRow as unknown as {
    id: string;
    org_id: string;
    file_path: string | null;
    file_name: string | null;
    status: string;
  } | null) ?? null;

  if (!plan || plan.org_id !== profile.org_id) {
    return { error: "Plan not found" };
  }
  if (!plan.file_path) {
    return { error: "Plan has no stored file" };
  }

  // Cache hit: reuse a completed extraction for the same plan file.
  const { data: doneRow } = await db()
    .from("test_3d_jobs")
    .select("result")
    .eq("org_id", profile.org_id)
    .eq("storage_path", plan.file_path)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const cached = (doneRow as unknown as
    | { result: { layout: SpatialLayout | null } | null }
    | null) ?? null;
  if (cached?.result?.layout) {
    return { layout: cached.result.layout };
  }

  // Sample fallback: a copied sample reuses the source's persistent extraction.
  const sampleLayout = await findCachedSampleLayout(plan.file_name);
  if (sampleLayout) {
    return { layout: sampleLayout };
  }

  // No cached layout — enqueue the extraction job (same shape as the harness).
  const { data: job, error: insertError } = await db()
    .from("test_3d_jobs")
    .insert({
      user_id: user.id,
      org_id: profile.org_id,
      storage_path: plan.file_path,
      file_name: plan.file_name ?? "plan",
      page_input: null,
      status: "queued",
    })
    .select("id")
    .single();

  if (insertError || !job) {
    return {
      error: `Failed to start preview: ${insertError?.message ?? "unknown"}`,
    };
  }

  await inngest.send({
    name: "test3d/extract.requested",
    data: {
      jobId: (job as { id: string }).id,
      storagePath: plan.file_path,
      fileName: plan.file_name ?? "plan",
    },
  });

  return { jobId: (job as { id: string }).id };
}

export type CachedSystemPreviewResult =
  | { state: "done"; layout: SpatialLayout }
  | { state: "running"; jobId: string }
  | { state: "none" };

/**
 * READ-ONLY companion to startProjectSystemPreview. Lets the preview panel, on
 * mount, (a) restore an already-finished 3D so returning from Quote/another
 * screen doesn't force a "Show my design" re-click, and (b) re-attach to an
 * extraction that's still running for this plan instead of orphaning it and
 * starting a duplicate. No inserts, no Inngest sends.
 */
export async function getProjectSystemPreviewCached(
  planId: string,
): Promise<CachedSystemPreviewResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { state: "none" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("user_id", user.id)
    .single();
  if (!profile?.org_id) return { state: "none" };

  const { data: planRow } = await db()
    .from("plans")
    .select("org_id, file_path, file_name")
    .eq("id", planId)
    .single();
  const plan =
    (planRow as unknown as {
      org_id: string;
      file_path: string | null;
      file_name: string | null;
    } | null) ?? null;
  if (!plan || plan.org_id !== profile.org_id || !plan.file_path) {
    return { state: "none" };
  }

  // Most recent finished extraction for this plan file → restore instantly.
  const { data: doneRow } = await db()
    .from("test_3d_jobs")
    .select("result")
    .eq("org_id", profile.org_id)
    .eq("storage_path", plan.file_path)
    .eq("status", "done")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const cached =
    (doneRow as unknown as { result: { layout: SpatialLayout | null } | null } | null) ??
    null;
  if (cached?.result?.layout) {
    return { state: "done", layout: cached.result.layout };
  }

  // Sample fallback: a copied sample reuses the source's persistent extraction
  // (survives the demo wipe), so the demo/beta 3D restores instantly.
  const sampleLayout = await findCachedSampleLayout(plan.file_name);
  if (sampleLayout) {
    return { state: "done", layout: sampleLayout };
  }

  // Otherwise re-attach to an extraction that's still running for this plan —
  // but only a RECENT one (last 15 min), so a stale ghost (worker killed
  // mid-step, see the reaper task) can't pin the panel to a job that will
  // never finish.
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data: runningRow } = await db()
    .from("test_3d_jobs")
    .select("id")
    .eq("org_id", profile.org_id)
    .eq("storage_path", plan.file_path)
    .in("status", ["queued", "processing"])
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const running = (runningRow as unknown as { id: string } | null) ?? null;
  if (running?.id) {
    return { state: "running", jobId: running.id };
  }

  return { state: "none" };
}
