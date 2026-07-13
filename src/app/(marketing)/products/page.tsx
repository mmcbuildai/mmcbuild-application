import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  Hammer,
  FileCheck,
  Users,
  GraduationCap,
  Bot,
  CheckCircle2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Our Solutions — MMC Build Platform",
  description: "One Platform. Five Core Solutions. Built for MMC Adoption.",
};

type Product = {
  icon: typeof FileCheck;
  title: string;
  desc: React.ReactNode;
  features: string[];
  href: string;
  color: string;
  gradient: string;
};

const products: Product[] = [
  {
    icon: FileCheck,
    title: "MMC Comply",
    desc: (
      <>
        MMC Comply automatically assesses the uploaded plans using AI for the{" "}
        <strong>whole-of-house compliance</strong> against the{" "}
        <strong>National Construction Code (NCC)</strong>
      </>
    ),
    features: [
      "Clause-by-clause NCC checks",
      "Clear pass / fail outcomes with citations",
      "Identifies compliance risks early — before submission",
      "Generates exportable compliance reports (PDF/Word)",
    ],
    href: "/mmc-comply",
    color: "text-blue-600",
    gradient: "from-blue-600 to-blue-700",
  },
  {
    icon: Hammer,
    title: "MMC Build",
    desc: "MMC Build analyses plans against a growing knowledge base of Australian MMC systems and manufacturers.",
    features: [
      "Identify MMC alternatives (prefab, panelised, modular systems)",
      "Compare traditional vs MMC build approaches",
      'Generate "what-if" constructability scenarios',
      "Visualise recommended solutions in 3D (Revit-ready)",
    ],
    href: "/mmc-build",
    color: "text-brand-600",
    gradient: "from-brand-600 to-brand-700",
  },
  {
    icon: Users,
    title: "MMC Directory",
    desc: (
      <>
        A national directory of{" "}
        <strong>verified MMC-ready trades, suppliers, and consultants</strong>.
      </>
    ),
    features: [
      "Verified licences, ABNs, and experience",
      "Filter by MMC system, trade, region, or capability",
      "Connect with professionals who actually know MMC",
      "Increase visibility for qualified trades and specialists",
    ],
    href: "/mmc-directory",
    color: "text-amber-600",
    gradient: "from-amber-500 to-amber-600",
  },
  {
    icon: GraduationCap,
    title: "MMC Train",
    desc: "Practical, on-demand training to help industry professionals upskill in MMC.",
    features: [
      "MMC system fundamentals",
      "Manufacturer-aligned learning",
      "Certification pathways for trades",
    ],
    href: "/mmc-train",
    color: "text-indigo-600",
    gradient: "from-indigo-600 to-indigo-700",
  },
  {
    icon: Bot,
    title: "MMC Quote",
    desc: "Intelligent AI Copilot for instant specifications, quoting, and project estimation.",
    features: [
      "Costing powered by real supplier data — not guesswork",
      "Quote generates indicative cost estimates directly from MMC Build's verified supplier knowledge base",
      "Based on the specified parts and system assemblies provided by participating manufacturers and suppliers.",
    ],
    href: "/mmc-quote",
    color: "text-purple-600",
    gradient: "from-purple-600 to-purple-700",
  },
];

export default function ProductsPage() {
  return (
    <div className="min-h-screen">
      <section className="relative bg-[#0f172a] text-white overflow-hidden py-24">
        <div className="absolute top-0 left-1/2 w-[800px] h-[400px] -translate-x-1/2 bg-blue-600/20 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center z-10">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl mb-6">
            Our Solutions
          </h1>
          <p className="mx-auto max-w-2xl text-xl text-slate-300 mb-4">
            One Platform. Five Core Solutions. Built for MMC Adoption.
          </p>
          <p className="mx-auto max-w-2xl text-lg text-slate-400">
            A comprehensive suite of AI-powered tools designed to revolutionise modern construction
            methods.
          </p>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-16">
            {products.map((product, idx) => (
              <div
                key={product.title}
                className={`flex flex-col ${
                  idx % 2 === 1 ? "lg:flex-row-reverse" : "lg:flex-row"
                } gap-12 items-center`}
              >
                <div className="flex-1">
                  <div
                    className={`inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${product.gradient} mb-6`}
                  >
                    <product.icon className="h-7 w-7 text-white" />
                  </div>
                  <h2 className="text-3xl font-bold text-slate-900 mb-4">{product.title}</h2>
                  <p className="text-lg text-slate-600 mb-6">{product.desc}</p>

                  <ul className="space-y-3 mb-8">
                    {product.features.map((feature) => (
                      <li key={feature} className="flex items-start text-slate-700">
                        <CheckCircle2
                          className={`h-5 w-5 mr-3 mt-0.5 flex-shrink-0 ${product.color}`}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    asChild
                    className={`bg-gradient-to-r ${product.gradient} text-white rounded-full px-8`}
                  >
                    <Link href={product.href}>
                      Learn More <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                </div>

                <div className="flex-1">
                  <div
                    className={`aspect-video rounded-3xl bg-gradient-to-br ${product.gradient} p-8 flex items-center justify-center`}
                  >
                    <product.icon className="h-32 w-32 text-white/30" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-6">Ready to get started?</h2>
          <p className="text-xl text-slate-600 mb-8">
            Join the waitlist to get early access to our complete MMC Suite.
          </p>
          <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-10">
            <Link href="/contact">
              Join Waitlist <ArrowRight className="ml-2 h-5 w-5" />
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
