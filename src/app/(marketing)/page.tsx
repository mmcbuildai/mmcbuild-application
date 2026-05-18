import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  ArrowRight,
  CheckCircle2,
  Hammer,
  FileCheck,
  Users,
  GraduationCap,
  Bot,
} from "lucide-react";

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "MMC Build Pty Ltd",
  alternateName: "MMC Build",
  url: "https://mmcbuild.com.au",
  description:
    "Australia's leading platform for Modern Methods of Construction with AI-powered compliance, intelligent quoting, and verified trades directory.",
  address: {
    "@type": "PostalAddress",
    addressRegion: "New South Wales",
    addressCountry: "AU",
  },
  contactPoint: {
    "@type": "ContactPoint",
    telephone: "+61-404-394-225",
    contactType: "Customer Service",
    email: "admin@mmcbuild.com.au",
    areaServed: "AU",
  },
  sameAs: [
    "https://www.linkedin.com/company/mmc-build-pty-ltd",
    "https://www.facebook.com/profile.php?id=61586821792649",
    "https://www.instagram.com/karen.engel2026/",
  ],
};

const solutions = [
  {
    icon: FileCheck,
    title: "MMC Comply",
    desc: "Automated assessment against the National Construction Code (NCC)",
    href: "/mmc-comply",
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  {
    icon: Hammer,
    title: "MMC Build",
    desc: "Access latest building technologies and alternate suggestions",
    href: "/mmc-build",
    color: "text-teal-600",
    bgColor: "bg-teal-50",
  },
  {
    icon: Users,
    title: "MMC Directory",
    desc: "Connect with MMC verified specialised Trades, Consultants and Suppliers",
    href: "/mmc-directory",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
  },
  {
    icon: GraduationCap,
    title: "MMC Train",
    desc: "Certification programs and training on the latest technologies",
    href: "/mmc-train",
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
  },
  {
    icon: Bot,
    title: "MMC Quote",
    desc: "Intelligent AI Copilot for instant specifications and quoting",
    href: "/mmc-quote",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
  {
    icon: Users,
    title: "Trades & Suppliers",
    desc: "Join our verified directory of MMC-capable professionals and suppliers",
    href: "/mmc-suppliers",
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
];

const partners = [
  { name: "Lendlease", gradient: "from-blue-600 to-cyan-600", icon: "🏗️" },
  { name: "Mirvac", gradient: "from-purple-600 to-pink-600", icon: "🏢" },
  { name: "Stockland", gradient: "from-green-600 to-emerald-600", icon: "🌳" },
  { name: "Multiplex", gradient: "from-orange-600 to-red-600", icon: "⚡" },
  { name: "Metricon", gradient: "from-indigo-600 to-blue-600", icon: "🏠" },
  { name: "Hutchinson", gradient: "from-teal-600 to-cyan-600", icon: "🔨" },
  { name: "Simonds", gradient: "from-amber-600 to-yellow-600", icon: "✨" },
  { name: "G.J. Gardner", gradient: "from-rose-600 to-pink-600", icon: "🎯" },
];

const testimonials = [
  {
    quote:
      "MMC Build has completely revolutionized our workflow. The MMC Comply tool alone saved us weeks of regulatory back-and-forth.",
    author: "Sarah Jenkins",
    role: "Senior Architect",
    company: "Urban Design Co.",
  },
  {
    quote:
      "The most comprehensive directory for modern construction I've found. Connected us with the right modular builder immediately.",
    author: "Michael Chen",
    role: "Lead Developer",
    company: "Future Living",
  },
  {
    quote:
      "MMC Build's suggestions helped us reduce material costs by 15% while improving thermal performance significantly.",
    author: "David Smith",
    role: "Project Manager",
    company: "Apex Constructions",
  },
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <div className="flex flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />

      {/* Hero */}
      <section className="relative bg-[#0f172a] text-white overflow-hidden">
        <div className="absolute top-0 left-1/2 w-[1000px] h-[500px] -translate-x-1/2 bg-blue-600/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-teal-600/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <div className="mb-6 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-300 backdrop-blur-sm sm:mb-8">
            <span className="mr-2 flex h-2 w-2 animate-pulse rounded-full bg-blue-400" />
            The Future of Building is Here
          </div>
          <h1 className="mb-6 max-w-5xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:mb-8 sm:text-5xl lg:text-7xl">
            Modern Methods of Construction Ecosystem{" "}
            <span className="block bg-gradient-to-r from-blue-400 to-teal-400 bg-clip-text text-transparent">
              Powered by AI
            </span>
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-base leading-relaxed text-slate-300 sm:mb-10 sm:text-xl">
            MMC Build accelerates the construction process while maintaining architectural integrity.
            Create houses that are cost effective, faster, and more sustainable.
          </p>

          <div className="flex w-full flex-col gap-4 sm:w-auto sm:flex-row">
            <Button
              asChild
              size="lg"
              className="h-12 rounded-full bg-blue-600 px-8 text-base text-white shadow-xl shadow-blue-600/20 hover:bg-blue-500 sm:h-14 sm:px-10 sm:text-lg"
            >
              <Link href="/contact">
                Join the Waitlist <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-8 mt-12 text-slate-400">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01"
                />
              </svg>
              <span className="text-sm">Australia-based Secure Data Centers</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <span className="text-sm">NCC Compliant</span>
            </div>
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <span className="text-sm">Enterprise Security</span>
            </div>
          </div>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="py-20 bg-gradient-to-b from-white to-slate-50 border-t border-slate-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-5xl mx-auto">
            <h2 className="text-3xl font-bold text-slate-900 mb-6 sm:text-4xl">
              Empowering Australia&apos;s construction industry to adopt Modern Methods of Construction
            </h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              MMC Build is Australia&apos;s first AI-powered construction intelligence platform,
              purpose-built to help industry professionals confidently specify, validate, and deliver
              Modern Methods of Construction (MMC). We eliminate compliance uncertainty, reduce costly
              rework, and accelerate project timelines—all within one unified platform aligned with
              Australian regulations and real-world construction demands.
            </p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="products" className="py-24 bg-slate-50 relative">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl lg:text-5xl mb-4">
              The MMC Solutions
            </h2>
            <p className="text-lg text-slate-600 max-w-3xl mx-auto">
              A comprehensive ecosystem of AI-powered tools for modern construction
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {solutions.map((feature) => (
              <Link key={feature.title} href={feature.href} className="block h-full">
                <div className="bg-white rounded-2xl p-8 h-full border border-slate-200 hover:border-blue-300 hover:shadow-xl transition-all duration-300 group">
                  <div
                    className={`h-14 w-14 ${feature.bgColor} rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}
                  >
                    <feature.icon className={`h-7 w-7 ${feature.color}`} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                  <p className="text-slate-600 leading-relaxed mb-4 text-sm">{feature.desc}</p>
                  <span className="inline-flex items-center text-sm font-semibold text-blue-600 group-hover:gap-2 transition-all">
                    Learn More{" "}
                    <ArrowRight className="ml-1 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Partners */}
      <section className="py-24 bg-gradient-to-b from-slate-50 via-white to-slate-50 relative overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[500px] h-[500px] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none animate-pulse" />
        <div
          className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-teal-500/10 blur-[100px] rounded-full pointer-events-none animate-pulse"
          style={{ animationDelay: "1s" }}
        />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-teal-50 border border-blue-200/50 rounded-full px-5 py-2 mb-6 shadow-sm">
              <span className="h-2 w-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="text-sm font-semibold text-blue-700">Trusted Partners</span>
            </div>
            <h3 className="text-4xl font-bold text-slate-900 mb-4 tracking-tight">
              Leading the MMC Revolution
            </h3>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Join Australia&apos;s most innovative construction companies transforming the industry
              with modern methods
            </p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-12">
            {partners.map((company) => (
              <div
                key={company.name}
                className="group relative bg-white rounded-2xl p-6 border-2 border-slate-200 hover:border-transparent transition-all duration-500 flex flex-col items-center justify-center overflow-hidden hover:scale-105 hover:shadow-2xl"
              >
                <div
                  className={`absolute inset-0 bg-gradient-to-br ${company.gradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}
                />
                <div className="relative z-10">
                  <div className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-300">
                    {company.icon}
                  </div>
                  <span className="text-lg font-bold text-slate-800 group-hover:text-white transition-colors duration-300">
                    {company.name}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-8 pt-8 border-t border-slate-200">
            {[
              { metric: "100+", label: "Active Professionals", gradient: "from-blue-500 to-teal-500" },
              { metric: "50+", label: "Projects Delivered", gradient: "from-purple-500 to-pink-500" },
              { metric: "$2M+", label: "Cost Savings", gradient: "from-amber-500 to-orange-500" },
            ].map((stat, idx) => (
              <div key={stat.metric} className="flex items-center gap-3">
                {idx > 0 && <div className="h-12 w-px bg-slate-300 hidden sm:block -ml-4 mr-4" />}
                <div
                  className={`h-12 w-12 rounded-full bg-gradient-to-br ${stat.gradient} flex items-center justify-center shadow-lg`}
                >
                  <CheckCircle2 className="h-6 w-6 text-white" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-slate-900">{stat.metric}</p>
                  <p className="text-sm text-slate-600">{stat.label}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 bg-gradient-to-b from-slate-900 to-slate-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-white sm:text-4xl mb-4">
              Trusted by Modern Builders
            </h2>
            <p className="text-lg text-slate-400">
              See how industry professionals are transforming their workflows
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {testimonials.map((t) => (
              <div
                key={t.author}
                className="bg-white/5 backdrop-blur-sm border border-white/10 p-8 rounded-2xl hover:bg-white/10 transition-all"
              >
                <div className="mb-6">
                  <svg className="h-8 w-8 text-blue-400 opacity-50" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                  </svg>
                </div>
                <p className="text-slate-200 mb-6 leading-relaxed">{t.quote}</p>
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-teal-500 flex items-center justify-center text-white font-bold text-sm">
                    {t.author[0]}
                  </div>
                  <div>
                    <div className="text-white font-semibold text-sm">{t.author}</div>
                    <div className="text-xs text-slate-400">
                      {t.role}, {t.company}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
