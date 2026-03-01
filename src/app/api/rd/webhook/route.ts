import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import {
  verifyWebhookSignature,
  parsePushEvent,
  type GitHubPushEvent,
} from "@/lib/rd/webhook";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const event = request.headers.get("X-GitHub-Event");
  const signature = request.headers.get("X-Hub-Signature-256");

  // Only handle push events
  if (event !== "push") {
    return NextResponse.json({ message: "Event ignored" }, { status: 200 });
  }

  let payload: GitHubPushEvent;
  try {
    payload = JSON.parse(body) as GitHubPushEvent;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const repoFullName = payload.repository?.full_name;
  if (!repoFullName) {
    return NextResponse.json({ error: "Missing repository" }, { status: 400 });
  }

  // Look up org by github_repo
  const admin = createAdminClient();
  const { data: config } = await admin
    .from("rd_tracking_config")
    .select("org_id, webhook_secret, enabled")
    .eq("github_repo", repoFullName)
    .single();

  if (!config || !config.enabled) {
    return NextResponse.json(
      { error: "No active config for repo" },
      { status: 404 }
    );
  }

  // Verify webhook signature
  if (
    !verifyWebhookSignature(body, signature, config.webhook_secret ?? "")
  ) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const { branch, repo, commits } = parsePushEvent(payload);

  // Insert commit logs and fire Inngest events
  const events: Array<{
    name: "rd/commit.detected";
    data: { commitLogId: string; orgId: string; sha: string };
  }> = [];

  for (const commit of commits) {
    const { data: inserted, error } = await admin
      .from("rd_commit_logs")
      .insert({
        org_id: config.org_id,
        sha: commit.sha,
        author_name: commit.authorName,
        author_email: commit.authorEmail,
        message: commit.message,
        files_changed: commit.filesChanged as unknown as Record<string, unknown>,
        repo,
        branch,
        committed_at: commit.committedAt,
        status: "pending",
      } as never)
      .select("id")
      .single();

    if (error) {
      // Skip duplicates (unique constraint on org_id + sha)
      if (error.code === "23505") continue;
      console.error(`[Webhook] Failed to insert commit ${commit.sha}:`, error);
      continue;
    }

    if (inserted) {
      events.push({
        name: "rd/commit.detected",
        data: {
          commitLogId: inserted.id,
          orgId: config.org_id,
          sha: commit.sha,
        },
      });
    }
  }

  // Send all Inngest events in batch
  if (events.length > 0) {
    await inngest.send(events);
  }

  return NextResponse.json({
    message: `Processed ${events.length} commits`,
    commitsReceived: commits.length,
    commitsQueued: events.length,
  });
}
