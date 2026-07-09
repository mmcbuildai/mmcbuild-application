import { Resend } from "resend";

let resendInstance: Resend | null = null;

export function getResend(): Resend {
  if (!resendInstance) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resendInstance = new Resend(process.env.RESEND_API_KEY);
  }
  return resendInstance;
}

// Default sender must be on a domain VERIFIED in the Resend account that owns
// RESEND_API_KEY. The live `mmcbuild` Resend account verifies the `app.` subdomain
// only — the bare apex (`mmcbuild.com.au`) is NOT verified, so sending from it is
// silently rejected by Resend. Keep this default aligned with the Supabase Auth
// SMTP sender (`noreply@app.mmcbuild.com.au`). See memory: project_auth_email_smtp_500.
/** The verified-subdomain fallback sender (see the note above). */
export const DEFAULT_FROM_EMAIL = "MMC Build <noreply@app.mmcbuild.com.au>";

/**
 * Resolve the sender from RESEND_FROM_EMAIL, falling back to the verified
 * subdomain when it is unset/empty. Pure (env passed in) so it is deterministically
 * unit-testable — testing the module-level `FROM_EMAIL` constant through
 * env-mutation + dynamic import was order-flaky across vitest's shared module cache.
 */
export function resolveFromEmail(
  raw: string | undefined = process.env.RESEND_FROM_EMAIL,
): string {
  return raw || DEFAULT_FROM_EMAIL;
}

export const FROM_EMAIL = resolveFromEmail();

// A real, monitored reply inbox. Routing every send through a Reply-To that a
// human reads (a) lets recipients reply instead of hitting a dead noreply, and
// (b) replies are a positive deliverability signal that helps land in the inbox
// rather than spam. Must NOT be the unverified apex — any mailbox works as a
// Reply-To regardless of the sending domain.
export const REPLY_TO_EMAIL =
  process.env.RESEND_REPLY_TO || "karen.engel@mmcbuild.com.au";

// Crude HTML → plain-text fallback. Mailbox providers (Gmail/Outlook/Yahoo)
// penalise HTML-only mail as a spam signal, so every send must carry a text
// alternative. Callers can pass a hand-written `text`; otherwise we derive a
// readable one from the HTML so no send is ever HTML-only.
export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\/\s*(p|div|tr|h[1-6]|li)\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&rsquo;/gi, "’")
    .replace(/&ldquo;/gi, "“")
    .replace(/&rdquo;/gi, "”")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  /** Provide html and/or text; if only html is given, text is derived. */
  html?: string;
  text?: string;
  from?: string;
  replyTo?: string;
}

/**
 * The single send path for every transactional/notification email. Centralises
 * the deliverability defaults — verified From, a real monitored Reply-To, and a
 * guaranteed plain-text part — so no individual call site can regress them.
 * See PRODUCT_STANDARDS Spam Act gate + the 2026-06-27 deliverability pass.
 */
export async function sendEmail(opts: SendEmailOptions) {
  const html = opts.html;
  const text = opts.text ?? (html ? htmlToText(html) : undefined);
  return getResend().emails.send({
    from: opts.from ?? FROM_EMAIL,
    to: opts.to,
    replyTo: opts.replyTo ?? REPLY_TO_EMAIL,
    subject: opts.subject,
    ...(html ? { html } : {}),
    ...(text ? { text } : {}),
  } as Parameters<Resend["emails"]["send"]>[0]);
}
