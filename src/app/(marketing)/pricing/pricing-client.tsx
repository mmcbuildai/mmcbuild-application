"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { CheckCircle2, ArrowRight, Sparkles } from "lucide-react";

type Plan = {
  name: string;
  monthlyPrice: number | null;
  description: string;
  freeNote?: string;
  features: string[];
  cta: string;
  popular: boolean;
};

const plans: Plan[] = [
  {
    name: "Essential",
    monthlyPrice: 49,
    description: "Individual builders, architects, designers, early adopters",
    freeNote: "Early-adopter price · free for 1 month",
    features: [
      "10 combined runs / month (MMC Build + MMC Comply)",
      "5 plan uploads per month",
      "separator",
      "AI-powered whole-of-house NCC compliance",
      "MMC Build & Comply reports",
      "AI Copilot for design, cost & constructability insights",
      "Access to MMC Directory",
      "Standard email support",
    ],
    cta: "Join Waitlist",
    popular: false,
  },
  {
    name: "Professional",
    monthlyPrice: 199,
    description: "Active builders, architects & consultants managing multiple projects",
    features: [
      "30 combined runs / month (MMC Build + MMC Comply)",
      "10 plan uploads per month",
      "separator",
      "Multi-user project collaboration",
      "Team invitations & role-based permissions",
      "Advanced NCC compliance reporting",
      "Upload compliance documents & maintain certifications",
      "Priority email support",
      "Integrations (BIM / SketchUp – roadmap)",
      "API access",
    ],
    cta: "Join Waitlist",
    popular: true,
  },
  {
    name: "Enterprise",
    monthlyPrice: null,
    description: "Tier 1 & 2 builders, large architectural, consulting & supplier firms",
    features: [
      "Unlimited* MMC Build + MMC Comply runs",
      "Unlimited* plan uploads",
      "separator",
      "Multi-organisation management",
      "Portfolio-level compliance & risk reporting",
      "Advanced governance & audit controls",
      "Custom integrations",
      "Dedicated account manager",
      "Priority support & escalation",
      "Team training (MMC Train)",
      "SLA-backed performance & uptime",
      "API access",
    ],
    cta: "Join Waitlist",
    popular: false,
  },
];

type FeatureRow = [string, boolean, boolean, boolean];

const featureSections: { title: string; rows: FeatureRow[] }[] = [
  {
    title: "User Features - Core Platform",
    rows: [
      ["Secure login & role-based access", true, true, true],
      ["Project dashboard (single user)", true, false, false],
      ["Project dashboard (multiple users)", false, true, true],
      ["Plan upload (PDF/DWG)", true, true, true],
      ["Project storage & history", false, true, true],
      ["Multiple active projects", false, true, true],
      ["Team collaboration (invite users)", false, true, true],
      ["Role-based permissions within projects", false, true, true],
      ["Version tracking of uploads", false, true, true],
    ],
  },
  {
    title: "MMC Comply – Compliance",
    rows: [
      ["Single instant Whole-of-house NCC compliance check", true, false, false],
      ["Single AI-identified non-compliant elements", true, false, false],
      ["Single NCC clause citations (transparent & auditable)", true, false, false],
      ["Single Compliance confidence indicators", true, false, false],
      ["Single PDF compliance report export", true, false, false],
      ["Multiple Whole-of-house NCC compliance checks and reports", false, true, true],
      ["Faster compliance processing", true, true, true],
      ["Issue severity ranking", true, true, true],
      ["Combined compliance report (project-ready)", true, true, true],
      ["Upload compliance documents", false, true, true],
      ["Maintain certifications", false, true, true],
      ["Project storage & history", false, true, true],
    ],
  },
  {
    title: "MMC Build – AI Copilot",
    rows: [
      ["Basic AI insights on uploaded plans", true, true, true],
      ["AI chat for NCC clarification & guidance", true, true, true],
      ["AI design optimisation suggestions (MMC / prefab / constructability)", true, true, true],
      ['"What-if" cost scenario modelling', true, true, true],
      ["Cost drivers & delta comparisons", true, true, true],
      ["AI explanations linked to design outcomes", true, true, true],
      ["Project storage & history", false, true, true],
      ["Spreadsheet cost summaries (XLSX)", true, true, true],
    ],
  },
  {
    title: "Usage Limits",
    rows: [
      ["Limited plan uploads per month", true, false, false],
      ["Limited AI runs per project", true, false, false],
    ],
  },
  {
    title: "Support",
    rows: [
      ["Email support", true, true, true],
      ["Priority email support", false, true, true],
      ["Onboarding assistance", true, true, true],
    ],
  },
  {
    title: "MMC Train",
    rows: [
      ["Access MMC training modules", false, true, true],
      ["Certification tracking", false, true, true],
    ],
  },
  {
    title: "MMC Directory",
    rows: [["Search verified trades, suppliers & consultants", true, true, true]],
  },
  {
    title: "Enterprise Control Features",
    rows: [["Multi-organisation management", false, false, true]],
  },
  {
    title: "Advanced Integrations",
    rows: [
      ["SketchUp / BIM workflows (roadmap)", false, true, true],
      ["Xero / Stripe billing integrations", false, true, true],
      ["API access", false, true, true],
    ],
  },
  {
    title: "Reporting & Risk",
    rows: [["Risk & exception summaries", false, true, true]],
  },
  {
    title: "Support & Services",
    rows: [
      ["Dedicated account manager", false, false, true],
      ["Priority support & escalation", false, false, true],
      ["Custom onboarding & training", false, false, true],
    ],
  },
];

const faqs = [
  {
    q: "Can I switch plans later?",
    a: "Yes, you can upgrade or downgrade your plan at any time. Changes will be reflected in your next billing cycle.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes! Our Essential plan is available free for 1 month so you can explore all the essential features.",
  },
  {
    q: "What payment methods do you accept?",
    a: "We accept all major credit cards, bank transfers, and can arrange invoicing for Enterprise customers.",
  },
  {
    q: "Do you offer discounts for annual billing?",
    a: "Yes! Annual billing saves you 20% compared to monthly billing on Professional and Enterprise plans.",
  },
];

export function PricingClient() {
  const [isAnnual, setIsAnnual] = React.useState(false);

  const getPrice = (plan: Plan): string => {
    if (plan.monthlyPrice === 0) return "Free";
    if (plan.monthlyPrice === null) return "Custom";
    const price = isAnnual ? Math.round(plan.monthlyPrice * 0.8) : plan.monthlyPrice;
    return `$${price}`;
  };

  const getPeriod = (plan: Plan): string => {
    if (plan.monthlyPrice === 0 || plan.monthlyPrice === null) return "";
    return "/month";
  };

  return (
    <div className="min-h-screen">
      <section className="relative bg-[#0f172a] text-white overflow-hidden py-16">
        <div className="absolute top-0 left-1/2 w-[800px] h-[400px] -translate-x-1/2 bg-blue-600/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center z-10">
          <h1 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl mb-4">
            Simple, Transparent Pricing
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-slate-300 mb-6">
            Choose the plan that fits your needs. All plans include access to our core features.
          </p>

          <div className="inline-flex items-center bg-white/10 backdrop-blur-sm rounded-full p-1 border border-white/20">
            <button
              onClick={() => setIsAnnual(false)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all ${
                !isAnnual ? "bg-white text-slate-900 shadow-lg" : "text-white hover:text-slate-200"
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`px-6 py-2 rounded-full text-sm font-medium transition-all relative ${
                isAnnual ? "bg-white text-slate-900 shadow-lg" : "text-white hover:text-slate-200"
              }`}
            >
              Annual
              <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
                Save 20%
              </span>
            </button>
          </div>
        </div>
      </section>

      <section className="py-12 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-6">
            <p className="text-slate-600 text-lg">
              For Trades &amp; Suppliers pricing, please click{" "}
              <Link
                href="/mmc-suppliers#pricing"
                className="text-blue-600 hover:text-blue-700 font-semibold underline"
              >
                here
              </Link>
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.name}
                className={`relative rounded-3xl p-6 ${
                  plan.popular
                    ? "bg-slate-900 text-white ring-4 ring-blue-500 scale-105"
                    : "bg-white border border-slate-200"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                    <div className="inline-flex items-center gap-1 bg-gradient-to-r from-blue-500 to-brand-500 text-white text-sm font-medium px-4 py-1 rounded-full">
                      <Sparkles className="h-3 w-3" /> Most Popular
                    </div>
                  </div>
                )}

                <div className="mb-6">
                  <h3
                    className={`text-lg font-bold mb-1 ${
                      plan.popular ? "text-white" : "text-slate-900"
                    }`}
                  >
                    {plan.name}
                  </h3>
                  <div className="flex items-baseline gap-1">
                    <span
                      className={`text-3xl font-extrabold ${
                        plan.popular ? "text-white" : "text-slate-900"
                      }`}
                    >
                      {getPrice(plan)}
                    </span>
                    <span className={plan.popular ? "text-slate-400" : "text-slate-500"}>
                      {getPeriod(plan)}
                    </span>
                  </div>
                  {isAnnual && plan.monthlyPrice && plan.monthlyPrice > 0 && (
                    <p
                      className={`mt-1 text-xs ${
                        plan.popular ? "text-slate-400" : "text-slate-500"
                      }`}
                    >
                      Billed annually at ${Math.round(plan.monthlyPrice * 0.8 * 12)}
                    </p>
                  )}
                  <p
                    className={`mt-1 text-xs ${plan.popular ? "text-slate-400" : "text-slate-600"}`}
                  >
                    {plan.description}
                  </p>
                  {plan.freeNote && (
                    <div className="mt-2 bg-green-50 border border-green-200 rounded-lg px-2 py-1.5">
                      <p className="text-xs font-bold text-green-700 text-center">
                        ✨ {plan.freeNote}
                      </p>
                    </div>
                  )}
                </div>

                <ul className="space-y-2 mb-6">
                  {plan.features.map((feature, i) =>
                    feature === "separator" ? (
                      <li key={i} className="pt-1 pb-1">
                        <div
                          className={`border-t ${
                            plan.popular ? "border-slate-700" : "border-slate-200"
                          }`}
                        />
                      </li>
                    ) : (
                      <li key={i} className="flex items-start gap-2">
                        <CheckCircle2
                          className={`h-4 w-4 flex-shrink-0 mt-0.5 ${
                            plan.popular ? "text-blue-400" : "text-blue-600"
                          }`}
                        />
                        <span
                          className={`text-sm ${plan.popular ? "text-slate-300" : "text-slate-600"}`}
                        >
                          {feature}
                        </span>
                      </li>
                    )
                  )}
                </ul>

                <Button
                  asChild
                  className={`w-full rounded-full ${
                    plan.popular
                      ? "bg-blue-600 hover:bg-blue-500 text-white"
                      : "bg-slate-900 hover:bg-slate-800 text-white"
                  }`}
                >
                  <Link href="/contact">
                    {plan.cta} <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
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

          <div className="rounded-2xl border border-slate-200 bg-white shadow-lg">
            <div className="overflow-x-auto overscroll-x-contain">
              <div className="max-h-[80dvh] overflow-y-auto">
                <table className="w-full min-w-[640px]">
                  <thead className="sticky top-0 z-10 bg-slate-900 text-white">
                    <tr>
                      <th className="w-2/5 px-4 py-4 text-left text-sm font-bold sm:px-6 sm:py-6 sm:text-lg">Feature</th>
                      <th className="w-1/5 border-l border-slate-700 px-3 py-4 text-center text-sm font-bold sm:px-6 sm:py-6 sm:text-lg">
                        Essential
                      </th>
                      <th className="w-1/5 border-l border-slate-700 px-3 py-4 text-center text-sm font-bold sm:px-6 sm:py-6 sm:text-lg">
                        Professional
                      </th>
                      <th className="w-1/5 border-l border-slate-700 px-3 py-4 text-center text-sm font-bold sm:px-6 sm:py-6 sm:text-lg">
                        Enterprise
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {featureSections.map((section) => (
                      <React.Fragment key={section.title}>
                        <tr className="bg-slate-100">
                          <td
                            colSpan={4}
                            className="px-4 py-3 text-sm font-bold uppercase tracking-wide text-slate-900 sm:px-6"
                          >
                            {section.title}
                          </td>
                        </tr>
                        {section.rows.map((row, idx) => (
                          <tr
                            key={`${section.title}-${idx}`}
                            className="border-t border-slate-200 hover:bg-slate-50"
                          >
                            <td className="px-4 py-3 text-sm text-slate-700 sm:px-6 sm:py-4 sm:text-base">{row[0]}</td>
                            {([row[1], row[2], row[3]] as boolean[]).map((cell, cellIdx) => (
                              <td
                                key={cellIdx}
                                className="border-l border-slate-200 px-3 py-3 text-center sm:px-6 sm:py-4"
                              >
                                {cell ? (
                                  <CheckCircle2 className="mx-auto h-5 w-5 text-green-600" />
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
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
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">
            Frequently Asked Questions
          </h2>

          <div className="space-y-6">
            {faqs.map((faq) => (
              <div key={faq.q} className="border border-slate-200 rounded-2xl p-6">
                <h3 className="font-semibold text-slate-900 mb-2">{faq.q}</h3>
                <p className="text-slate-600">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
