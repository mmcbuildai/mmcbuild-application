"use server";

import { z } from "zod";
import { db } from "@/lib/supabase/db";
import { sendEmail } from "@/lib/email/resend";

const publicListingSchema = z.object({
  company_name: z.string().min(1, "Company name is required").max(200),
  abn: z.string().max(20).optional(),
  categories: z.array(z.string()).min(1, "Select at least one category"),
  contact_name: z.string().min(1, "Contact name is required").max(100),
  contact_email: z.string().email("Valid email is required"),
  contact_phone: z.string().max(30).optional(),
  location: z.string().max(200).optional(),
  service_area: z.array(z.string()).optional(),
  licences_held: z.string().max(500).optional(),
  description: z.string().max(2000).optional(),
  honeypot: z.string().max(0, "Bot detected").optional(),
});

export type PublicListingInput = z.infer<typeof publicListingSchema>;

export async function submitPublicListing(input: PublicListingInput) {
  const parsed = publicListingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  // Honeypot check — if filled in, silently reject (looks like success to the bot)
  if (parsed.data.honeypot) {
    return { success: true, id: "noop" };
  }

  const { honeypot, ...listingData } = parsed.data;

  const { data: listing, error } = await db()
    .from("directory_listings")
    .insert({
      ...listingData,
      service_area: listingData.service_area ?? [],
      status: "pending",
    })
    .select("id")
    .single();

  if (error || !listing) {
    return { error: `Submission failed: ${(error as { message: string })?.message}` };
  }

  // Send confirmation email
  try {
    await sendEmail({
      to: parsed.data.contact_email,
      subject: "MMC Build Directory — Submission Received",
      html: `
        <h2>Thanks for registering, ${parsed.data.contact_name}!</h2>
        <p>We've received your directory listing for <strong>${parsed.data.company_name}</strong>.</p>
        <p>Our team will review your submission and you'll receive an email once it's approved.</p>
        <p>This usually takes 1-2 business days.</p>
        <br/>
        <p style="color: #666; font-size: 12px;">— The MMC Build Team</p>
      `,
    });
  } catch (e) {
    console.error("[DirectoryRegister] Confirmation email failed:", e);
  }

  return { success: true, id: (listing as { id: string }).id };
}
