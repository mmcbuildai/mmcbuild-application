import { callModel } from "@/lib/ai/models/router";

export interface CertMetadata {
  issuer_name: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  certificate_number: string | null;
}

const TOOL = {
  name: "record_cert_metadata",
  description:
    "Record metadata extracted from an Australian engineering or compliance certification document (e.g. BASIX, NatHERS, Form 15/16, structural cert).",
  input_schema: {
    type: "object",
    properties: {
      issuer_name: {
        type: ["string", "null"],
        description:
          "Full name of the issuing engineer, certifier, or assessor (or their company). Null if not visible.",
      },
      issue_date: {
        type: ["string", "null"],
        description:
          "Date the certificate was issued, formatted YYYY-MM-DD. Null if not visible.",
      },
      expiry_date: {
        type: ["string", "null"],
        description:
          "Expiry date if the certificate has one (e.g. BASIX), YYYY-MM-DD. Null otherwise.",
      },
      certificate_number: {
        type: ["string", "null"],
        description:
          "The certificate, BASIX, or assessment number (e.g. 'A1234567', 'NATHERS-12345'). Null if not visible.",
      },
    },
    required: ["issuer_name", "issue_date", "expiry_date", "certificate_number"],
  },
};

const PROMPT = `Extract metadata from the attached Australian compliance or
engineering certification. Return your answer by calling the
record_cert_metadata tool exactly once. Use null for any field you cannot read
clearly from the document. Dates must be ISO YYYY-MM-DD. Do not guess.`;

interface ExtractInput {
  orgId: string;
  /** Pre-parsed text (PDFs). Provide either text or imageBytes. */
  text?: string;
  /** Raw image bytes for vision extraction. */
  imageBytes?: Buffer;
  imageMimeType?: string;
}

const VISION_MIME_SUPPORT = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function extractCertMetadata(
  input: ExtractInput,
): Promise<CertMetadata> {
  const empty: CertMetadata = {
    issuer_name: null,
    issue_date: null,
    expiry_date: null,
    certificate_number: null,
  };

  // Skip extraction entirely if we have neither usable text nor a supported
  // image — the call would just waste a token round-trip.
  if (!input.text) {
    if (!input.imageBytes || !input.imageMimeType) return empty;
    if (!VISION_MIME_SUPPORT.has(input.imageMimeType)) return empty;
  }

  const userContent = input.text
    ? `${PROMPT}\n\n---\nDocument text:\n\n${input.text.slice(0, 12000)}`
    : PROMPT;

  try {
    const result = await callModel("cert_metadata", {
      orgId: input.orgId,
      maxTokens: 1024,
      messages: [{ role: "user", content: userContent }],
      tools: [TOOL],
      images:
        input.imageBytes && input.imageMimeType
          ? [{ data: input.imageBytes, mimeType: input.imageMimeType }]
          : undefined,
    });

    const call = result.toolCalls?.find((c) => c.name === "record_cert_metadata");
    if (!call) return empty;

    const out = call.input as Partial<CertMetadata>;
    return {
      issuer_name: cleanString(out.issuer_name),
      issue_date: normaliseDate(out.issue_date),
      expiry_date: normaliseDate(out.expiry_date),
      certificate_number: cleanString(out.certificate_number),
    };
  } catch (err) {
    console.error("[cert-metadata] extraction failed:", err);
    return empty;
  }
}

function cleanString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  return trimmed;
}

function normaliseDate(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return trimmed;
}
