import { describe, expect, it, vi } from "vitest";
import { readComplianceCheckWithRetry } from "@/lib/comply/read-check-with-retry";

type CheckRead = {
  error?: string;
  check?: { id: string };
  findings?: unknown[];
};

// SCRUM-350: the compliance check page bounced back to /comply/[projectId] on a
// single transient read miss right after the check was created. The read must be
// retried a few times before the check is treated as gone.
describe("readComplianceCheckWithRetry (SCRUM-350)", () => {
  const noSleep = vi.fn(async () => {});

  it("returns immediately on a first successful read (no retry, no sleep)", async () => {
    const read = vi.fn(async () => ({ check: { id: "c1" }, findings: [] }));

    const result = await readComplianceCheckWithRetry(read, "c1", {
      sleep: noSleep,
    });

    expect(result.check).toEqual({ id: "c1" });
    expect(read).toHaveBeenCalledTimes(1);
    expect(noSleep).not.toHaveBeenCalled();
  });

  it("recovers when a transient miss precedes a successful read", async () => {
    const sleep = vi.fn(async () => {});
    const read = vi
      .fn<(checkId: string) => Promise<CheckRead>>()
      // first attempt: transient getUser() hiccup
      .mockResolvedValueOnce({ error: "Not authenticated" })
      // second attempt: read-after-write gap, row still not visible
      .mockResolvedValueOnce({ error: "Check not found" })
      // third attempt: succeeds
      .mockResolvedValueOnce({ check: { id: "c1" }, findings: [] });

    const result = await readComplianceCheckWithRetry(read, "c1", {
      attempts: 3,
      sleep,
    });

    expect(result.check).toEqual({ id: "c1" });
    expect(read).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up after the attempt cap for a genuinely missing check", async () => {
    const read = vi.fn(
      async (): Promise<CheckRead> => ({ error: "Check not found" })
    );

    const result = await readComplianceCheckWithRetry(read, "bad-id", {
      attempts: 3,
      sleep: noSleep,
    });

    expect(result.check).toBeUndefined();
    expect(result.error).toBe("Check not found");
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("treats an error alongside a check as still-failing and retries", async () => {
    const read = vi
      .fn<(checkId: string) => Promise<CheckRead>>()
      .mockResolvedValueOnce({ error: "boom" })
      .mockResolvedValueOnce({ check: { id: "c1" }, findings: [] });

    const result = await readComplianceCheckWithRetry(read, "c1", {
      attempts: 3,
      sleep: noSleep,
    });

    expect(result.check).toEqual({ id: "c1" });
    expect(read).toHaveBeenCalledTimes(2);
  });
});
