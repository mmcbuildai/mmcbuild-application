import type { Metadata } from "next";
import Link from "next/link";
import { FileCheck, Hammer, Calendar, Clock, ArrowRight } from "lucide-react";

export const metadata: Metadata = {
  title: "Construction Intelligence Hub — MMC Build Blog",
  description:
    "Expert perspectives on compliance, modern construction methods, and industry innovation. Learn about NCC compliance and Modern Methods of Construction.",
  keywords: [
    "construction blog",
    "NCC compliance",
    "MMC",
    "modern construction",
    "building compliance Australia",
  ],
};

const posts = [
  {
    id: 1,
    category: "Compliance",
    icon: FileCheck,
    title: "Why NCC Compliance Matters: Protecting Your Investment",
    excerpt:
      "Understanding the National Construction Code isn't just about ticking boxes—it's about ensuring safety, quality, and long-term value in every project. Learn why compliance is your project's foundation.",
    author: "MMC Build Team",
    date: "January 10, 2026",
    readTime: "5 min read",
    image:
      "https://images.unsplash.com/photo-1589939705384-5185137a7f0f?w=800&auto=format&fit=crop&q=60",
    accent: "bg-blue-600",
  },
  {
    id: 2,
    category: "Compliance",
    icon: FileCheck,
    title: "The Hidden Costs of Non-Compliance: What Every Builder Needs to Know",
    excerpt:
      "Failing to meet NCC requirements can lead to expensive rework, project delays, and legal liability. Discover the real cost of cutting corners and how automated compliance checking saves time and money.",
    author: "MMC Build Team",
    date: "January 8, 2026",
    readTime: "6 min read",
    image:
      "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=800&auto=format&fit=crop&q=60",
    accent: "bg-blue-600",
  },
  {
    id: 3,
    category: "MMC Build",
    icon: Hammer,
    title: "Modern Methods of Construction: Building Faster Without Compromise",
    excerpt:
      "Prefabrication, modular systems, and innovative materials are transforming Australian construction. Explore how MMC delivers speed, sustainability, and superior quality in residential and commercial projects.",
    author: "MMC Build Team",
    date: "January 5, 2026",
    readTime: "7 min read",
    image:
      "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?w=800&auto=format&fit=crop&q=60",
    accent: "bg-brand-600",
  },
  {
    id: 4,
    category: "MMC Build",
    icon: Hammer,
    title: "CLT and Engineered Timber: The Future of Sustainable Construction",
    excerpt:
      "Cross-Laminated Timber is revolutionising how we build—offering strength, speed, and environmental benefits. Learn why architects and builders are embracing engineered timber for modern Australian projects.",
    author: "MMC Build Team",
    date: "January 3, 2026",
    readTime: "8 min read",
    image:
      "https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&auto=format&fit=crop&q=60",
    accent: "bg-brand-600",
  },
];

export default function BlogPage() {
  return (
    <>
      <section className="relative bg-[#0f172a] text-white overflow-hidden py-16">
        <div className="absolute top-0 left-1/2 w-[800px] h-[400px] -translate-x-1/2 bg-blue-600/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center z-10">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl mb-6">
            Construction Intelligence Hub
          </h1>
          <p className="mx-auto max-w-2xl text-xl text-slate-300">
            Expert perspectives on compliance, modern construction methods, and industry innovation.
          </p>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-8">
            {posts.map((post) => (
              <article
                key={post.id}
                className="group bg-white rounded-3xl border border-slate-200 overflow-hidden hover:shadow-2xl transition-all duration-300"
              >
                <div className="relative h-64 overflow-hidden">
                  <img
                    src={post.image}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div
                    className={`absolute top-4 left-4 inline-flex items-center gap-2 ${post.accent} text-white text-xs font-medium px-3 py-1.5 rounded-full`}
                  >
                    <post.icon className="h-3 w-3" />
                    {post.category}
                  </div>
                </div>
                <div className="p-8">
                  <div className="flex items-center gap-4 text-sm text-slate-500 mb-4">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {post.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {post.readTime}
                    </span>
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900 mb-3 group-hover:text-blue-600 transition-colors">
                    {post.title}
                  </h2>
                  <p className="text-slate-600 mb-6 leading-relaxed">{post.excerpt}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">{post.author}</span>
                    <span className="inline-flex items-center text-sm font-semibold text-blue-600">
                      Coming soon <ArrowRight className="ml-1 h-4 w-4" />
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-slate-50">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-slate-900 mb-6">Stay Updated with MMC Insights</h2>
          <p className="text-xl text-slate-600 mb-8">
            Subscribe via our contact form to receive the latest articles on construction compliance and modern building methods.
          </p>
          <Link
            href="/contact"
            className="inline-flex items-center rounded-full bg-blue-600 hover:bg-blue-700 text-white px-8 h-12 font-medium transition-colors"
          >
            Subscribe <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </div>
      </section>
    </>
  );
}
