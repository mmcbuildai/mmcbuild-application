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

/**
 * Register a document that was already uploaded to Supabase Storage
 * from the browser. This avoids the Vercel 4.5MB body size limit.
 */
export async function registerKbDocument(
  kbId: string,
  fileName: string,
  filePath: string,
  fileSizeBytes: number
) {
  const profile = await getProfile();
  const admin = createAdminClient();

  const { data: doc, error: docError } = await admin
    .from("knowledge_documents")
    .insert({
      kb_id: kbId,
      file_name: fileName,
      file_path: filePath,
      file_size_bytes: fileSizeBytes,
      status: "pending",
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (docError) throw new Error(`Failed to create doc: ${docError.message}`);

  const docId = (doc as { id: string }).id;

  try {
    await inngest.send({
      name: "kb/document.uploaded",
      data: {
        documentId: docId,
        kbId,
        fileName,
        filePath,
      },
    });
  } catch (e) {
    console.error("Failed to send Inngest event:", e);
  }

  revalidatePath(`/settings/knowledge/${kbId}`);
  return { id: docId };
}

export async function uploadKbManualText(kbId: string, title: string, content: string) {
  const profile = await getProfile();
  const admin = createAdminClient();

  if (!title?.trim() || !content?.trim()) {
    throw new Error("Title and content are required");
  }

  const safeName = title.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `manual/${kbId}/${Date.now()}_${safeName}.txt`;
  const buffer = Buffer.from(content, "utf-8");

  const { error: uploadError } = await admin.storage
    .from("kb-uploads")
    .upload(filePath, buffer, { contentType: "text/plain" });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { data: doc, error: docError } = await admin
    .from("knowledge_documents")
    .insert({
      kb_id: kbId,
      file_name: `${title}.txt`,
      file_path: filePath,
      file_size_bytes: buffer.length,
      status: "pending",
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (docError) throw new Error(`Failed to create doc: ${docError.message}`);

  const docId = (doc as { id: string }).id;

  try {
    await inngest.send({
      name: "kb/document.uploaded",
      data: {
        documentId: docId,
        kbId,
        fileName: `${title}.txt`,
        filePath,
      },
    });
  } catch (e) {
    console.error("Failed to send Inngest event:", e);
  }

  revalidatePath(`/settings/knowledge/${kbId}`);
  return { id: docId };
}

export async function uploadKbUrl(kbId: string, url: string, title?: string) {
  const profile = await getProfile();
  const admin = createAdminClient();

  if (!url?.trim()) throw new Error("URL is required");

  // Fetch the URL content
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const text = await response.text();
  const displayTitle = title?.trim() || new URL(url).hostname;
  const content = `Source URL: ${url}\n\n${text}`;

  const safeName = displayTitle.replace(/[^a-zA-Z0-9._-]/g, "_");
  const filePath = `manual/${kbId}/${Date.now()}_${safeName}.txt`;
  const buffer = Buffer.from(content, "utf-8");

  const { error: uploadError } = await admin.storage
    .from("kb-uploads")
    .upload(filePath, buffer, { contentType: "text/plain" });

  if (uploadError) {
    throw new Error(`Upload failed: ${uploadError.message}`);
  }

  const { data: doc, error: docError } = await admin
    .from("knowledge_documents")
    .insert({
      kb_id: kbId,
      file_name: `${displayTitle} (URL)`,
      file_path: filePath,
      file_size_bytes: buffer.length,
      status: "pending",
      created_by: profile.id,
    } as never)
    .select("id")
    .single();

  if (docError) throw new Error(`Failed to create doc: ${docError.message}`);

  const docId = (doc as { id: string }).id;

  try {
    await inngest.send({
      name: "kb/document.uploaded",
      data: {
        documentId: docId,
        kbId,
        fileName: `${displayTitle}.txt`,
        filePath,
      },
    });
  } catch (e) {
    console.error("Failed to send Inngest event:", e);
  }

  revalidatePath(`/settings/knowledge/${kbId}`);
  return { id: docId };
}

export async function updateKbDocumentTitle(docId: string, kbId: string, newTitle: string) {
  await getProfile();

  if (!newTitle?.trim()) {
    throw new Error("Title is required");
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("knowledge_documents")
    .update({ file_name: newTitle.trim(), updated_at: new Date().toISOString() } as never)
    .eq("id", docId);

  if (error) throw new Error(`Failed to update title: ${error.message}`);
  revalidatePath(`/settings/knowledge/${kbId}`);
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
