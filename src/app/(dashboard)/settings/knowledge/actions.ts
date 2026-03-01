"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { inngest } from "@/lib/inngest/client";
import { revalidatePath } from "next/cache";

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
  if (!["owner", "admin"].includes(profile.role)) {
    throw new Error("Admin access required");
  }

  return profile as { id: string; org_id: string; role: string };
}

export async function createKnowledgeBase(formData: FormData) {
  const profile = await getProfile();
  const admin = createAdminClient();

  const name = formData.get("name") as string;
  const slug = formData.get("slug") as string;
  const description = formData.get("description") as string;
  const scope = (formData.get("scope") as string) || "org";

  const orgId =
    scope === "system"
      ? "00000000-0000-0000-0000-000000000000"
      : profile.org_id;

  const { data, error } = await admin
    .from("knowledge_bases")
    .insert({
      name,
      slug,
      description: description || null,
      scope,
      org_id: orgId,
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (error) throw new Error(`Failed to create KB: ${error.message}`);

  revalidatePath("/settings/knowledge");
  return { id: (data as { id: string }).id };
}

export async function listKnowledgeBases() {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("knowledge_bases")
    .select("*")
    .or(
      `scope.eq.system,and(scope.eq.org,org_id.eq.${profile.org_id})`
    )
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list KBs: ${error.message}`);
  return data ?? [];
}

export async function getKnowledgeBase(kbId: string) {
  await getProfile();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("knowledge_bases")
    .select("*")
    .eq("id", kbId)
    .single();

  if (error) throw new Error(`KB not found: ${error.message}`);
  return data;
}

export async function updateKnowledgeBase(
  kbId: string,
  updates: { name?: string; description?: string; is_active?: boolean }
) {
  await getProfile();
  const admin = createAdminClient();

  const { error } = await admin
    .from("knowledge_bases")
    .update(updates as never)
    .eq("id", kbId);

  if (error) throw new Error(`Failed to update KB: ${error.message}`);
  revalidatePath(`/settings/knowledge/${kbId}`);
}

export async function deleteKnowledgeBase(kbId: string) {
  await getProfile();
  const admin = createAdminClient();

  const { error } = await admin
    .from("knowledge_bases")
    .delete()
    .eq("id", kbId);

  if (error) throw new Error(`Failed to delete KB: ${error.message}`);
  revalidatePath("/settings/knowledge");
}

export async function listKbDocuments(kbId: string) {
  await getProfile();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("knowledge_documents")
    .select("*")
    .eq("kb_id", kbId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list documents: ${error.message}`);
  return data ?? [];
}

export async function uploadKbDocument(formData: FormData) {
  const profile = await getProfile();
  const admin = createAdminClient();

  const kbId = formData.get("kbId") as string;
  const file = formData.get("file") as File;

  if (!file || !kbId) throw new Error("Missing file or kbId");

  // Upload to storage
  const filePath = `${kbId}/${Date.now()}_${file.name}`;
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await admin.storage
    .from("kb-uploads")
    .upload(filePath, buffer, {
      contentType: "application/pdf",
    });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  // Create document record
  const { data: doc, error: docError } = await admin
    .from("knowledge_documents")
    .insert({
      kb_id: kbId,
      file_name: file.name,
      file_path: filePath,
      file_size_bytes: file.size,
      status: "pending",
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (docError) throw new Error(`Failed to create doc: ${docError.message}`);

  const docId = (doc as { id: string }).id;

  // Trigger Inngest processing
  await inngest.send({
    name: "kb/document.uploaded",
    data: {
      documentId: docId,
      kbId,
      fileName: file.name,
      filePath,
    },
  });

  revalidatePath(`/settings/knowledge/${kbId}`);
  return { id: docId };
}

export async function deleteKbDocument(docId: string, kbId: string) {
  await getProfile();
  const admin = createAdminClient();

  // Get file path for storage cleanup
  const { data: doc } = await admin
    .from("knowledge_documents")
    .select("file_path")
    .eq("id", docId)
    .single();

  if (doc) {
    const filePath = (doc as { file_path: string }).file_path;
    await admin.storage.from("kb-uploads").remove([filePath]);
  }

  // Delete embeddings
  await admin
    .from("document_embeddings")
    .delete()
    .eq("source_type", "kb_document")
    .eq("source_id", docId);

  // Delete document record
  const { error } = await admin
    .from("knowledge_documents")
    .delete()
    .eq("id", docId);

  if (error) throw new Error(`Failed to delete doc: ${error.message}`);
  revalidatePath(`/settings/knowledge/${kbId}`);
}
