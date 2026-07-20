/**
 * Resilient read for the compliance-check page (SCRUM-350).
 *
 * The check row is created by `requestComplianceCheck` immediately before the UI
 * navigates to /comply/[projectId]/check/[checkId]. On that first render the
 * server read (`getComplianceReport`) can transiently miss — a known getUser()
 * hiccup on this stack, or a read-after-write timing gap right after the insert.
 * The check page used to redirect straight back to /comply/[projectId] on any
 * single failed read, so the progress screen would flash for a moment then jump
 * back to the saved Comply page even though the check was queued and running.
 *
 * Retrying the read a few times before giving up removes that false bounce: a
 * transient miss resolves within a retry, while a genuinely missing / cross-org
 * check still returns an error after every attempt (the caller then redirects).
 *
 * The reader and sleep are injected so this is unit-testable without a DB or
 * real timers.
 */
export interface CheckReadResult {
  error?: unknown;
  check?: unknown;
}

export async function readComplianceCheckWithRetry<T extends CheckReadResult>(
  read: (checkId: string) => Promise<T>,
  checkId: string,
  opts: {
    attempts?: number;
    delayMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {}
): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? 3);
  const delayMs = opts.delayMs ?? 400;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));

  let result = await read(checkId);
  for (
    let attempt = 1;
    attempt < attempts && (Boolean(result.error) || !result.check);
    attempt++
  ) {
    await sleep(delayMs);
    result = await read(checkId);
  }
  return result;
}
