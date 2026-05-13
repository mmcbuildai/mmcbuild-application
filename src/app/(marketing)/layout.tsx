import Image from "next/image";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import Chatbot from "@/components/marketing/chatbot";

const solutions = [
  { name: "MMC Comply", href: "/mmc-comply", description: "AI-powered NCC compliance" },
  { name: "MMC Build", href: "/mmc-build", description: "Modern construction technologies" },
  { name: "MMC Quote", href: "/mmc-quote", description: "Intelligent quoting & estimation" },
  { name: "MMC Directory", href: "/mmc-directory", description: "Verified trades & suppliers" },
  { name: "MMC Train", href: "/mmc-train", description: "Industry training & certification" },
];

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900"
          >
            <Image
              src="/mmcbuildlogo.png"
              alt="MMC Build"
              width={36}
              height={36}
              className="h-9 w-9 rounded-md"
              priority
            />
            MMC Build
          </Link>
          <div className="hidden md:flex items-center gap-6 text-sm">
            <div className="relative group">
              <Link
                href="/products"
                className="flex items-center gap-1 text-slate-600 hover:text-slate-900 transition-colors"
              >
                Solutions
                <ChevronDown className="h-4 w-4" />
              </Link>
              <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-100 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                <div className="p-2">
                  {solutions.map((solution) => (
                    <Link
                      key={solution.name}
                      href={solution.href}
                      className="block px-4 py-3 rounded-lg hover:bg-slate-50 transition-colors"
                    >
                      <div className="font-semibold text-slate-900">{solution.name}</div>
                      <div className="text-sm text-slate-500">{solution.description}</div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <Link href="/pricing" className="text-slate-600 hover:text-slate-900 transition-colors">
              Pricing
            </Link>
            <Link
              href="/mmc-suppliers"
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              Trades &amp; Suppliers
            </Link>
            <Link href="/blog" className="text-slate-600 hover:text-slate-900 transition-colors">
              Blog
            </Link>
            <Link href="/about" className="text-slate-600 hover:text-slate-900 transition-colors">
              About
            </Link>
            <Link
              href="/case-studies"
              className="text-slate-600 hover:text-slate-900 transition-colors"
            >
              Case Studies
            </Link>
            <Link href="/contact" className="text-slate-600 hover:text-slate-900 transition-colors">
              Contact
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login" className="text-sm text-slate-600 hover:text-slate-900 transition-colors">
              Sign In
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white shadow hover:bg-blue-700 transition-colors"
            >
              Get Started
            </Link>
          </div>
        </div>
      </nav>

      <main className="flex-1">{children}</main>

      <footer className="border-t bg-slate-900 text-slate-300">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid gap-8 md:grid-cols-4">
            <div>
              <div className="flex items-center gap-2.5 mb-3">
                <Image
                  src="/mmcbuildlogo.png"
                  alt="MMC Build"
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-md"
                />
                <p className="text-lg font-bold text-white">MMC Build</p>
              </div>
              <p className="text-sm">
                AI-powered Modern Methods of Construction platform for Australia.
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-3">Solutions</p>
              <ul className="space-y-2 text-sm">
                {solutions.map((s) => (
                  <li key={s.name}>
                    <Link href={s.href} className="hover:text-white transition-colors">
                      {s.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-3">Company</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/pricing" className="hover:text-white transition-colors">
                    Pricing
                  </Link>
                </li>
                <li>
                  <Link href="/mmc-suppliers" className="hover:text-white transition-colors">
                    Trades &amp; Suppliers
                  </Link>
                </li>
                <li>
                  <Link href="/blog" className="hover:text-white transition-colors">
                    Blog
                  </Link>
                </li>
                <li>
                  <Link href="/case-studies" className="hover:text-white transition-colors">
                    Case Studies
                  </Link>
                </li>
                <li>
                  <Link href="/about" className="hover:text-white transition-colors">
                    About
                  </Link>
                </li>
                <li>
                  <Link href="/contact" className="hover:text-white transition-colors">
                    Contact
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-3">Legal</p>
              <ul className="space-y-2 text-sm">
                <li>
                  <Link href="/privacy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link href="/terms" className="hover:text-white transition-colors">
                    Terms of Use
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
            <p>&copy; {new Date().getFullYear()} MMC Build Pty Ltd. All rights reserved.</p>
            <p>ABN: 99 691 530 426</p>
          </div>
        </div>
      </footer>
      <Chatbot />
    </div>
  );
}
