"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/lib/supabase/db";
import { revalidatePath } from "next/cache";
import { deriveSiteIntel } from "@/lib/site-intel";
import { getStaticMapUrl } from "@/lib/services/mapbox";
import { inngest } from "@/lib/inngest/client";
import { getSampleDesign } from "@/lib/beta/sample-designs";
import {
  buildDesignPrefill,
  buildDesignPrefillFromAttributes,
  isPrefillPending,
  type DesignAttributes,
} from "@/lib/comply/questionnaire-prefill";
import type { SpatialLayout } from "@/lib/build/spatial/types";

async function getProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("id, org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) throw new Error("Profile not found");
  return profile as { id: string; org_id: string; role: string };
}

export async function createProject(formData: FormData) {
  const profile = await getProfile();
  const admin = createAdminClient();

  const name = formData.get("name") as string;
  const address = (formData.get("address") as string) || null;
  const latStr = formData.get("latitude") as string | null;
  const lngStr = formData.get("longitude") as string | null;
  const suburb = (formData.get("suburb") as string) || null;
  const postcode = (formData.get("postcode") as string) || null;
  const state = (formData.get("state") as string) || null;

  if (!name?.trim()) throw new Error("Project name is required");

  // Insert the project
  const { data: project, error } = await admin
    .from("projects")
    .insert({
      org_id: profile.org_id,
      name: name.trim(),
      address,
      status: "draft",
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (error || !project) {
    // 23505 = unique_violation. The unique_project_name_per_org constraint was
    // surfacing as a raw 500 ("duplicate key value violates…"); turn it into a
    // message the user can act on instead of a server error.
    if (
      error?.code === "23505" ||
      error?.message?.includes("unique_project_name_per_org")
    ) {
      throw new Error(
        `A project named "${name.trim()}" already exists. Please choose a different name.`,
      );
    }
    throw new Error(`Failed to create project: ${error?.message}`);
  }

  // Derive site intel if we have geocoded coordinates
  const lat = latStr ? parseFloat(latStr) : null;
  const lng = lngStr ? parseFloat(lngStr) : null;

  if (lat != null && lng != null && isFinite(lat) && isFinite(lng)) {
    try {
      const intel = await deriveSiteIntel({
        lat,
        lng,
        address: address ?? "",
        suburb,
        state,
        postcode,
      });
      const staticMapUrl = getStaticMapUrl(lat, lng);

      await admin.from("project_site_intel").insert({
        project_id: project.id,
        org_id: profile.org_id,
        latitude: lat,
        longitude: lng,
        formatted_address: address,
        suburb: suburb || null,
        postcode: postcode || null,
        state: state || null,
        climate_zone: intel.climate_zone,
        wind_region: intel.wind_region,
        bal_rating: intel.bal_rating,
        council_name: intel.council_name,
        council_code: intel.council_code,
        zoning: intel.zoning,
        overlays: {},
        static_map_url: staticMapUrl || null,
        derived_at: new Date().toISOString(),
      } as never);
    } catch (e) {
      // Site intel derivation is best-effort — project still created
      console.error("[createProject] Site intel derivation failed:", e);
    }
  }

  revalidatePath("/projects");
  return { projectId: project.id };
}

export async function copyProject(sourceProjectId: string) {
  const profile = await getProfile();
  const admin = createAdminClient();

  // 1. Verify ownership and load source
  const { data: source } = await admin
    .from("projects")
    .select("id, org_id, name, address")
    .eq("id", sourceProjectId)
    .single();

  if (!source || (source as { org_id: string }).org_id !== profile.org_id) {
    return { error: "Project not found" };
  }

  const src = source as { id: string; org_id: string; name: string; address: string | null };

  // 2. Find a unique name. Try "<name> (copy)", then "<name> (copy 2)", etc.
  const baseName = src.name.replace(/\s*\(copy(?:\s+\d+)?\)\s*$/, "");
  let candidate = `${baseName} (copy)`;
  for (let i = 2; i < 50; i++) {
    const { data: clash } = await admin
      .from("projects")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("name", candidate)
      .maybeSingle();
    if (!clash) break;
    candidate = `${baseName} (copy ${i})`;
  }

  // 3. Insert the new draft project
  const { data: created, error: insertError } = await admin
    .from("projects")
    .insert({
      org_id: profile.org_id,
      name: candidate,
      address: src.address,
      status: "draft",
      setup_step: 0,
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (insertError || !created) {
    return { error: `Failed to copy project: ${insertError?.message}` };
  }

  const newId = (created as { id: string }).id;

  // 4. Copy site intel (so derived data carries over without re-geocoding)
  const { data: intel } = await admin
    .from("project_site_intel")
    .select("*")
    .eq("project_id", sourceProjectId)
    .maybeSingle();

  if (intel) {
    const intelBody: Record<string, unknown> = { ...(intel as Record<string, unknown>) };
    delete intelBody.id;
    delete intelBody.project_id;
    delete intelBody.created_at;
    delete intelBody.updated_at;
    await admin.from("project_site_intel").insert({
      ...intelBody,
      project_id: newId,
      org_id: profile.org_id,
    } as never);
  }

  // 5. Copy questionnaire responses
  const { data: q } = await admin
    .from("questionnaire_responses")
    .select("responses, completed")
    .eq("project_id", sourceProjectId)
    .maybeSingle();

  if (q) {
    await admin.from("questionnaire_responses").insert({
      project_id: newId,
      org_id: profile.org_id,
      responses: (q as { responses: unknown }).responses,
      completed: (q as { completed: boolean }).completed,
      created_by: profile.id,
    } as never);
  }

  // 6. Copy contributors (team)
  const { data: contributors } = await admin
    .from("project_contributors")
    .select("discipline, company_name, contact_name, contact_email, contact_phone, notes")
    .eq("project_id", sourceProjectId);

  if (contributors && contributors.length > 0) {
    const rows = contributors.map((c) => ({
      ...(c as Record<string, unknown>),
      project_id: newId,
      org_id: profile.org_id,
      created_by: profile.id,
    }));
    await admin.from("project_contributors").insert(rows as never);
  }

  revalidatePath("/projects");
  return { success: true, projectId: newId };
}

export async function advanceProjectSetupStep(
  projectId: string,
  step: number,
) {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data: rawProject } = await admin
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  const project = rawProject as unknown as
    | { org_id: string; setup_step?: number | null; status: string }
    | null;

  if (!project || project.org_id !== profile.org_id) {
    return { error: "Project not found" };
  }

  const current = project.setup_step ?? 0;
  const target = Math.max(current, Math.min(4, Math.max(0, step)));

  if (target !== current) {
    const { error } = await admin
      .from("projects")
      .update({ setup_step: target } as never)
      .eq("id", projectId);
    if (error) return { error: `Failed to advance setup: ${error.message}` };
  }

  revalidatePath(`/projects/${projectId}`);
  return { success: true, setupStep: target };
}

export async function activateProject(projectId: string) {
  const profile = await getProfile();
  const admin = createAdminClient();

  // Verify project belongs to org and is draft
  const { data: project } = await admin
    .from("projects")
    .select("org_id, status")
    .eq("id", projectId)
    .single();

  if (!project || project.org_id !== profile.org_id) {
    return { error: "Project not found" };
  }

  if (project.status !== "draft") {
    return { error: "Project is already active" };
  }

  // Check readiness: at least one plan that finished processing into a usable
  // state. "ready" (fully ingested) and "manual_review" (geometry extracted,
  // deep embed deferred) both make the project usable for setup — the heavy 3D
  // / optimisation work happens later in the Build stage. Plans still in flight
  // ("uploading"/"processing") or genuinely failed ("error") don't qualify.
  const { data: usablePlans } = await admin
    .from("plans")
    .select("id")
    .eq("project_id", projectId)
    .in("status", ["ready", "manual_review"] as const)
    .limit(1);

  if (!usablePlans || usablePlans.length === 0) {
    // Give a specific reason instead of a generic "a processed plan is required"
    // when the user can see they uploaded one (it may have failed or still be
    // processing).
    const { data: anyPlans } = await admin
      .from("plans")
      .select("status")
      .eq("project_id", projectId);
    const statuses = (anyPlans ?? []).map((p) => (p as { status: string }).status);
    if (statuses.length === 0) {
      return { error: "Upload a building plan before activating." };
    }
    if (statuses.some((s) => s === "uploading" || s === "processing")) {
      return {
        error:
          "Your plan is still processing. Wait for it to finish, then activate.",
      };
    }
    return {
      error:
        "Your uploaded plan didn't finish processing successfully (status: " +
        statuses.join(", ") +
        "). Re-upload or fix it on the Documents tab, then activate.",
    };
  }

  // Check readiness: questionnaire completed
  const { data: questionnaire } = await admin
    .from("questionnaire_responses")
    .select("completed")
    .eq("project_id", projectId)
    .limit(1)
    .single();

  if (!questionnaire?.completed) {
    return { error: "Questionnaire must be completed before activation" };
  }

  // Activate
  const { error } = await admin
    .from("projects")
    .update({ status: "active", updated_at: new Date().toISOString() } as never)
    .eq("id", projectId);

  if (error) return { error: `Failed to activate project: ${error.message}` };

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/comply");
  return { success: true };
}

export async function getProjectSiteIntel(projectId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("project_site_intel")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  return data;
}

export async function updateProject(
  projectId: string,
  data: {
    name?: string;
    address?: string;
    status?: string;
  }
) {
  const profile = await getProfile();
  const admin = createAdminClient();

  // Verify project belongs to org
  const { data: project } = await admin
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .single();

  if (!project || project.org_id !== profile.org_id) {
    return { error: "Project not found" };
  }

  if (data.name !== undefined && !data.name.trim()) {
    return { error: "Project name cannot be empty" };
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (data.name !== undefined) updateData.name = data.name.trim();
  if (data.address !== undefined) updateData.address = data.address.trim() || null;
  if (data.status !== undefined) updateData.status = data.status;

  const { error } = await admin
    .from("projects")
    .update(updateData as never)
    .eq("id", projectId);

  if (error) return { error: `Failed to update project: ${error.message}` };

  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId}`);
  return { success: true };
}

export async function deleteProject(projectId: string) {
  const profile = await getProfile();
  const admin = createAdminClient();

  // Verify project belongs to org
  const { data: project } = await admin
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .single();

  if (!project || project.org_id !== profile.org_id) {
    return { error: "Project not found" };
  }

  // Delete related data in order (embeddings, plans, checks, findings, etc.)
  // Cascade should handle most via FK ON DELETE CASCADE, but clean up storage files

  // Get plans to delete storage files
  const { data: plans } = await admin
    .from("plans")
    .select("id, file_path")
    .eq("project_id", projectId);

  if (plans && plans.length > 0) {
    // Delete embeddings for all plans
    for (const plan of plans) {
      await admin
        .from("document_embeddings")
        .delete()
        .eq("source_type", "plan")
        .eq("source_id", plan.id);
    }

    // Delete storage files
    const filePaths = plans.map((p) => p.file_path).filter(Boolean);
    if (filePaths.length > 0) {
      await admin.storage.from("plan-uploads").remove(filePaths);
    }
  }

  // Get certifications to delete storage files
  const { data: certs } = await admin
    .from("project_certifications")
    .select("id, file_path")
    .eq("project_id", projectId);

  if (certs && certs.length > 0) {
    for (const cert of certs) {
      await admin
        .from("document_embeddings")
        .delete()
        .eq("source_type", "certification")
        .eq("source_id", cert.id);
    }

    const certPaths = certs.map((c) => c.file_path).filter(Boolean);
    if (certPaths.length > 0) {
      await admin.storage.from("plan-uploads").remove(certPaths);
    }
  }

  // Delete the project (cascades to plans, checks, findings, contributors, site_intel, etc.)
  const { error } = await admin
    .from("projects")
    .delete()
    .eq("id", projectId);

  if (error) return { error: `Failed to delete project: ${error.message}` };

  revalidatePath("/projects");
  revalidatePath("/comply");
  return { success: true };
}

export async function rederiveSiteIntel(projectId: string) {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("project_site_intel")
    .select("latitude, longitude, formatted_address, suburb, state, postcode")
    .eq("project_id", projectId)
    .single();

  if (!existing?.latitude || !existing?.longitude) {
    throw new Error("No coordinates available to re-derive");
  }

  const lat = existing.latitude;
  const lng = existing.longitude;
  const intel = await deriveSiteIntel({
    lat,
    lng,
    address: existing.formatted_address ?? "",
    suburb: existing.suburb,
    state: existing.state,
    postcode: existing.postcode,
  });
  const staticMapUrl = getStaticMapUrl(lat, lng);

  const { error } = await admin
    .from("project_site_intel")
    .update({
      climate_zone: intel.climate_zone,
      wind_region: intel.wind_region,
      bal_rating: intel.bal_rating,
      council_name: intel.council_name,
      council_code: intel.council_code,
      zoning: intel.zoning,
      static_map_url: staticMapUrl || null,
      derived_at: new Date().toISOString(),
    } as never)
    .eq("project_id", projectId)
    .eq("org_id", profile.org_id);

  if (error) throw new Error(`Re-derive failed: ${error.message}`);

  revalidatePath(`/projects/${projectId}`);
}

// ============================================================
// Plans
// ============================================================

export async function registerPlan(
  projectId: string,
  fileName: string,
  filePath: string,
  fileSizeBytes: number,
  fileKind: "pdf" | "image" | "dwg" | "rvt" | "skp" | "doc" = "pdf"
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

  const admin = createAdminClient();

  const { data: existingPlan } = await admin
    .from("plans")
    .select("id, status")
    .eq("project_id", projectId)
    .eq("file_name", fileName)
    .single();

  if (existingPlan) {
    if (existingPlan.status === "uploading" || existingPlan.status === "processing") {
      return { error: "This file is already being uploaded or processed. Please wait for it to finish." };
    }
    return { 
      error: `A file named "${fileName}" already exists in this project. Please rename the file and try again, or delete the existing file first.`,
      existingPlanId: existingPlan.id,
    };
  }

  const { data: plan, error: insertError } = await admin
    .from("plans")
    .insert({
      project_id: projectId,
      org_id: profile.org_id,
      file_name: fileName,
      file_path: filePath,
      file_size_bytes: fileSizeBytes,
      status: "uploading",
      file_kind: fileKind,
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (insertError) {
    return { error: `Failed to create plan record: ${insertError.message}` };
  }

  const planId = (plan as { id: string }).id;

  try {
    await inngest.send({
      name: "plan/uploaded",
      data: {
        projectId,
        planId,
        fileUrl: filePath,
        fileName,
        uploadedBy: profile.id,
      },
    });
  } catch (e) {
    // The processing pipeline is triggered entirely by this event. If the send
    // fails, the plan would otherwise sit in "uploading" forever while the
    // caller is told everything succeeded. Mark the row as errored (a retriable
    // state — see retryPlanProcessing) and surface the failure to the caller.
    console.error("Failed to send Inngest event:", e);
    await admin
      .from("plans")
      .update({ status: "error" } as never)
      .eq("id", planId);
    return {
      error:
        "The file uploaded, but processing could not be started. Please retry from the plan list.",
      planId,
    };
  }

  // Eager spatial extraction. Run the same robust extractor the 3D/Build stage
  // uses (run-test-3d-extraction) NOW, so the SpatialLayout is cached in
  // test_3d_jobs (keyed org_id + storage_path) and reused — without a second
  // extraction — by both the project-page 3D preview and Design Optimisation
  // (its reuse-project-page-layout step). The 3D isn't rendered at this stage;
  // we only pre-compute and cache. Best-effort: a failure here must never fail
  // the upload — the Comply embed path (plan/uploaded) still runs.
  try {
    const { data: extractJob } = await db()
      .from("test_3d_jobs")
      .insert({
        user_id: user.id,
        org_id: profile.org_id,
        storage_path: filePath,
        file_name: fileName,
        status: "queued",
      })
      .select("id")
      .single();

    if (extractJob) {
      await inngest.send({
        name: "test3d/extract.requested",
        data: {
          jobId: (extractJob as { id: string }).id,
          storagePath: filePath,
          fileName,
        },
      });
    }
  } catch (e) {
    console.error("[registerPlan] eager test-3d extraction enqueue failed:", e);
  }

  return { success: true, planId };
}

/**
 * Create a project from one of the ready sample designs (for testers who don't
 * have their own plan). Creates the project, copies the sample file into the
 * project's storage path, then registers it so it processes exactly like a
 * normal upload (Comply embed + eager 3D extraction).
 */
export async function createProjectFromSample(
  sampleId: string,
  projectName?: string,
) {
  const profile = await getProfile();
  const admin = createAdminClient();

  const sample = getSampleDesign(sampleId);
  if (!sample) return { error: "Unknown sample design" };

  const name = projectName?.trim() || sample.name;

  const { data: project, error } = await admin
    .from("projects")
    .insert({
      org_id: profile.org_id,
      name,
      status: "draft",
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (error || !project) {
    if (
      error?.code === "23505" ||
      error?.message?.includes("unique_project_name_per_org")
    ) {
      return {
        error: `A project named "${name}" already exists. Please choose a different name.`,
      };
    }
    return { error: `Failed to create project: ${error?.message}` };
  }
  const projectId = (project as { id: string }).id;

  // Copy the sample plan into this project's storage path.
  const safeName = sample.fileName.replace(/[^\w.\-]+/g, "_");
  const destPath = `${profile.org_id}/${projectId}/sample_${Date.now()}_${safeName}`;
  const { error: copyError } = await admin.storage
    .from("plan-uploads")
    .copy(sample.samplePath, destPath);

  if (copyError) {
    // Roll back the empty project so the tester isn't left with a dud.
    await admin.from("projects").delete().eq("id", projectId);
    return {
      error: `Couldn't load that sample design — it may not be set up yet. Please upload your own plan, or try another sample. (${copyError.message})`,
    };
  }

  const res = await registerPlan(
    projectId,
    sample.fileName,
    destPath,
    sample.sizeBytes,
    sample.fileKind,
  );
  if (res.error) {
    return { error: res.error, projectId };
  }

  return { success: true, projectId };
}

export async function retryPlanProcessing(planId: string) {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data: plan } = await admin
    .from("plans")
    .select("id, project_id, org_id, file_name, file_path, status, created_by")
    .eq("id", planId)
    .single();

  if (!plan || plan.org_id !== profile.org_id) {
    return { error: "Plan not found" };
  }

  if (plan.status !== "uploading" && plan.status !== "error") {
    return { error: "Plan is not in a retriable state" };
  }

  // Reset status to uploading
  await admin
    .from("plans")
    .update({ status: "uploading" } as never)
    .eq("id", planId);

  // Re-send Inngest event
  try {
    await inngest.send({
      name: "plan/uploaded",
      data: {
        projectId: plan.project_id,
        planId: plan.id,
        fileUrl: plan.file_path,
        fileName: plan.file_name,
        uploadedBy: plan.created_by,
      },
    });
  } catch (e) {
    return { error: "Failed to trigger reprocessing" };
  }

  revalidatePath(`/projects/${plan.project_id}`);
  return { success: true };
}

export async function getProjectPlans(projectId: string) {
  const admin = createAdminClient();

  // Select * because file_kind and extracted_layers are added by recent
  // migrations and may not be reflected in generated types yet.
  const { data } = await admin
    .from("plans")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return (data ?? []) as unknown as Array<{
    id: string;
    file_name: string;
    file_size_bytes: number;
    page_count: number | null;
    status: string;
    created_at: string;
    file_kind?: string | null;
    error_message?: string | null;
    extracted_layers?: {
      layers?: Array<{ name: string; entityCount: number }>;
      derived?: {
        likelyDoorCount: number | null;
        likelyWindowCount: number | null;
        likelyRoomCount: number | null;
      };
      totalEntities?: number;
    } | null;
  }>;
}

export async function deletePlan(planId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id, role")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    return { error: "Profile not found" };
  }

  const admin = createAdminClient();

  const { data: plan } = await admin
    .from("plans")
    .select("id, org_id, file_path")
    .eq("id", planId)
    .single();

  if (!plan || plan.org_id !== profile.org_id) {
    return { error: "Plan not found" };
  }

  await admin
    .from("document_embeddings")
    .delete()
    .eq("source_type", "plan")
    .eq("source_id", planId);

  await admin.from("plans").delete().eq("id", planId);

  await admin.storage.from("plan-uploads").remove([plan.file_path]);

  return { success: true };
}

// ============================================================
// Questionnaire
// ============================================================

export async function saveQuestionnaire(
  projectId: string,
  responses: Record<string, unknown>
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

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("questionnaire_responses")
    .select("id")
    .eq("project_id", projectId)
    .eq("org_id", profile.org_id)
    .limit(1)
    .single();

  if (existing) {
    const { error } = await admin
      .from("questionnaire_responses")
      .update({
        responses,
        completed: true,
      } as never)
      .eq("id", existing.id);

    if (error) {
      return { error: `Failed to update questionnaire: ${error.message}` };
    }

    return { success: true, questionnaireId: existing.id };
  }

  const { data: qr, error } = await admin
    .from("questionnaire_responses")
    .insert({
      project_id: projectId,
      org_id: profile.org_id,
      responses,
      completed: true,
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (error) {
    return { error: `Failed to save questionnaire: ${error.message}` };
  }

  return { success: true, questionnaireId: (qr as { id: string }).id };
}

export async function getProjectQuestionnaire(projectId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("questionnaire_responses")
    .select("id, responses, completed, created_at, updated_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data;
}

/**
 * Builds the design-driven questionnaire prefill for a project from the latest
 * design extraction that carries a spatial layout. Mirrors the address-driven
 * site-intel prefill: the values are offered as editable defaults the UI badges
 * as "Extracted from your design". Auth-guarded like the other project reads.
 *
 * Prefers a `completed` extraction but falls back to ANY row that has a
 * non-null `spatial_layout` (the geometry is what matters, not the status).
 *
 * When NO 3D spatial layout exists yet — the common case, because most users
 * run Comply against their design before ever running the Build/3D module —
 * it falls back to the lightweight `plans.design_attributes` extracted on
 * upload (`buildDesignPrefillFromAttributes`), so the questionnaire is still
 * pre-populated.
 */
export async function getProjectDesignPrefill(
  projectId: string,
): Promise<Record<string, string>> {
  // Auth + org guard (matches the other project reads in this file).
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .single();

  if (!project || project.org_id !== profile.org_id) {
    return {};
  }

  // Prefer a completed extraction; fall back to any row with spatial_layout.
  const { data: completedRow } = await admin
    .from("design_checks")
    .select("spatial_layout")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .not("spatial_layout", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let layout = (completedRow as { spatial_layout: SpatialLayout | null } | null)
    ?.spatial_layout;

  if (!layout) {
    const { data: anyRow } = await admin
      .from("design_checks")
      .select("spatial_layout")
      .eq("project_id", projectId)
      .not("spatial_layout", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    layout = (anyRow as { spatial_layout: SpatialLayout | null } | null)
      ?.spatial_layout;
  }

  const spatialPrefill = buildDesignPrefill(layout);
  if (Object.keys(spatialPrefill).length > 0) {
    return spatialPrefill;
  }

  // No 3D spatial layout yielded anything. Fall back to the lightweight
  // attributes extracted from the plan on upload (the common Comply-first path).
  const { data: planRow } = await admin
    .from("plans")
    .select("design_attributes")
    .eq("project_id", projectId)
    .not("design_attributes", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const attrs = (planRow as { design_attributes: DesignAttributes | null } | null)
    ?.design_attributes;

  return buildDesignPrefillFromAttributes(attrs);
}

/**
 * Combines the design prefill (see getProjectDesignPrefill) with a `pending`
 * flag so the questionnaire's hold-back gate knows whether to wait-and-poll for
 * an in-flight extraction before rendering the form.
 *
 * `pending` is true ONLY when the prefill is currently empty AND an extraction
 * that would plausibly still yield attributes is in flight — i.e. there is a
 * vision-capable plan (file_kind 'pdf'/'image') whose `design_attributes` is
 * still NULL, and no `design_checks.spatial_layout` exists yet. In every other
 * case (prefill already non-empty, no vision-capable plan, extraction already
 * landed, or only non-vision plans like DWG) `pending` is false so the gate
 * renders the form immediately and never traps the user.
 */
export async function getDesignPrefillState(
  projectId: string,
): Promise<{ prefill: Record<string, string>; pending: boolean }> {
  // Auth + org guard (matches getProjectDesignPrefill).
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data: project } = await admin
    .from("projects")
    .select("org_id")
    .eq("id", projectId)
    .single();

  if (!project || project.org_id !== profile.org_id) {
    return { prefill: {}, pending: false };
  }

  // Reuse the existing prefill logic (also re-runs its own auth/org guard).
  const prefill = await getProjectDesignPrefill(projectId);
  if (Object.keys(prefill).length > 0) {
    return { prefill, pending: false };
  }

  // Empty prefill — is an extraction plausibly still coming? A vision-capable
  // plan (pdf/image) whose design_attributes hasn't been written yet means the
  // on-upload extraction may not have finished.
  const { data: pendingPlans } = await admin
    .from("plans")
    .select("id")
    .eq("project_id", projectId)
    .in("file_kind", ["pdf", "image"] as const)
    .is("design_attributes", null)
    .limit(1);

  const hasPendingVisionPlan = !!pendingPlans && pendingPlans.length > 0;
  if (!hasPendingVisionPlan) {
    return { prefill, pending: false };
  }

  // The 3D spatial layout is the other prefill source; if it already existed the
  // prefill above would have been non-empty, but guard explicitly: only treat as
  // pending when no spatial_layout has landed yet either.
  const { data: layoutRow } = await admin
    .from("design_checks")
    .select("id")
    .eq("project_id", projectId)
    .not("spatial_layout", "is", null)
    .limit(1)
    .maybeSingle();

  const hasSpatialLayout = !!layoutRow;

  return {
    prefill,
    pending: isPrefillPending({ prefill, hasPendingVisionPlan, hasSpatialLayout }),
  };
}

// ============================================================
// Certifications
// ============================================================

export async function registerCertification(
  projectId: string,
  fileName: string,
  filePath: string,
  fileSizeBytes: number,
  certType: string,
  metadata?: {
    issuerName?: string;
    issueDate?: string;
    notes?: string;
    state?: string;
  }
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

  const admin = createAdminClient();
  const { data: cert, error: insertError } = await admin
    .from("project_certifications")
    .insert({
      project_id: projectId,
      org_id: profile.org_id,
      cert_type: certType,
      file_name: fileName,
      file_path: filePath,
      file_size_bytes: fileSizeBytes,
      status: "uploading",
      state: metadata?.state ?? null,
      issuer_name: metadata?.issuerName ?? null,
      issue_date: metadata?.issueDate ?? null,
      notes: metadata?.notes ?? null,
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (insertError) {
    return { error: `Failed to create certification record: ${insertError.message}` };
  }

  try {
    await inngest.send({
      name: "certification/uploaded",
      data: {
        projectId,
        certificationId: (cert as { id: string }).id,
        fileName,
        filePath,
        certType,
      },
    });
  } catch (e) {
    console.error("Failed to send Inngest event:", e);
  }

  return { success: true, certificationId: (cert as { id: string }).id };
}

export async function updateCertification(
  certId: string,
  updates: {
    certType?: string;
    issuerName?: string;
    issueDate?: string;
    notes?: string;
  }
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

  const { data: cert } = await admin
    .from("project_certifications")
    .select("org_id")
    .eq("id", certId)
    .single();

  if (!cert || cert.org_id !== profile.org_id) {
    return { error: "Certification not found" };
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.certType !== undefined) updateData.cert_type = updates.certType;
  if (updates.issuerName !== undefined) updateData.issuer_name = updates.issuerName || null;
  if (updates.issueDate !== undefined) updateData.issue_date = updates.issueDate || null;
  if (updates.notes !== undefined) updateData.notes = updates.notes || null;

  const { error } = await admin
    .from("project_certifications")
    .update(updateData as never)
    .eq("id", certId);

  if (error) return { error: `Failed to update certification: ${error.message}` };

  return { success: true };
}

export async function deleteCertification(certId: string) {
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

  const { data: cert } = await admin
    .from("project_certifications")
    .select("id, org_id, file_path")
    .eq("id", certId)
    .single();

  if (!cert || cert.org_id !== profile.org_id) {
    return { error: "Certification not found" };
  }

  await admin
    .from("document_embeddings")
    .delete()
    .eq("source_type", "certification")
    .eq("source_id", certId);

  await admin.storage.from("engineering-certs").remove([cert.file_path]);

  const { error } = await admin
    .from("project_certifications")
    .delete()
    .eq("id", certId);

  if (error) return { error: `Failed to delete certification: ${error.message}` };

  return { success: true };
}

export async function getProjectCertifications(projectId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("project_certifications")
    .select("id, cert_type, file_name, file_size_bytes, status, issuer_name, issue_date, notes, error_message, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

// ============================================================
// Project Contributors
// ============================================================

export async function addProjectContributor(
  projectId: string,
  data: {
    contact_name: string;
    discipline: string;
    company_name?: string;
    contact_email?: string;
    contact_phone?: string;
    notes?: string;
  }
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
  const { data: contributor, error } = await admin
    .from("project_contributors" as never)
    .insert({
      project_id: projectId,
      org_id: profile.org_id,
      discipline: data.discipline,
      contact_name: data.contact_name,
      company_name: data.company_name ?? null,
      contact_email: data.contact_email ?? null,
      contact_phone: data.contact_phone ?? null,
      notes: data.notes ?? null,
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (error) return { error: `Failed to add contributor: ${error.message}` };

  return { success: true, contributorId: (contributor as { id: string }).id };
}

export async function updateProjectContributor(
  contributorId: string,
  data: {
    contact_name?: string;
    discipline?: string;
    company_name?: string;
    contact_email?: string;
    contact_phone?: string;
    notes?: string;
  }
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

  const { data: existing } = await admin
    .from("project_contributors" as never)
    .select("org_id")
    .eq("id", contributorId)
    .single();

  if (!existing || (existing as { org_id: string }).org_id !== profile.org_id) {
    return { error: "Contributor not found" };
  }

  const { error } = await admin
    .from("project_contributors" as never)
    .update({ ...data, updated_at: new Date().toISOString() } as never)
    .eq("id", contributorId);

  if (error) return { error: `Failed to update contributor: ${error.message}` };

  return { success: true };
}

export async function removeProjectContributor(contributorId: string) {
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

  const { data: existing } = await admin
    .from("project_contributors" as never)
    .select("org_id")
    .eq("id", contributorId)
    .single();

  if (!existing || (existing as { org_id: string }).org_id !== profile.org_id) {
    return { error: "Contributor not found" };
  }

  const { error } = await admin
    .from("project_contributors" as never)
    .delete()
    .eq("id", contributorId);

  if (error) return { error: `Failed to remove contributor: ${error.message}` };

  return { success: true };
}

export async function getProjectContributors(projectId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("project_contributors" as never)
    .select("id, discipline, company_name, contact_name, contact_email, contact_phone, notes, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  return (data ?? []) as {
    id: string;
    discipline: string;
    company_name: string | null;
    contact_name: string;
    contact_email: string | null;
    contact_phone: string | null;
    notes: string | null;
    created_at: string;
  }[];
}
