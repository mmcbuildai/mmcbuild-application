import Image from "next/image";
import {
  PARTNERS,
  TESTIMONIALS,
  showPartners,
  showTestimonials,
} from "@/lib/marketing/social-proof";

/**
 * The partners and testimonials sections (SCRUM-376).
 *
 * Renders NOTHING until both halves are true: the switch is on and there is
 * real content to show. See lib/marketing/social-proof.ts for why the lists are
 * empty and what may go in them.
 *
 * Kept as a component rather than inline markup so the two sites cannot drift —
 * the previous version existed twice, in two files, and had to be corrected
 * twice. Byte-identical in mmcbuild-marketing and mmcbuild-application.
 */
export default function SocialProof() {
  const partners = showPartners();
  const testimonials = showTestimonials();
  if (!partners && !testimonials) return null;

  return (
    <>
      {partners && (
        <section className="py-24 bg-gradient-to-b from-slate-50 via-white to-slate-50">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4 tracking-tight">
                Who we work with
              </h2>
              <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
                Organisations building with modern methods alongside us.
              </p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {PARTNERS.map((company) => (
                <div
                  key={company.name}
                  className="bg-white rounded-2xl p-6 border border-slate-200 flex items-center justify-center min-h-[7rem]"
                >
                  {/* A real logo file. If there isn't one, the partnership isn't
                      ready to be shown — do not substitute an emoji or initials. */}
                  <Image
                    src={company.logoSrc}
                    alt={company.name}
                    width={160}
                    height={64}
                    className="max-h-16 w-auto object-contain"
                  />
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {testimonials && (
        <section className="py-24 bg-gradient-to-b from-slate-900 to-slate-800">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-white sm:text-4xl mb-4">
                What our customers say
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {TESTIMONIALS.map((t) => (
                <figure
                  key={`${t.author}-${t.company}`}
                  className="bg-white/5 backdrop-blur-sm border border-white/10 p-8 rounded-2xl"
                >
                  <blockquote className="text-slate-200 mb-6 leading-relaxed">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <figcaption className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm">
                      {t.author.charAt(0)}
                    </div>
                    <div>
                      <div className="text-white font-semibold text-sm">{t.author}</div>
                      <div className="text-xs text-slate-400">
                        {t.role}, {t.company}
                      </div>
                    </div>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
