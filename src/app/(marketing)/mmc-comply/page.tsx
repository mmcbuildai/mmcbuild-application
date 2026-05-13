import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import WaitlistForm from "@/components/marketing/waitlist-form";
import {
  ArrowRight,
  CheckCircle2,
  FileCheck,
  Shield,
  Clock,
  Zap,
  AlertCircle,
} from "lucide-react";

export const metadata: Metadata = {
  title: "MMC Comply — AI-Powered NCC Compliance for Construction",
  description:
    "Simplify building compliance with AI. Check NCC compliance in minutes, not weeks. Reduce approval times and eliminate costly revisions with MMC Comply.",
};

const features = [
  {
    icon: Shield,
    title: "NCC Compliance",
    description:
      "Automated checks against the National Construction Code with detailed reporting.",
  },
  {
    icon: Clock,
    title: "Real-time Updates",
    description: "Stay current with automatic updates when regulations change.",
  },
  {
    icon: Zap,
    title: "Instant Reports",
    description: "Generate comprehensive compliance reports in seconds, not days.",
  },
];

const steps = [
  { step: "01", title: "Upload Documents", desc: "Submit your plans and specifications" },
  { step: "02", title: "AI Analysis", desc: "Our AI scans for compliance issues" },
  { step: "03", title: "Review Results", desc: "Get detailed findings and recommendations" },
  { step: "04", title: "Export Report", desc: "Download council-ready documentation" },
];

const livePreview = [
  "NCC Volume 1 - Passed",
  "NCC Volume 2 - Passed",
  "Fire Safety - 1 Issue",
  "Structural - Passed",
];

export default function MMCComplyPage() {
  return (
    <div className="min-h-screen">
      <section className="relative bg-gradient-to-br from-blue-900 via-blue-800 to-slate-900 text-white overflow-hidden py-24">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-blue-500/20 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-500/30 rounded-full px-4 py-1.5 mb-6">
                <FileCheck className="h-4 w-4 text-blue-300" />
                <span className="text-sm text-blue-300 font-medium">MMC Comply</span>
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl mb-6">
                Compliance Made <span className="text-blue-400">Simple</span>
              </h1>
              <p className="text-xl text-slate-300 mb-8">
                Automated NCC compliance assessment powered by AI. Reduce approval times by up to
                60% and eliminate costly revisions.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  asChild
                  size="lg"
                  className="bg-white text-blue-900 hover:bg-slate-100 rounded-full px-8"
                >
                  <a href="#waitlist">
                    Join Waitlist <ArrowRight className="ml-2 h-5 w-5" />
                  </a>
                </Button>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-8 border border-white/20">
                <div className="flex items-center gap-3 mb-6">
                  <div className="h-3 w-3 rounded-full bg-green-400" />
                  <span className="text-sm text-slate-300">Live Compliance Check</span>
                </div>
                <div className="space-y-4">
                  {livePreview.map((item) => (
                    <div
                      key={item}
                      className="flex items-center justify-between bg-white/5 rounded-xl p-4"
                    >
                      <span className="text-white">{item.split(" - ")[0]}</span>
                      <span
                        className={`flex items-center gap-1 ${
                          item.includes("Issue") ? "text-amber-400" : "text-green-400"
                        }`}
                      >
                        {item.includes("Issue") ? (
                          <AlertCircle className="h-4 w-4" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}
                        {item.split(" - ")[1]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Powerful Features</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Everything you need to ensure your projects meet Australian building standards.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-slate-50 rounded-2xl p-8 hover:shadow-lg transition-shadow"
              >
                <div className="h-12 w-12 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
                  <feature.icon className="h-6 w-6 text-blue-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                <p className="text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">How It Works</h2>
            <p className="text-xl text-slate-600">Four simple steps to compliance</p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, idx) => (
              <div key={step.step} className="relative">
                <div className="text-6xl font-extrabold text-blue-100 mb-4">{step.step}</div>
                <h3 className="text-xl font-bold text-slate-900 mb-2">{step.title}</h3>
                <p className="text-slate-600">{step.desc}</p>
                {idx < steps.length - 1 && (
                  <div className="hidden lg:block absolute top-8 right-0 w-1/2 h-0.5 bg-blue-100" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="waitlist" className="py-24 bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="text-white">
              <h2 className="text-3xl font-bold mb-6">Get Early Access to MMC Comply</h2>
              <p className="text-lg text-slate-300 mb-8">
                Be among the first to experience AI-powered compliance assessment. Join our
                waitlist for exclusive early access.
              </p>
              <ul className="space-y-4">
                {[
                  "Priority access when we launch",
                  "Exclusive beta features",
                  "Direct feedback channel",
                  "Special founding member pricing",
                ].map((item) => (
                  <li key={item} className="flex items-center text-slate-200">
                    <CheckCircle2 className="h-5 w-5 text-blue-400 mr-3" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <WaitlistForm defaultInterest="comply" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
