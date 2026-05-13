import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import WaitlistForm from "@/components/marketing/waitlist-form";
import {
  ArrowRight,
  CheckCircle2,
  Bot,
  DollarSign,
  FileText,
  TrendingUp,
  GitCompare,
  Users,
  BarChart3,
  FileCheck,
} from "lucide-react";

export const metadata: Metadata = {
  title: "MMC Quote — Intelligent Quoting Made Simple",
  description:
    "Transform MMC recommendations into clear, data-driven cost estimates with AI-powered precision.",
};

const features = [
  {
    icon: DollarSign,
    title: "MMC-Based Cost Estimates",
    description:
      "Cost breakdowns aligned to MMC Build recommended systems with materials, components, and labour allowances.",
  },
  {
    icon: GitCompare,
    title: '"What-If" Cost Scenarios',
    description:
      "Compare alternative MMC systems, test design changes, and understand cost impact before committing.",
  },
  {
    icon: TrendingUp,
    title: "Early-Stage Cost Confidence",
    description:
      "Support feasibility and client discussions while reducing redesign and re-pricing cycles.",
  },
  {
    icon: FileText,
    title: "Exportable Reports",
    description:
      "PDF and Word outputs with clear assumptions and transparency for easy sharing with stakeholders.",
  },
];

const workflow = [
  { step: "01", title: "Upload to MMC Build", desc: "Submit your plans and specifications", icon: FileCheck },
  { step: "02", title: "Receive Recommendations", desc: "Get MMC system recommendations from the analysis", icon: BarChart3 },
  { step: "03", title: "Run MMC Quote", desc: "Generate indicative costing, compare alternatives, and explore what-if scenarios", icon: Bot },
  { step: "04", title: "Export & Share", desc: "Download and share comprehensive cost reports", icon: FileText },
];

const audiences = [
  { title: "Architects & Designers", description: "Validate MMC decisions early without waiting on full QS pricing.", icon: Users },
  { title: "Builders & Developers", description: "Understand cost implications before locking in systems or suppliers.", icon: TrendingUp },
  { title: "Consultants & Project Managers", description: "Support feasibility studies, value engineering, and client reporting.", icon: FileText },
  { title: "Trades & Suppliers", description: "Align scope and expectations earlier in the process.", icon: CheckCircle2 },
];

export default function MMCQuotePage() {
  return (
    <div className="min-h-screen">
      <section className="relative bg-gradient-to-br from-purple-900 via-purple-800 to-slate-900 text-white overflow-hidden py-24">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-purple-500/20 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-purple-500/20 border border-purple-500/30 rounded-full px-4 py-1.5 mb-6">
                <Bot className="h-4 w-4 text-purple-300" />
                <span className="text-sm text-purple-300 font-medium">MMC Quote</span>
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl mb-6">
                Intelligent <span className="text-purple-400">Quoting Made Simple</span>
              </h1>
              <p className="text-xl text-slate-300 mb-8">
                Transform MMC recommendations into clear, data-driven cost estimates with
                AI-powered precision.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild size="lg" className="bg-white text-purple-900 hover:bg-slate-100 rounded-full px-8">
                  <a href="#waitlist">
                    Join Waitlist <ArrowRight className="ml-2 h-5 w-5" />
                  </a>
                </Button>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
                <div className="flex items-center gap-3 mb-6">
                  <Bot className="h-5 w-5 text-purple-300" />
                  <span className="text-sm text-slate-300">AI Cost Analysis</span>
                </div>
                <div className="space-y-4">
                  <div className="bg-white/5 rounded-xl p-4">
                    <p className="text-xs text-slate-400 mb-1">Base Cost</p>
                    <p className="text-2xl font-bold text-white">$485,000</p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4">
                    <p className="text-xs text-slate-400 mb-1">MMC Alternative</p>
                    <p className="text-2xl font-bold text-green-400">$445,000</p>
                    <p className="text-xs text-green-400 mt-1">↓ 8% savings</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">How MMC Quote Works</h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">
              A seamless workflow from plan upload to detailed cost reports
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {workflow.map((step, idx) => (
              <div key={step.step} className="relative">
                <div className="flex flex-col items-center text-center">
                  <div className="h-16 w-16 bg-purple-100 rounded-2xl flex items-center justify-center mb-4">
                    <step.icon className="h-8 w-8 text-purple-600" />
                  </div>
                  <div className="text-5xl font-extrabold text-purple-100 mb-4">{step.step}</div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-slate-600">{step.desc}</p>
                </div>
                {idx < workflow.length - 1 && (
                  <div className="hidden lg:block absolute top-8 right-0 w-1/2 h-0.5 bg-purple-100" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Key Capabilities</h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">
              Comprehensive cost analysis tools designed for MMC construction
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-2xl p-8 border border-slate-200 hover:shadow-lg transition-shadow"
              >
                <div className="h-12 w-12 bg-purple-100 rounded-xl flex items-center justify-center mb-6">
                  <feature.icon className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                <p className="text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Who MMC Quote Is For</h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">
              Empowering every construction stakeholder with reliable cost insights
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {audiences.map((audience) => (
              <div
                key={audience.title}
                className="bg-slate-50 rounded-2xl p-6 hover:shadow-lg transition-shadow"
              >
                <div className="h-12 w-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                  <audience.icon className="h-6 w-6 text-purple-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 mb-2">{audience.title}</h3>
                <p className="text-slate-600 text-sm">{audience.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="waitlist" className="py-24 bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="text-white">
              <h2 className="text-3xl font-bold mb-6">Get Early Access to MMC Quote</h2>
              <p className="text-lg text-slate-300 mb-8">
                Transform MMC recommendations into actionable cost insights. Join the waitlist
                today.
              </p>
              <ul className="space-y-4">
                {[
                  "Instant cost estimates from MMC recommendations",
                  "Compare multiple MMC system alternatives",
                  "Export professional cost reports",
                  "Early adopter pricing",
                ].map((item) => (
                  <li key={item} className="flex items-center text-slate-200">
                    <CheckCircle2 className="h-5 w-5 text-purple-400 mr-3" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <WaitlistForm defaultInterest="quote" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
