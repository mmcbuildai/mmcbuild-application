import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InviteSessionRedirect } from "./invite-session-redirect";
import { ArrowRight, Hammer, FileCheck, Users, GraduationCap, Bot } from "lucide-react";

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
    color: "text-brand-600",
    bgColor: "bg-brand-50",
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
      {/* Catch invite "Accept invitation" links that land here with the session
          in the URL fragment, and forward the invitee into the app. */}
      <InviteSessionRedirect />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
      />

      {/* Hero */}
      <section className="relative bg-[#0f172a] text-white overflow-hidden">
        <div className="absolute top-0 left-1/2 w-[1000px] h-[500px] -translate-x-1/2 bg-blue-600/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute bottom-0 right-0 w-[800px] h-[600px] bg-brand-600/10 blur-[120px] rounded-full pointer-events-none" />

        <div className="relative z-10 mx-auto flex max-w-7xl flex-col items-center px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8 lg:py-32">
          <div className="mb-6 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-300 backdrop-blur-sm sm:mb-8">
            <span className="mr-2 flex h-2 w-2 animate-pulse rounded-full bg-blue-400" />
            The Future of Building is Here
          </div>
          <h1 className="mb-6 max-w-5xl text-3xl font-extrabold leading-tight tracking-tight text-white sm:mb-8 sm:text-5xl lg:text-7xl">
            Modern Methods of Construction Ecosystem{" "}
            <span className="block bg-gradient-to-r from-blue-400 to-brand-400 bg-clip-text text-transparent">
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

    </div>
  );
}
