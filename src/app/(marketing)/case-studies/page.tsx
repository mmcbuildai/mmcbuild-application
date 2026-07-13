import type { Metadata } from "next";
import Link from "next/link";
import {
  Building2,
  Clock,
  DollarSign,
  Leaf,
  TrendingDown,
  CheckCircle2,
  ArrowRight,
  Quote,
  Star,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Case Studies & Success Stories — MMC Build",
  description:
    "Real projects, real results. See how MMC Build is transforming construction across Australia — Morpeth Gardens Country Club, 44 Hugh Street Residence, and more.",
};

const projects = [
  {
    id: 1,
    title: "Morpeth Gardens Country Club",
    location: "39 Metford Road, Tenambit NSW",
    category: "Commercial",
    image:
      "https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=800&auto=format&fit=crop&q=60",
    status: "Completed",
    year: "2024",
    buildingClass: "Class 9B Assembly Building",
    metrics: {
      buildTime: "8 months",
      buildTimeSaved: "35%",
      costSavings: "18%",
      energyReduction: "23%",
      carbonReduction: "12.3%",
    },
    highlights: [
      "J1V3 Performance Solution for energy efficiency",
      "Reduced GHG emissions by 3,249 kgCO2-e annually",
      "Advanced building fabric thermal performance",
      "Integrated modern construction methods",
    ],
    description:
      "A state-of-the-art country club facility utilising modern methods of construction and AI-powered compliance verification. The project achieved exceptional energy efficiency ratings through the J1V3 performance solution method.",
    testimonial: {
      text: "The MMC Comply system revolutionised our approval process. What typically takes weeks was done in days, with complete confidence in NCC compliance.",
      author: "Project Manager",
      company: "Urban Dwell Constructions",
      rating: 5,
    },
  },
  {
    id: 2,
    title: "44 Hugh Street Residence",
    location: "Belmore, NSW",
    category: "Residential",
    image:
      "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&auto=format&fit=crop&q=60",
    status: "Completed",
    year: "2024",
    buildingClass: "Class 1 Dwelling",
    metrics: {
      buildTime: "4 months",
      buildTimeSaved: "40%",
      costSavings: "22%",
      energyReduction: "35%",
      carbonReduction: "18.5%",
    },
    highlights: [
      "Modular construction methodology",
      "Enhanced thermal envelope performance",
      "Prefabricated components for faster assembly",
      "Superior acoustic and fire ratings",
    ],
    description:
      "A modern residential development showcasing the benefits of prefabrication and modular construction. The project demonstrates significant time and cost savings while exceeding energy efficiency standards.",
    testimonial: {
      text: "The speed and quality of MMC Build methodology exceeded our expectations. We moved in 40% faster than traditional builds with better energy performance.",
      author: "Homeowner",
      company: "Private Client",
      rating: 5,
    },
  },
];

export default function CaseStudiesPage() {
  return (
    <>
      <section className="relative bg-[#0f172a] text-white overflow-hidden py-24">
        <div className="absolute top-0 left-1/2 w-[800px] h-[400px] -translate-x-1/2 bg-blue-600/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center z-10">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl mb-6">
            Case Studies & Success Stories
          </h1>
          <p className="mx-auto max-w-2xl text-xl text-slate-300">
            Real projects, real results. See how MMC Build is transforming construction across Australia.
          </p>
        </div>
      </section>

      <section className="py-24 bg-white space-y-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-16">
          {projects.map((p) => (
            <article
              key={p.id}
              className="rounded-3xl border border-slate-200 overflow-hidden shadow-sm"
            >
              <div className="relative h-64 sm:h-80 overflow-hidden">
                <img src={p.image} alt={p.title} className="w-full h-full object-cover" />
                <div className="absolute top-4 left-4 flex gap-2">
                  <span className="bg-blue-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                    {p.category}
                  </span>
                  <span className="bg-green-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                    {p.status}
                  </span>
                </div>
              </div>

              <div className="p-8 md:p-12">
                <h2 className="text-3xl font-bold text-slate-900 mb-2">{p.title}</h2>
                <p className="text-slate-600 mb-2">{p.location}</p>
                <div className="flex items-center gap-4 text-sm text-slate-500 mb-6">
                  <span className="flex items-center gap-1">
                    <Building2 className="h-4 w-4" />
                    {p.buildingClass}
                  </span>
                  <span>• {p.year}</span>
                </div>

                <p className="text-slate-700 leading-relaxed mb-8 max-w-3xl">{p.description}</p>

                <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-4 mb-10">
                  <Metric icon={Clock} label="Build Time" value={p.metrics.buildTime} tone="blue" />
                  <Metric
                    icon={TrendingDown}
                    label="Time Saved"
                    value={p.metrics.buildTimeSaved}
                    tone="indigo"
                  />
                  <Metric
                    icon={DollarSign}
                    label="Cost Savings"
                    value={p.metrics.costSavings}
                    tone="green"
                  />
                  <Metric
                    icon={Leaf}
                    label="Energy Reduction"
                    value={p.metrics.energyReduction}
                    tone="teal"
                  />
                  <Metric
                    icon={CheckCircle2}
                    label="Carbon Reduction"
                    value={p.metrics.carbonReduction}
                    tone="purple"
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-8 items-start">
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-4">Project Highlights</h3>
                    <ul className="space-y-3">
                      {p.highlights.map((h) => (
                        <li key={h} className="flex items-start gap-3">
                          <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
                          <span className="text-slate-700">{h}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6">
                    <Quote className="h-8 w-8 text-blue-600 mb-3" />
                    <p className="text-slate-700 mb-4 italic leading-relaxed">
                      &ldquo;{p.testimonial.text}&rdquo;
                    </p>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-semibold text-slate-900">{p.testimonial.author}</p>
                        <p className="text-sm text-slate-600">{p.testimonial.company}</p>
                      </div>
                      <div className="flex gap-1">
                        {Array.from({ length: p.testimonial.rating }).map((_, i) => (
                          <Star key={i} className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="py-24 bg-slate-900">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-6">Ready to Start Your Success Story?</h2>
          <p className="text-xl text-slate-300 mb-8">
            Join the construction revolution. Get early access to MMC Build&apos;s AI-powered platform.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center rounded-full bg-blue-600 hover:bg-blue-500 text-white px-10 h-12 text-base font-medium transition-colors"
          >
            Join Waitlist <ArrowRight className="ml-2 h-5 w-5" />
          </Link>
        </div>
      </section>
    </>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone: "blue" | "indigo" | "green" | "teal" | "purple";
}) {
  const bg = {
    blue: "bg-blue-50 text-blue-600",
    indigo: "bg-indigo-50 text-indigo-600",
    green: "bg-green-50 text-green-600",
    teal: "bg-brand-50 text-brand-600",
    purple: "bg-purple-50 text-purple-600",
  }[tone];
  return (
    <div className="bg-white rounded-xl p-4 border border-slate-200">
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-lg ${bg} mb-3`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
      <p className="text-sm text-slate-600">{label}</p>
    </div>
  );
}
