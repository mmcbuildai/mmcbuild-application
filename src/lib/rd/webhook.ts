import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify GitHub webhook signature (HMAC SHA-256).
 * Returns true if the signature is valid.
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string | null,
  secret: string
): boolean {
  if (!signature) return false;

  const expected =
    "sha256=" +
    createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}

export interface GitHubCommit {
  id: string;
  message: string;
  timestamp: string;
  author: {
    name: string;
    email: string;
    username?: string;
  };
  added: string[];
  removed: string[];
  modified: string[];
}

export interface GitHubPushEvent {
  ref: string;
  repository: {
    full_name: string;
  };
  commits: GitHubCommit[];
}

/**
 * Parse a GitHub push event payload.
 * Returns the branch name, repo, and commits array.
 */
export function parsePushEvent(payload: GitHubPushEvent) {
  const branch = payload.ref.replace("refs/heads/", "");
  const repo = payload.repository.full_name;

  const commits = payload.commits.map((c) => ({
    sha: c.id,
    message: c.message,
    authorName: c.author.name,
    authorEmail: c.author.email,
    committedAt: c.timestamp,
    filesChanged: [
      ...c.added.map((f) => ({ path: f, action: "added" as const })),
      ...c.modified.map((f) => ({ path: f, action: "modified" as const })),
      ...c.removed.map((f) => ({ path: f, action: "removed" as const })),
    ],
  }));

  return { branch, repo, commits };
}
