import { describe, it, expect } from "vitest";
import {
  extractJson,
  ModelNonJsonResponseError,
} from "@/lib/ai/extract-json";

/**
 * Cover for the 3D plan-extraction hardening (2026-06-11): a model refusal or
 * empty/prose response must surface as a TYPED content failure with a `reason`,
 * not the old opaque "Failed to extract JSON" parse error. The successful-parse
 * paths (raw / fenced / embedded / trailing-comma) must keep working unchanged.
 */
describe("extractJson — successful parse paths (unchanged)", () => {
  it("parses raw JSON", () => {
    expect(extractJson<{ a: number }>('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses JSON inside a ```json fence", () => {
    const text = "Here you go:\n```json\n{\"a\": 1, \"b\": 2}\n```\nDone.";
    expect(extractJson<{ a: number; b: number }>(text)).toEqual({ a: 1, b: 2 });
  });

  it("parses JSON embedded in surrounding prose", () => {
    const text = 'The result is {"walls": 12, "rooms": 5} as extracted.';
    expect(extractJson<{ walls: number; rooms: number }>(text)).toEqual({
      walls: 12,
      rooms: 5,
    });
  });

  it("parses JSON with a trailing comma", () => {
    const text = '{"a": 1, "b": [1, 2,], }';
    expect(extractJson<{ a: number; b: number[] }>(text)).toEqual({
      a: 1,
      b: [1, 2],
    });
  });
});

describe("extractJson — typed non-JSON failures", () => {
  it("throws reason 'refusal' for the real production refusal text", () => {
    const refusal =
      "I'm sorry, I cannot provide the analysis without the specific building " +
      "plan extracts and project details. Please upload the relevant plan " +
      "extracts and I'll be happy to help.";
    try {
      extractJson(refusal);
      throw new Error("expected extractJson to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ModelNonJsonResponseError);
      const typed = err as ModelNonJsonResponseError;
      expect(typed.reason).toBe("refusal");
      expect(typed.userMessage).toMatch(/re-upload a clear plan/i);
      // The neutral message must NOT echo "Failed to extract JSON".
      expect(typed.userMessage).not.toMatch(/failed to extract json/i);
      // The raw text is preserved for server logs.
      expect(typed.rawText).toBe(refusal);
    }
  });

  it("throws reason 'empty' for an empty / whitespace response", () => {
    for (const text of ["", "   ", "\n\t  \n"]) {
      try {
        extractJson(text);
        throw new Error("expected extractJson to throw");
      } catch (err) {
        expect(err).toBeInstanceOf(ModelNonJsonResponseError);
        expect((err as ModelNonJsonResponseError).reason).toBe("empty");
      }
    }
  });

  it("throws reason 'unparseable' for non-refusal prose with no JSON", () => {
    try {
      extractJson("The quick brown fox jumps over the lazy dog.");
      throw new Error("expected extractJson to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ModelNonJsonResponseError);
      expect((err as ModelNonJsonResponseError).reason).toBe("unparseable");
    }
  });

  it("is an Error subclass so existing generic catch blocks still work", () => {
    try {
      extractJson("");
    } catch (err) {
      expect(err).toBeInstanceOf(Error);
      expect(typeof (err as Error).message).toBe("string");
    }
  });
});
