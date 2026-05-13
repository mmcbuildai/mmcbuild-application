import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import WaitlistForm from "@/components/marketing/waitlist-form";
import {
  ArrowRight,
  CheckCircle2,
  GraduationCap,
  PlayCircle,
  Award,
  BookOpen,
  Users,
} from "lucide-react";

export const metadata: Metadata = {
  title: "MMC Train — Master Modern Construction",
  description:
    "Comprehensive training programs and certifications for the next generation of construction professionals.",
};

const features = [
  {
    icon: PlayCircle,
    title: "Video Lessons",
    description: "High-quality video content from industry experts and practitioners.",
  },
  {
    icon: Award,
    title: "Certifications",
    description: "Industry-recognized certifications upon course completion.",
  },
  {
    icon: BookOpen,
    title: "Resources",
    description: "Downloadable guides, templates, and reference materials.",
  },
  {
    icon: Users,
    title: "Community",
    description: "Connect with fellow professionals and share knowledge.",
  },
];

const learningPath = [
  { name: "MMC Fundamentals", progress: 100, status: "Completed" },
  { name: "CLT Specialist", progress: 65, status: "In Progress" },
  { name: "Prefab Certification", progress: 0, status: "Upcoming" },
];

const tiers = [
  {
    badge: "Beginners",
    badgeBg: "bg-green-100",
    badgeText: "text-green-700",
    title: "New to MMC",
    description:
      "Start your journey with foundational courses covering modern construction methods and their practical applications.",
    items: ["Introduction to MMC fundamentals", "NCC compliance basics for all levels"],
    checkColor: "text-green-600",
  },
  {
    badge: "Intermediate",
    badgeBg: "bg-amber-100",
    badgeText: "text-amber-700",
    title: "Expanding Skills",
    description:
      "Deepen your expertise with specialized training in advanced construction technologies and sustainable building practices.",
    items: ["CLT design and construction techniques", "Sustainable building methods and standards"],
    checkColor: "text-amber-600",
  },
  {
    badge: "Advanced",
    badgeBg: "bg-red-100",
    badgeText: "text-red-700",
    title: "Industry Leaders",
    description:
      "Master complex project management and cutting-edge assembly techniques to lead large-scale MMC projects.",
    items: ["Prefab project management mastery", "Advanced modular assembly techniques"],
    checkColor: "text-red-600",
  },
];

export default function MMCTrainPage() {
  return (
    <div className="min-h-screen">
      <section className="relative bg-gradient-to-br from-indigo-900 via-indigo-800 to-slate-900 text-white overflow-hidden py-24">
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-indigo-500/20 blur-[100px] rounded-full pointer-events-none" />

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-indigo-500/20 border border-indigo-500/30 rounded-full px-4 py-1.5 mb-6">
                <GraduationCap className="h-4 w-4 text-indigo-300" />
                <span className="text-sm text-indigo-300 font-medium">MMC Train</span>
              </div>
              <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl mb-6">
                Master <span className="text-indigo-400">Modern</span> Construction
              </h1>
              <p className="text-xl text-slate-300 mb-8">
                Comprehensive training programs and certifications for the next generation of
                construction professionals.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Button asChild size="lg" className="bg-white text-indigo-900 hover:bg-slate-100 rounded-full px-8">
                  <a href="#waitlist">
                    Join Waitlist <ArrowRight className="ml-2 h-5 w-5" />
                  </a>
                </Button>
              </div>
            </div>
            <div className="relative hidden lg:block">
              <div className="bg-white/10 backdrop-blur-lg rounded-3xl p-6 border border-white/20">
                <div className="flex items-center gap-3 mb-6">
                  <GraduationCap className="h-5 w-5 text-indigo-300" />
                  <span className="text-sm text-slate-300">Your Learning Path</span>
                </div>
                <div className="space-y-3">
                  {learningPath.map((course) => (
                    <div key={course.name} className="bg-white/5 rounded-xl p-4">
                      <div className="flex justify-between items-center mb-2">
                        <p className="text-white font-medium">{course.name}</p>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            course.status === "Completed"
                              ? "bg-green-500/20 text-green-300"
                              : course.status === "In Progress"
                                ? "bg-indigo-500/20 text-indigo-300"
                                : "bg-slate-500/20 text-slate-400"
                          }`}
                        >
                          {course.status}
                        </span>
                      </div>
                      <div className="w-full bg-white/10 rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all"
                          style={{ width: `${course.progress}%` }}
                        />
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
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Learning Experience</h2>
            <p className="text-xl text-slate-600 max-w-2xl mx-auto">
              Industry-leading training designed for construction professionals.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="bg-slate-50 rounded-2xl p-8 hover:shadow-lg transition-shadow"
              >
                <div className="h-12 w-12 bg-indigo-100 rounded-xl flex items-center justify-center mb-6">
                  <feature.icon className="h-6 w-6 text-indigo-600" />
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
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Who Should Join MMC Train?</h2>
            <p className="text-xl text-slate-600 max-w-3xl mx-auto">
              Whether you&apos;re just starting out or advancing your expertise, MMC Train offers
              tailored learning paths for construction professionals at every stage.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {tiers.map((tier) => (
              <div key={tier.badge} className="bg-white rounded-2xl p-8 border border-slate-200">
                <div
                  className={`inline-flex items-center gap-2 ${tier.badgeBg} ${tier.badgeText} text-xs font-medium px-3 py-1 rounded-full mb-4`}
                >
                  {tier.badge}
                </div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{tier.title}</h3>
                <p className="text-slate-600 mb-4">{tier.description}</p>
                <ul className="space-y-2 text-sm text-slate-600">
                  {tier.items.map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className={`h-4 w-4 ${tier.checkColor} mt-0.5 flex-shrink-0`} />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="waitlist" className="py-24 bg-slate-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div className="text-white">
              <h2 className="text-3xl font-bold mb-6">Get Early Access to MMC Train</h2>
              <p className="text-lg text-slate-300 mb-8">
                Be first to access our comprehensive training platform.
              </p>
              <ul className="space-y-4">
                {["Full course library access", "Industry certifications", "Expert-led training", "Community forums"].map(
                  (item) => (
                    <li key={item} className="flex items-center text-slate-200">
                      <CheckCircle2 className="h-5 w-5 text-indigo-400 mr-3" />
                      {item}
                    </li>
                  )
                )}
              </ul>
            </div>
            <div>
              <WaitlistForm defaultInterest="train" />
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
