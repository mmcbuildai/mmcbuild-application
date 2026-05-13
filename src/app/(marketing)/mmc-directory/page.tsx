import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import WaitlistForm from "@/components/marketing/waitlist-form";
import {
  ArrowRight,
  CheckCircle2,
  Users,
  Search,
  Star,
  MapPin,
  Award,
  Filter,
} from "lucide-react";

export const metadata: Metadata = {
  title: "MMC Directory — Find Your Perfect Team",
  description:
    "Connect with verified specialists in modern construction methods. From modular builders to sustainability consultants.",
};

const categories = [
  { name: "Modular Builders", count: 45 },
  { name: "CLT Specialists", count: 23 },
  { name: "Prefab Manufacturers", count: 67 },
  { name: "Sustainable Consultants", count: 34 },
  { name: "Structural Engineers", count: 89 },
  { name: "Certification Bodies", count: 12 },
];

const features = [
  {
    icon: Search,
    title: "Smart Search",
    description:
      "Find the right professionals based on specialization, location, and project requirements.",
  },
  {
    icon: Award,
    title: "Verified Profiles",
    description: "All listed professionals are verified with credentials and portfolio reviews.",
  },
  {
    icon: Star,
    title: "Reviews & Ratings",
    description: "Read authentic reviews from other construction professionals.",
  },
  {
    icon: Filter,
    title: "Advanced Filters",
    description: "Filter by specialty, location, availability, and more.",
  },
];

const previewProfessionals = [
  { name: "ModularPro Australia", type: "Modular Builder", rating: 4.9, location: "Sydney" },
  { name: "CLT Structures Co", type: "CLT Specialist", rating: 4.8, location: "Melbourne" },
  { name: "Green Build Consulting", type: "Sustainability", rating: 4.7, location: "Brisbane" },
];

export default function MMCDirectoryPage() {
  return (
    <div className="min-h-screen">
      <section className="relative bg-gradient-to-br from-amber-800 via-amber-700 to-slate-900 text-white overflow-hidden py-24">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-amber-500/20 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-amber-500/20 border border-amber-500/30 rounded-full px-4 py-1.5 mb-6">
                <Users className="h-4 w-4 text-amber-300" />
                <span className="text-sm text-amber-300 font-medium">MMC Directory</span>
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl mb-6">
                Find Your <span className="text-amber-400">Perfect</span> Team
              </h1>
              <p className="text-xl text-slate-300 mb-8">
                Connect with verified specialists in modern construction methods. From modular
                builders to sustainability consultants.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button
                  asChild
                  size="lg"
                  className="bg-white text-amber-900 hover:bg-slate-100 rounded-full px-8"
                >
                  <a href="#waitlist">
                    Join Waitlist <ArrowRight className="ml-2 h-5 w-5" />
                  </a>
                </Button>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
                <div className="flex items-center gap-3 mb-4">
                  <Search className="h-5 w-5 text-amber-300" />
                  <span className="text-sm text-slate-300">Search Professionals</span>
                </div>
                <div className="space-y-3">
                  {previewProfessionals.map((pro) => (
                    <div key={pro.name} className="bg-white/5 rounded-xl p-4">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <p className="text-white font-semibold">{pro.name}</p>
                          <p className="text-sm text-slate-400">{pro.type}</p>
                        </div>
                        <div className="flex items-center gap-1 text-amber-400">
                          <Star className="h-4 w-4 fill-current" />
                          <span className="text-sm">{pro.rating}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 text-slate-400 text-sm">
                        <MapPin className="h-3 w-3" />
                        {pro.location}
                      </div>
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
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Browse by Category</h2>
            <p className="text-xl text-slate-600">
              Find specialists in every area of modern construction
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((cat) => (
              <div
                key={cat.name}
                className="bg-slate-50 rounded-2xl p-6 flex items-center justify-between hover:bg-amber-50 hover:border-amber-200 border border-transparent transition-all cursor-pointer"
              >
                <span className="text-lg font-semibold text-slate-900">{cat.name}</span>
                <span className="bg-amber-100 text-amber-700 text-sm font-medium px-3 py-1 rounded-full">
                  {cat.count} listed
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Directory Features</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Everything you need to find and connect with the right professionals.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-white rounded-2xl p-8 border border-slate-200 hover:shadow-lg transition-shadow"
              >
                <div className="h-12 w-12 bg-amber-100 rounded-xl flex items-center justify-center mb-6">
                  <feature.icon className="h-6 w-6 text-amber-600" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                <p className="text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>

          <div className="mt-12 text-center">
            <p className="text-slate-700 text-xl">
              If you are a Trade, Builder, Consultant or Supplier and would like to be in our
              directory, please{" "}
              <Link
                href="/contact?subject=Partnership%20Opportunity"
                className="text-amber-600 hover:text-amber-700 font-semibold underline"
              >
                click here
              </Link>
              .
            </p>
          </div>
        </div>
      </section>

      <section id="waitlist" className="py-24 bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="text-white">
              <h2 className="text-3xl font-bold mb-6">Get Early Access to MMC Directory</h2>
              <p className="text-lg text-slate-300 mb-8">
                Join our network of modern construction professionals.
              </p>
              <ul className="space-y-4">
                {[
                  "Access verified professionals",
                  "Post and find projects",
                  "Build your network",
                  "List your own business",
                ].map((item) => (
                  <li key={item} className="flex items-center text-slate-200">
                    <CheckCircle2 className="h-5 w-5 text-amber-400 mr-3" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <WaitlistForm defaultInterest="directory" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
