import { Fragment } from "react";
import type { Metadata } from "next";
import { CheckCircle2, Users, Award, TrendingUp, Shield } from "lucide-react";
import TradesSupplierForm from "@/components/marketing/trades-supplier-form";
import { TAX_QUALIFIER, TAX_DISCLOSURE } from "@/lib/stripe/plans";
import { isSupplierPricingEnabled } from "@/lib/pricing/supplier-pricing";

export const metadata: Metadata = {
  title: "MMC Trades & Suppliers Directory — Join Australia's Leading MMC Network",
  description:
    "Join the verified MMC trades and suppliers directory. Connect with builders, architects, and developers seeking Modern Methods of Construction expertise.",
};

const benefits = [
  "Be listed as a verified MMC-capable professional",
  "Advertising to builders, developers, owner builders, engineers and all other construction industry professionals",
  "Reduce time wasted explaining what MMC you can deliver",
  "Stand out on quality and capability, not lowest price",
];

const targetAudience = [
  "Prefabrication installation",
  "Panelised system trades",
  "Modular management",
  "MMC manufacturers & suppliers",
  "Consultants experienced in MMC delivery",
];

/**
 * ⚠️ THE PRICE FIELDS ARE OPTIONAL AND CURRENTLY EMPTY, DELIBERATELY.
 *
 * These tiers used to carry "$99" / "$499" and "First 2 months free". Those
 * figures matched NOTHING: not the confirmed model ($199 Verified Supplier /
 * $299 Growth Partner, which is what the marketing site shows and what exists
 * in Stripe), and not anything purchasable, since `plans.ts` reads no supplier
 * price ID at all. They were removed on 2026-08-09.
 *
 * They were hidden behind a flag first, which was the wrong stopping point.
 * Keeping the STRUCTURE is sensible; keeping the false FIGURES behind a switch
 * is not — they sit one variable away from being live, and whoever flips that
 * switch in a year has no way of knowing they were never real. That is the same
 * reasoning Karen accepted for the partner logos and testimonials on SCRUM-376,
 * and it applies identically to a price.
 *
 * So this is the empty shell: tier names, feature lists, the comparison table
 * and the join form all stay and keep doing their job (the form produces real
 * supplier leads — SCRUM-294). Only the claims about money are gone.
 *
 * TO TURN PRICING ON, BOTH are required:
 *   1. Put REAL figures below — ones that match Stripe and can actually be paid.
 *   2. Set NEXT_PUBLIC_SUPPLIER_PRICING_ENABLED=true in both Vercel projects.
 * An empty `price` renders nothing even with the flag on, so switching it early
 * cannot resurrect a figure that is not here.
 */
type Plan = {
  name: string;
  price?: string;
  period?: string;
  trial?: string;
  features: string[];
  popular?: boolean;
};

const plans: Plan[] = [
  {
    name: "Basic Directory",
    features: [
      "Basic directory listing",
      "Company profile page",
      "Contact information display",
      "MMC capability tags",
      "Search visibility",
    ],
  },
  {
    name: "Professional Directory",
    popular: true,
    features: [
      "Featured directory placement",
      "Enhanced company profile",
      "Portfolio showcase",
      "Project case studies",
      "Priority search ranking",
      "Verified badge",
      "Lead notifications",
    ],
  },
];

type FeatureRow = [string, boolean, boolean];
const featureSections: { title: string; rows: FeatureRow[] }[] = [
  {
    title: "Trade & Suppliers Features",
    rows: [
      ["ABN & licence verification", true, true],
      ["Public directory listing", true, true],
      ["MMC capability tagging", true, true],
    ],
  },
  {
    title: "Lead & Tender Access",
    rows: [
      ["Receive project invitations", false, true],
      ["Respond to tenders via platform", false, true],
      ["Profile visibility to users", false, true],
    ],
  },
  {
    title: "Enterprise Control Features",
    rows: [["Multi-organisation management", false, true]],
  },
  {
    title: "Support & Services",
    rows: [
      ["Dedicated account manager", false, true],
      ["Priority support & escalation", false, true],
      ["Custom onboarding & training", false, true],
    ],
  },
];

const stats = [
  { icon: Users, label: "Verified Professionals", value: "500+" },
  { icon: TrendingUp, label: "Active Projects", value: "1,200+" },
  { icon: Shield, label: "Quality Assured", value: "100%" },
  { icon: Award, label: "Client Satisfaction", value: "4.8/5" },
];

export default function MMCSuppliersPage() {
  // Supplier tiers are not sellable yet — see lib/pricing/supplier-pricing.ts.
  const showPricing = isSupplierPricingEnabled();

  return (
    <div className="min-h-screen">
      <section className="relative bg-[#0f172a] text-white overflow-hidden py-16">
        <div className="absolute top-0 left-1/2 w-[800px] h-[400px] -translate-x-1/2 bg-blue-600/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center z-10">
          <div className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-300 mb-6 backdrop-blur-sm">
            <Award className="h-4 w-4 mr-2" />
            Verified MMC Professionals
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl mb-6">
            Get Found for Your Specialised Skills
          </h1>
          <p className="mx-auto max-w-2xl text-xl text-slate-300 mb-4">
            MMC Build isn&apos;t a general marketplace.
          </p>
          <p className="mx-auto max-w-2xl text-2xl font-bold text-blue-400">
            It&apos;s a verified MMC ecosystem.
          </p>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Why Join MMC Directory</h2>
              <div className="space-y-4">
                {benefits.map((benefit) => (
                  <div key={benefit} className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      <CheckCircle2 className="h-6 w-6 text-green-600" />
                    </div>
                    <p className="text-lg text-slate-700">{benefit}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-brand-50 rounded-3xl p-8 border border-blue-100">
              <div className="grid grid-cols-2 gap-6">
                {stats.map((stat) => (
                  <div key={stat.label} className="bg-white rounded-xl p-6 text-center">
                    <stat.icon className="h-8 w-8 text-blue-600 mx-auto mb-3" />
                    <div className="text-2xl font-bold text-slate-900 mb-1">{stat.value}</div>
                    <div className="text-sm text-slate-600">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Who It&apos;s For</h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">
              Construction Builders, Trades, Consultants and Suppliers with experience in:
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {targetAudience.map((item) => (
              <div
                key={item}
                className="bg-white rounded-xl p-6 border border-slate-200 flex items-center gap-3"
              >
                <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0" />
                <span className="text-slate-800 font-medium">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">
              {showPricing
                ? "MMC Trades & Suppliers Directory Pricing"
                : "MMC Trades & Suppliers Directory Listings"}
            </h2>
            <p className="text-lg text-slate-600">
              {showPricing
                ? "Choose the plan that best fits your business"
                : "Two levels of listing. Register your interest below and we'll be in touch with availability and pricing."}
            </p>
            {showPricing && <p className="mt-3 text-sm text-slate-600">{TAX_DISCLOSURE}</p>}
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`rounded-3xl p-8 border-2 ${
                  plan.popular
                    ? "border-blue-500 bg-blue-50 relative"
                    : "border-slate-200 bg-white"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-blue-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                    Popular Choice
                  </div>
                )}
                {/* The price, the billing period and the free-months offer are
                    all price CLAIMS, so they hide together — leaving a tier
                    name and its feature list, which are true either way.

                    BOTH conditions are required, mirroring showPartners() in
                    lib/marketing/social-proof.ts: the flag must be on AND there
                    must be a real figure to show. An empty price renders nothing
                    even when the flag is flipped, so the switch alone can never
                    resurrect a number that is not in the file. */}
                <div className="text-center mb-6">
                  <h3 className="text-2xl font-bold text-slate-900 mb-2">{plan.name}</h3>
                  {showPricing && plan.price && (
                    <>
                      <div className="text-green-600 font-semibold mb-4">{plan.trial}</div>
                      <div className="flex items-baseline justify-center">
                        <span className="text-4xl font-bold text-slate-900">{plan.price}</span>
                        {/* Prices are quoted GST-exclusive — see plans.ts. */}
                        <span className="text-slate-600 ml-1">
                          {plan.period} {TAX_QUALIFIER}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">
            Complete Feature Breakdown
          </h2>

          <div className="bg-white rounded-2xl shadow-lg overflow-hidden border border-slate-200">
            <div className="overflow-x-auto">
              <div className="max-h-[800px] overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-slate-900 text-white sticky top-0 z-10">
                    <tr>
                      <th className="text-left py-6 px-6 font-bold text-lg w-1/2">Feature</th>
                      <th className="text-center py-6 px-6 font-bold text-lg w-1/4 border-l border-slate-700">
                        Starter Trades &amp; Suppliers
                      </th>
                      <th className="text-center py-6 px-6 font-bold text-lg w-1/4 border-l border-slate-700">
                        Professional Trades &amp; Suppliers
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {featureSections.map((section) => (
                      <Fragment key={section.title}>
                        <tr className="bg-slate-100">
                          <td
                            colSpan={3}
                            className="py-3 px-6 font-bold text-slate-900 text-sm uppercase tracking-wide"
                          >
                            {section.title}
                          </td>
                        </tr>
                        {section.rows.map((row, idx) => (
                          <tr
                            key={`${section.title}-${idx}`}
                            className="border-t border-slate-200 hover:bg-slate-50"
                          >
                            <td className="py-4 px-6 text-slate-700">{row[0]}</td>
                            {([row[1], row[2]] as boolean[]).map((cell, cellIdx) => (
                              <td
                                key={cellIdx}
                                className="py-4 px-6 text-center border-l border-slate-200"
                              >
                                {cell ? (
                                  <CheckCircle2 className="h-5 w-5 text-green-600 mx-auto" />
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-4 text-center">
            Ready to Join the MMC Directory?
          </h2>
          <div className="bg-slate-50 rounded-2xl p-8 border border-slate-200">
            <TradesSupplierForm />
          </div>
        </div>
      </section>
    </div>
  );
}
