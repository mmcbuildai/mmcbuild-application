#!/usr/bin/env node
/**
 * Configure branded MMC Build email templates on the live Supabase Auth project
 * (SCRUM-237 / SCRUM-280). Replaces the bland default Supabase emails — which
 * recipients flagged as looking like spam — with branded HTML for EVERY auth
 * email: confirm-signup, invite (this is the beta-tester invite, sent via
 * inviteUserByEmail), magic-link, password recovery, and email-change.
 *
 * Sender shows as "Karen Engel" <karen.engel@app.mmcbuild.com.au> (Karen's
 * 2026-06-30 anti-spam request — a human sender, not "noreply"); the body is
 * signed by Karen Van Den Engel, Director — MMC Build. Invite subject is the
 * plain "Your MMC Build beta invite".
 *
 * ── What this DOES and does NOT change ──────────────────────────────────────
 * DOES:  the global auth sender name + From address, and every auth-email
 *        subject + branded HTML body (confirm / invite / magic-link / recovery
 *        / email-change). One CTA each, no images, no attachments, no shortened
 *        URLs — already matches Karen's "plain and minimal" ask.
 * CANNOT (Supabase Auth API limits — do these elsewhere):
 *   • Reply-To — GoTrue has no separate Reply-To field, so the From address IS
 *     the reply target. Point karen.engel@app.mmcbuild.com.au at Karen's real
 *     inbox (mailbox or forward to karen.engel@mmcbuild.com.au) so replies land.
 *   • Plain-text alternative — GoTrue sends custom templates as HTML only. Our
 *     APP emails (Resend, src/lib/email/resend.ts) already carry a text part;
 *     the auth emails can't via this API.
 *   • SPF/DKIM/DMARC — already configured + passing at the DNS level (verified
 *     2026-07-01); nothing to do here.
 *
 * ── Access ────────────────────────────────────────────────────────────────
 * The MMC Build Supabase project (lztzyfeivpsbqbsfzctw) lives in MMC's OWN
 * Supabase account. The CAS operator token does NOT have access (403), so this
 * must be run by someone with an MMC Supabase access token (Karthik, or Karen's
 * own login → Account → Access Tokens):
 *
 *   SUPABASE_ACCESS_TOKEN=<mmc-token> node scripts/configure-mmc-email-templates.mjs
 *
 * Optionally override the sender (defaults already match Karen's request):
 *   SENDER_NAME="Karen Engel — MMC Build" \   # alt: keep the MMC Build context
 *   SENDER_EMAIL="karen.engel@app.mmcbuild.com.au" \  # MUST stay on the app. subdomain
 *   node scripts/configure-mmc-email-templates.mjs
 *
 * Dry-run (print payload, don't PATCH):  DRY_RUN=1 node scripts/configure-mmc-email-templates.mjs
 */

const PROJECT_REF = process.env.PROJECT_REF || "lztzyfeivpsbqbsfzctw";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
// Karen's deliverability request (2026-06-30): send from a real HUMAN name +
// mailbox rather than an anonymous "noreply". A personal sender is a well-known
// inbox-placement signal (recipients recognise + trust it, and are more likely
// to reply — which itself boosts reputation). Overridable via env.
const SENDER_NAME = process.env.SENDER_NAME || "Karen Engel";
// MUST stay on the Resend-VERIFIED sending domain — `app.mmcbuild.com.au`. The
// bare apex (`mmcbuild.com.au`) is NOT verified on Resend, so a From on it is
// silently rejected (see project_auth_email_smtp_500). Karen asked for exactly
// karen.engel@app.mmcbuild.com.au — on the verified subdomain, so it works.
// ⚠️ Supabase Auth has NO separate Reply-To field, so THIS address is also where
// replies land. Make sure karen.engel@app.mmcbuild.com.au is a real mailbox OR
// forwards to karen.engel@mmcbuild.com.au, or replies will bounce/vanish.
const SENDER_EMAIL = process.env.SENDER_EMAIL || "karen.engel@app.mmcbuild.com.au";
const SIGNOFF_NAME = "Karen Van Den Engel";
const SIGNOFF_TITLE = "Director — MMC Build";
const SUPPORT_EMAIL = "info@mmcbuild.com.au";

if (!TOKEN && !process.env.DRY_RUN) {
  console.error(
    "SUPABASE_ACCESS_TOKEN is required (an MMC Supabase token — the CAS token is 403 on this project). Set DRY_RUN=1 to preview without it.",
  );
  process.exit(1);
}

/** Branded shell. `title` is the email heading, `bodyHtml` the inner content. */
function shell(title, bodyHtml) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — MMC Build</title>
</head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;">
        <tr>
          <td style="background:#0F766E;padding:24px 32px;">
            <h1 style="margin:0;color:#FFFFFF;font-size:20px;font-weight:600;">MMC Build</h1>
            <p style="margin:4px 0 0;color:#5EEAD4;font-size:13px;">AI-powered compliance &amp; construction intelligence</p>
          </td>
        </tr>
        <tr>
          <td style="padding:32px;color:#374151;font-size:15px;line-height:1.6;">
            <h2 style="margin:0 0 16px;color:#111827;font-size:18px;">${title}</h2>
            ${bodyHtml}
            <p style="margin:28px 0 4px;color:#374151;font-size:15px;">Kind regards,</p>
            <p style="margin:0;color:#111827;font-size:15px;font-weight:600;">${SIGNOFF_NAME}</p>
            <p style="margin:0;color:#6B7280;font-size:13px;">${SIGNOFF_TITLE}</p>
          </td>
        </tr>
        <tr>
          <td style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;">
            <p style="margin:0;color:#9CA3AF;font-size:12px;">
              Need help? Contact us at
              <a href="mailto:${SUPPORT_EMAIL}" style="color:#0F766E;">${SUPPORT_EMAIL}</a>.
              If you didn't expect this email you can safely ignore it.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

/** Teal CTA button. */
function button(href, label) {
  return `<table cellpadding="0" cellspacing="0" style="margin:8px 0 8px;"><tr><td style="border-radius:8px;background:#0F766E;">
    <a href="${href}" style="display:inline-block;padding:12px 24px;color:#FFFFFF;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">${label}</a>
  </td></tr></table>`;
}

// Supabase substitutes {{ .ConfirmationURL }} etc. at send time.
const CONFIRM = "{{ .ConfirmationURL }}";

const templates = {
  confirmation: {
    subject: "Confirm your MMC Build account",
    content: shell(
      "Confirm your email",
      `<p style="margin:0 0 16px;">Welcome to MMC Build. Please confirm your email address to activate your account.</p>
       ${button(CONFIRM, "Confirm my email")}
       <p style="margin:16px 0 0;color:#6B7280;font-size:13px;">This link expires shortly for your security.</p>`,
    ),
  },
  invite: {
    // Karen's request (2026-06-30): a simple, plain subject line.
    subject: "Your MMC Build beta invite",
    content: shell(
      "You've been invited to MMC Build",
      `<p style="margin:0 0 16px;">You've been invited to join MMC Build — our AI-powered platform for compliance, design optimisation and cost estimation in Australian residential construction.</p>
       <p style="margin:0 0 16px;">Click below to set up your account and get started.</p>
       ${button(CONFIRM, "Accept invitation")}`,
    ),
  },
  magic_link: {
    subject: "Your MMC Build sign-in link",
    content: shell(
      "Sign in to MMC Build",
      `<p style="margin:0 0 16px;">Click below to sign in to your MMC Build account. No password needed.</p>
       ${button(CONFIRM, "Sign in")}
       <p style="margin:16px 0 0;color:#6B7280;font-size:13px;">This link expires shortly and can only be used once.</p>`,
    ),
  },
  recovery: {
    subject: "Reset your MMC Build password",
    content: shell(
      "Reset your password",
      `<p style="margin:0 0 16px;">We received a request to reset your MMC Build password. Click below to choose a new one.</p>
       ${button(CONFIRM, "Reset password")}
       <p style="margin:16px 0 0;color:#6B7280;font-size:13px;">If you didn't request this, you can ignore this email — your password won't change.</p>`,
    ),
  },
  email_change: {
    subject: "Confirm your new MMC Build email",
    content: shell(
      "Confirm your new email",
      `<p style="margin:0 0 16px;">Please confirm this new email address for your MMC Build account.</p>
       ${button(CONFIRM, "Confirm new email")}`,
    ),
  },
};

const payload = {
  smtp_sender_name: SENDER_NAME,
  smtp_admin_email: SENDER_EMAIL,
  mailer_subjects_confirmation: templates.confirmation.subject,
  mailer_templates_confirmation_content: templates.confirmation.content,
  mailer_subjects_invite: templates.invite.subject,
  mailer_templates_invite_content: templates.invite.content,
  mailer_subjects_magic_link: templates.magic_link.subject,
  mailer_templates_magic_link_content: templates.magic_link.content,
  mailer_subjects_recovery: templates.recovery.subject,
  mailer_templates_recovery_content: templates.recovery.content,
  mailer_subjects_email_change: templates.email_change.subject,
  mailer_templates_email_change_content: templates.email_change.content,
};

if (process.env.DRY_RUN) {
  console.log("DRY_RUN — would PATCH", `project ${PROJECT_REF}`);
  console.log(JSON.stringify({ ...payload, mailer_templates_invite_content: "[html]" }, null, 2));
  process.exit(0);
}

const res = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`,
  {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  },
);

if (!res.ok) {
  console.error(`Failed: HTTP ${res.status}`, await res.text());
  process.exit(1);
}
console.log(`✓ Branded email templates applied to ${PROJECT_REF} (sender "${SENDER_NAME}" <${SENDER_EMAIL}>).`);
