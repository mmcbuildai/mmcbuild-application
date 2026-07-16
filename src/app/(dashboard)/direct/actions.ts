"use server";

import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { db } from "@/lib/supabase/db";
import { isOperatorEmail } from "@/lib/auth/operator";
import {
  registrationSchema,
  profileUpdateSchema,
  reviewSchema,
  enquirySchema,
  portfolioItemSchema,
  companyDocumentSchema,
  type RegistrationInput,
  type ProfileUpdateInput,
  type ReviewInput,
  type EnquiryInput,
  type PortfolioItemInput,
  type CompanyDocumentInput,
} from "@/lib/direct/validators";

async function getAuthProfile() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id, full_name, role")
    .eq("user_id", user.id)
    .single();

  return profile;
}

// ─── Registration ───

export async function registerProfessional(input: RegistrationInput) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  const parsed = registrationSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { specialisations, ...data } = parsed.data;

  // Check if org already has a listing
  const { data: existing } = await db()
    .from("professionals")
    .select("id")
    .eq("org_id", profile.org_id)
    .single();

  if (existing) {
    return {
      error:
        "Your organisation already has a directory listing — edit it from the Directory instead of registering again.",
    };
  }

  const { data: professional, error } = await db()
    .from("professionals")
    .insert({
      ...data,
      org_id: profile.org_id,
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !professional) {
    // The only UNIQUE on professionals is (org_id) — a 23505 here means the org
    // already has a listing (e.g. the pre-check raced). Surface the SAME clear,
    // actionable message rather than a raw "duplicate key…" string, which read to
    // testers like a confusing "duplicate email" error (Karen, 2026-06-25).
    const code = (error as { code?: string })?.code;
    if (code === "23505") {
      return {
        error:
          "Your organisation already has a directory listing — edit it from the Directory instead of registering again.",
      };
    }
    return { error: `Failed to register: ${(error as { message: string })?.message}` };
  }

  const profId = (professional as { id: string }).id;

  // Insert specialisations
  if (specialisations && specialisations.length > 0) {
    await db()
      .from("professional_specialisations")
      .insert(
        specialisations.map((label: string) => ({
          professional_id: profId,
          label,
        }))
      );
  }

  // Send notification to Karen about new registration
  await inngest.send({
    name: "direct/professional.registered",
    data: {
      professionalId: profId,
      companyName: data.company_name,
      tradeType: data.trade_type,
      contactName: profile.full_name,
      contactEmail: data.email,
      regions: data.regions,
      specialisations: specialisations || [],
    },
  });

  return { id: profId };
}

// ─── Profile Management ───

export async function getMyProfessional() {
  const profile = await getAuthProfile();
  if (!profile) return null;

  const { data } = await db()
    .from("professionals")
    .select("*")
    .eq("org_id", profile.org_id)
    .single();

  if (!data) return null;

  const { data: specs } = await db()
    .from("professional_specialisations")
    .select("*")
    .eq("professional_id", data.id);

  return { ...data, specialisations: specs ?? [] };
}

export async function updateProfessionalProfile(id: string, input: ProfileUpdateInput) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  const parsed = profileUpdateSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Verify ownership
  const { data: pro } = await db()
    .from("professionals")
    .select("org_id")
    .eq("id", id)
    .single();

  if (!pro || pro.org_id !== profile.org_id) return { error: "Not authorised" };

  const { error } = await db()
    .from("professionals")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: `Update failed: ${(error as { message: string })?.message}` };
  return { success: true };
}

export async function updateSpecialisations(professionalId: string, labels: string[]) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  const { data: pro } = await db()
    .from("professionals")
    .select("org_id")
    .eq("id", professionalId)
    .single();

  if (!pro || pro.org_id !== profile.org_id) return { error: "Not authorised" };

  // Delete existing
  await db()
    .from("professional_specialisations")
    .delete()
    .eq("professional_id", professionalId);

  // Insert new
  if (labels.length > 0) {
    await db()
      .from("professional_specialisations")
      .insert(labels.map((label) => ({ professional_id: professionalId, label })));
  }

  return { success: true };
}

// ─── Deregistration ─---

export async function deregisterProfessional(id: string) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  // Verify ownership
  const { data: pro } = await db()
    .from("professionals")
    .select("org_id, status")
    .eq("id", id)
    .single();

  if (!pro) return { error: "Listing not found" };
  if (pro.org_id !== profile.org_id) return { error: "Not authorised" };
  if (pro.status === "deregistered") return { error: "Listing is already deregistered" };

  // Soft delete: set status to deregistered
  const { error } = await db()
    .from("professionals")
    .update({
      status: "deregistered",
      deregistered_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: `Deregistration failed: ${(error as { message: string })?.message}` };

  return { success: true };
}

// ─── Portfolio ───

export async function addPortfolioItem(professionalId: string, input: PortfolioItemInput) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  const parsed = portfolioItemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data: pro } = await db()
    .from("professionals")
    .select("org_id")
    .eq("id", professionalId)
    .single();

  if (!pro || pro.org_id !== profile.org_id) return { error: "Not authorised" };

  const { data: item, error } = await db()
    .from("portfolio_items")
    .insert({ ...parsed.data, professional_id: professionalId })
    .select("id")
    .single();

  if (error) return { error: `Failed: ${(error as { message: string })?.message}` };
  return { id: (item as { id: string }).id };
}

export async function updatePortfolioItem(itemId: string, input: PortfolioItemInput) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  const parsed = portfolioItemSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Verify ownership via join
  const { data: item } = await db()
    .from("portfolio_items")
    .select("professional_id")
    .eq("id", itemId)
    .single();

  if (!item) return { error: "Item not found" };

  const { data: pro } = await db()
    .from("professionals")
    .select("org_id")
    .eq("id", item.professional_id)
    .single();

  if (!pro || pro.org_id !== profile.org_id) return { error: "Not authorised" };

  const { error } = await db()
    .from("portfolio_items")
    .update(parsed.data)
    .eq("id", itemId);

  if (error) return { error: `Failed: ${(error as { message: string })?.message}` };
  return { success: true };
}

export async function deletePortfolioItem(itemId: string) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  const { data: item } = await db()
    .from("portfolio_items")
    .select("professional_id")
    .eq("id", itemId)
    .single();

  if (!item) return { error: "Item not found" };

  const { data: pro } = await db()
    .from("professionals")
    .select("org_id")
    .eq("id", item.professional_id)
    .single();

  if (!pro || pro.org_id !== profile.org_id) return { error: "Not authorised" };

  await db().from("portfolio_items").delete().eq("id", itemId);
  return { success: true };
}

// ─── Directory Browse ───

export async function searchProfessionals(filters: {
  query?: string;
  trade_type?: string;
  region?: string;
  specialisation?: string;
  page?: number;
}) {
  const pageSize = 12;
  const page = filters.page || 1;
  const offset = (page - 1) * pageSize;

  let query = db()
    .from("professionals")
    .select("*, professional_specialisations(*)", { count: "exact" })
    .eq("status", "approved")
    .order("avg_rating", { ascending: false })
    .range(offset, offset + pageSize - 1);

  if (filters.query) {
    query = query.textSearch("fts", filters.query, { type: "websearch" });
  }

  if (filters.trade_type) {
    query = query.eq("trade_type", filters.trade_type);
  }

  if (filters.region) {
    query = query.contains("regions", [filters.region]);
  }

  const { data, count, error } = await query;

  if (error) return { professionals: [], total: 0 };

  let results = data ?? [];

  // Filter by specialisation in JS (join filter not possible in Supabase)
  if (filters.specialisation) {
    results = results.filter((p: { professional_specialisations: { label: string }[] }) =>
      p.professional_specialisations?.some(
        (s: { label: string }) => s.label === filters.specialisation
      )
    );
  }

  return {
    professionals: results,
    total: count ?? 0,
    page,
    pageSize,
    totalPages: Math.ceil((count ?? 0) / pageSize),
  };
}

export async function getProfessionalProfile(id: string) {
  // @cross-tenant-ok: public cross-org professionals directory profile (returns null if deregistered)
  const { data: professional } = await db()
    .from("professionals")
    .select("*")
    .eq("id", id)
    .single();

  if (!professional || professional.status === "deregistered") return null;

  // company_documents is not in the generated types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cdocs = db() as unknown as any;
  const [specResult, portfolioResult, reviewResult, docsResult] = await Promise.all([
    db()
      .from("professional_specialisations")
      .select("*")
      .eq("professional_id", id),
    db()
      .from("portfolio_items")
      .select("*")
      .eq("professional_id", id)
      .order("sort_order", { ascending: true }),
    db()
      .from("directory_reviews")
      .select("*")
      .eq("professional_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    cdocs
      .from("company_documents")
      .select("*")
      .eq("professional_id", id)
      .order("created_at", { ascending: false }),
  ]);

  return {
    ...professional,
    specialisations: specResult.data ?? [],
    portfolio: portfolioResult.data ?? [],
    reviews: reviewResult.data ?? [],
    documents: docsResult.data ?? [],
  };
}

// ─── Company documents (SCRUM-57) ───

export async function addCompanyDocument(
  professionalId: string,
  input: CompanyDocumentInput,
) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  const parsed = companyDocumentSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data: pro } = await db()
    .from("professionals")
    .select("org_id")
    .eq("id", professionalId)
    .single();
  if (!pro || pro.org_id !== profile.org_id) return { error: "Not authorised" };

  // company_documents is not in the generated types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cdocs = db() as unknown as any;
  const { data, error } = await cdocs
    .from("company_documents")
    .insert({
      ...parsed.data,
      professional_id: professionalId,
      org_id: profile.org_id,
    })
    .select("id")
    .single();
  if (error) return { error: `Failed: ${error.message}` };
  return { id: (data as { id: string }).id };
}

export async function deleteCompanyDocument(documentId: string) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  // company_documents is not in the generated types yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cdocs = db() as unknown as any;
  const { data: doc } = await cdocs
    .from("company_documents")
    .select("org_id")
    .eq("id", documentId)
    .single();
  if (!doc) return { error: "Document not found" };
  if ((doc as { org_id: string }).org_id !== profile.org_id) {
    return { error: "Not authorised" };
  }

  const { error } = await cdocs
    .from("company_documents")
    .delete()
    .eq("id", documentId);
  if (error) return { error: `Failed: ${error.message}` };
  return { success: true };
}

// ─── Reviews ───

export async function submitReview(professionalId: string, input: ReviewInput) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Block self-review
  const { data: pro } = await db()
    .from("professionals")
    .select("org_id, company_name")
    .eq("id", professionalId)
    .single();

  if (!pro) return { error: "Professional not found" };
  if (pro.org_id === profile.org_id) return { error: "Cannot review your own listing" };

  const { error } = await db()
    .from("directory_reviews")
    .upsert(
      {
        professional_id: professionalId,
        reviewer_org_id: profile.org_id,
        reviewer_name: profile.full_name || "Anonymous",
        rating: parsed.data.rating,
        comment: parsed.data.comment || null,
      },
      { onConflict: "professional_id,reviewer_org_id" }
    );

  if (error) return { error: `Failed: ${(error as { message: string })?.message}` };

  await inngest.send({
    name: "direct/review.submitted",
    data: {
      professionalId,
      reviewerName: profile.full_name || "Anonymous",
      rating: parsed.data.rating,
      companyName: pro.company_name,
    },
  });

  return { success: true };
}

export async function getProfessionalReviews(professionalId: string, page: number = 1) {
  // @cross-tenant-ok: public directory reviews for a public listing
  const pageSize = 10;
  const offset = (page - 1) * pageSize;

  const { data, count } = await db()
    .from("directory_reviews")
    .select("*", { count: "exact" })
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  return { reviews: data ?? [], total: count ?? 0, page, pageSize };
}

// ─── Enquiries ───

export async function sendEnquiry(professionalId: string, input: EnquiryInput) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  const parsed = enquirySchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const { data: pro } = await db()
    .from("professionals")
    .select("org_id, company_name, email")
    .eq("id", professionalId)
    .single();

  if (!pro) return { error: "Professional not found" };

  const { data: enquiry, error } = await db()
    .from("directory_enquiries")
    .insert({
      professional_id: professionalId,
      sender_org_id: profile.org_id,
      sender_name: profile.full_name || "Anonymous",
      subject: parsed.data.subject,
      message: parsed.data.message,
      project_id: parsed.data.project_id || null,
      status: "new",
    })
    .select("id")
    .single();

  if (error || !enquiry) {
    return { error: `Failed: ${(error as { message: string })?.message}` };
  }

  await inngest.send({
    name: "direct/enquiry.sent",
    data: {
      enquiryId: (enquiry as { id: string }).id,
      professionalId,
      recipientEmail: pro.email,
      companyName: pro.company_name,
      senderName: profile.full_name || "Anonymous",
      subject: parsed.data.subject,
    },
  });

  return { id: (enquiry as { id: string }).id };
}

export async function getReceivedEnquiries(professionalId: string) {
  const profile = await getAuthProfile();
  if (!profile) return [];

  const { data: pro } = await db()
    .from("professionals")
    .select("org_id")
    .eq("id", professionalId)
    .single();

  if (!pro || pro.org_id !== profile.org_id) return [];

  const { data } = await db()
    .from("directory_enquiries")
    .select("*")
    .eq("professional_id", professionalId)
    .order("created_at", { ascending: false });

  return data ?? [];
}

export async function markEnquiryRead(enquiryId: string) {
  const profile = await getAuthProfile();
  if (!profile) return { error: "Not authenticated" };

  // Ownership (SCRUM-342): db() bypasses RLS, so the enquiry's recipient
  // professional must belong to the caller's org before we mutate it —
  // otherwise any authed user could mark another org's enquiry as read.
  const { data: enquiry } = await db()
    .from("directory_enquiries")
    .select("professional_id")
    .eq("id", enquiryId)
    .single();
  if (!enquiry) return { error: "Enquiry not found" };

  const { data: pro } = await db()
    .from("professionals")
    .select("org_id")
    .eq("id", (enquiry as { professional_id: string }).professional_id)
    .single();
  if (!pro || pro.org_id !== profile.org_id) return { error: "Not authorised" };

  const { error } = await db()
    .from("directory_enquiries")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", enquiryId);

  if (error) return { error: `Failed: ${(error as { message: string })?.message}` };
  return { success: true };
}

// ─── Admin ───

export async function approveProfessional(id: string) {
  // @cross-tenant-ok: moderation of the shared public directory, operator-allowlist gated (SCRUM-345)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOperatorEmail(user.email)) return { error: "Not authorised" };

  const { error } = await db()
    .from("professionals")
    .update({ status: "approved", approved_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return { error: `Failed: ${(error as { message: string })?.message}` };
  return { success: true };
}

export async function suspendProfessional(id: string) {
  // @cross-tenant-ok: moderation of the shared public directory, operator-allowlist gated (SCRUM-345)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOperatorEmail(user.email)) return { error: "Not authorised" };

  const { error } = await db()
    .from("professionals")
    .update({ status: "suspended" })
    .eq("id", id);

  if (error) return { error: `Failed: ${(error as { message: string })?.message}` };
  return { success: true };
}

export async function getPendingProfessionals() {
  // SCRUM-345: the directory moderation queue is a platform-operator surface.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isOperatorEmail(user.email)) return [];

  const { data } = await db()
    .from("professionals")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  return data ?? [];
}

export async function getTopProfessionals(limit: number = 3) {
  const { data } = await db()
    .from("professionals")
    .select("*, professional_specialisations(*)")
    .eq("status", "approved")
    .order("avg_rating", { ascending: false })
    .limit(limit);

  return data ?? [];
}
