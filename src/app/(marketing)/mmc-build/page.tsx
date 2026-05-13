import type { Metadata } from "next";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import WaitlistForm from "@/components/marketing/waitlist-form";
import { ArrowRight, CheckCircle2, Hammer } from "lucide-react";

export const metadata: Metadata = {
  title: "MMC Build — Explore Modern Construction Technologies & Methods",
  description:
    "Discover the latest in Modern Methods of Construction. Access AI-powered design library, prefabrication solutions, and innovative building technologies.",
};

const technologies = [
  { name: "Cross Laminated Timber (CLT)", category: "Structural", savings: "30% faster" },
  { name: "Prefabricated Panels", category: "Wall Systems", savings: "40% waste reduction" },
  { name: "Insulated Concrete Forms", category: "Foundations", savings: "50% energy savings" },
  { name: "Modular Bathroom Pods", category: "Wet Areas", savings: "60% time savings" },
  { name: "Green Roof Systems", category: "Roofing", savings: "25% cooling costs" },
  { name: "Aerogel Insulation", category: "Thermal", savings: "3x R-value" },
];

const KIT_OF_PARTS_IMAGE =
  "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/695a6292259ab924ff961e1d/fecc6f54e_image.png";

export default function MMCBuildPage() {
  return (
    <div className="min-h-screen">
      <section className="relative bg-gradient-to-br from-teal-900 via-teal-800 to-slate-900 text-white overflow-hidden py-24">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-teal-500/20 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-teal-500/20 border border-teal-500/30 rounded-full px-4 py-1.5 mb-6">
                <Hammer className="h-4 w-4 text-teal-300" />
                <span className="text-sm text-teal-300 font-medium">MMC Build</span>
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl mb-6">
                Build <span className="text-teal-400">Smarter</span>, Not Harder
              </h1>
              <p className="text-xl text-slate-300 mb-8">
                Access cutting-edge construction technologies and receive intelligent alternative
                suggestions for materials and methods.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  asChild
                  size="lg"
                  className="bg-white text-teal-900 hover:bg-slate-100 rounded-full px-8"
                >
                  <a href="#waitlist">
                    Join Waitlist <ArrowRight className="ml-2 h-5 w-5" />
                  </a>
                </Button>
              </div>
            </div>
            <div className="relative hidden lg:block" />
          </div>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <h2 className="text-3xl font-bold text-slate-900 mb-6">Kit of Parts</h2>
              <p className="text-lg text-slate-600 mb-6">
                MMC Build in collaboration with Monash University are using the System 600
                catalogue called the Kit of Parts. This is a collection of pre-manufactured
                components that can be assembled onsite to create a complete structure. These
                parts will be the basis for our library that the AI will use to design the
                alternate MMC solution.
              </p>
            </div>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={KIT_OF_PARTS_IMAGE}
                alt="Kit of Parts - System 600"
                className="w-full rounded-2xl shadow-xl"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Featured Technologies</h2>
            <p className="text-xl text-slate-600">
              Explore our database of modern construction solutions
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {technologies.map((tech) => (
              <div
                key={tech.name}
                className="bg-white rounded-2xl p-6 border border-slate-200 hover:border-teal-300 hover:shadow-lg transition-all"
              >
                <div className="flex justify-between items-start mb-4">
                  <span className="bg-teal-100 text-teal-700 text-xs font-medium px-3 py-1 rounded-full">
                    {tech.category}
                  </span>
                  <span className="text-teal-600 font-semibold text-sm">{tech.savings}</span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">{tech.name}</h3>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="waitlist" className="py-24 bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="text-white">
              <h2 className="text-3xl font-bold mb-6">Get Early Access to MMC Build</h2>
              <p className="text-lg text-slate-300 mb-8">
                Be the first to explore our comprehensive database of modern construction
                technologies.
              </p>
              <ul className="space-y-4">
                {[
                  "Full technology database access",
                  "AI-powered alternative suggestions",
                  "Cost comparison tools",
                  "Sustainability reporting",
                ].map((item) => (
                  <li key={item} className="flex items-center text-slate-200">
                    <CheckCircle2 className="h-5 w-5 text-teal-400 mr-3" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <WaitlistForm defaultInterest="build" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
