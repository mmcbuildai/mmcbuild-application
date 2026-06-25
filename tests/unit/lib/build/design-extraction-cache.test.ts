import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "node:crypto";

// server-only throws outside an RSC context; stub it for the node test env.
vi.mock("server-only", () => ({}));

// Chainable Supabase-style query-builder mock. Each terminal call (maybeSingle/
// upsert/update) resolves with whatever the test queued.
const state: { rows: Record<string, unknown> | null } = { rows: null };
const lastEq: Record<string, unknown> = {};
function builder() {
  const b: Record<string, unknown> = {};
  b.select = () => b;
  b.eq = (k: string, v: unknown) => {
    lastEq[k] = v;
    return b;
  };
  b.maybeSingle = async () => ({ data: state.rows });
  b.upsert = vi.fn(async () => ({ error: null }));
  b.update = () => b;
  return b;
}
const fromMock = vi.fn(() => builder());
vi.mock("@/lib/supabase/db", () => ({ db: () => ({ from: fromMock }) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));

import {
  computeContentHash,
  EXTRACTOR_VERSION,
  lookupDesignExtraction,
} from "@/lib/build/design-extraction-cache";

describe("computeContentHash", () => {
  it("is a deterministic sha256 hex of the bytes", () => {
    const bytes = Buffer.from("hello world");
    const expected = createHash("sha256").update(bytes).digest("hex");
    expect(computeContentHash(bytes)).toBe(expected);
    expect(computeContentHash(bytes)).toBe(computeContentHash(bytes));
  });

  it("gives identical hashes for identical bytes (the cross-org/tester reuse key)", () => {
    const a = Buffer.from([1, 2, 3, 4, 5]);
    const b = Buffer.from([1, 2, 3, 4, 5]); // a 'copy' of the same design
    expect(computeContentHash(a)).toBe(computeContentHash(b));
  });

  it("gives different hashes for different bytes", () => {
    expect(computeContentHash(Buffer.from("a"))).not.toBe(
      computeContentHash(Buffer.from("b")),
    );
  });
});

describe("lookupDesignExtraction", () => {
  beforeEach(() => {
    state.rows = null;
    for (const k of Object.keys(lastEq)) delete lastEq[k];
    fromMock.mockClear();
  });

  it("returns null on a cache miss", async () => {
    state.rows = null;
    expect(await lookupDesignExtraction("abc123")).toBeNull();
  });

  it("returns null for an empty hash without querying", async () => {
    expect(await lookupDesignExtraction("")).toBeNull();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("queries the CURRENT extractor version (so old-version rows are ignored)", async () => {
    state.rows = {
      spatial_layout: { walls: [] },
      derived_attributes: null,
      extractor_version: EXTRACTOR_VERSION,
    };
    const hit = await lookupDesignExtraction("hash-xyz");
    expect(lastEq.content_hash).toBe("hash-xyz");
    expect(lastEq.extractor_version).toBe(EXTRACTOR_VERSION);
    expect(hit?.spatialLayout).toEqual({ walls: [] });
  });
});
