"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { deriveSiteIntel } from "@/lib/site-intel";
import { getStaticMapUrl } from "@/lib/mapbox";
import { inngest } from "@/lib/inngest/client";

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

  if (error || !project)
    throw new Error(`Failed to create project: ${error?.message}`);

  // Derive site intel if we have geocoded coordinates
  const lat = latStr ? parseFloat(latStr) : null;
  const lng = lngStr ? parseFloat(lngStr) : null;

  if (lat != null && lng != null && isFinite(lat) && isFinite(lng)) {
    try {
      const intel = await deriveSiteIntel(lat, lng);
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

  // Check readiness: at least one plan with status "ready"
  const { data: readyPlans } = await admin
    .from("plans")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "ready")
    .limit(1);

  if (!readyPlans || readyPlans.length === 0) {
    return { error: "At least one processed plan is required before activation" };
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
    .select("latitude, longitude")
    .eq("project_id", projectId)
    .single();

  if (!existing?.latitude || !existing?.longitude) {
    throw new Error("No coordinates available to re-derive");
  }

  const lat = existing.latitude;
  const lng = existing.longitude;
  const intel = await deriveSiteIntel(lat, lng);
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
  fileSizeBytes: number
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
  const { data: plan, error: insertError } = await admin
    .from("plans")
    .insert({
      project_id: projectId,
      org_id: profile.org_id,
      file_name: fileName,
      file_path: filePath,
      file_size_bytes: fileSizeBytes,
      status: "uploading",
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (insertError) {
    return { error: `Failed to create plan record: ${insertError.message}` };
  }

  try {
    await inngest.send({
      name: "plan/uploaded",
      data: {
        projectId,
        fileUrl: filePath,
        fileName,
        uploadedBy: profile.id,
      },
    });
  } catch (e) {
    console.error("Failed to send Inngest event:", e);
  }

  return { success: true, planId: (plan as { id: string }).id };
}

export async function getProjectPlans(projectId: string) {
  const admin = createAdminClient();

  const { data } = await admin
    .from("plans")
    .select("id, file_name, file_size_bytes, page_count, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false });

  return data ?? [];
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
