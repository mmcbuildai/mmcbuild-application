import Image from "next/image";
import Link from "next/link";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <nav className="sticky top-0 z-50 border-b bg-white/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-900">
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
          <div className="hidden md:flex items-center gap-8 text-sm">
            <Link href="/about" className="text-slate-600 hover:text-slate-900 transition-colors">
              About
            </Link>
            <Link href="/blog" className="text-slate-600 hover:text-slate-900 transition-colors">
              Blog
            </Link>
            <Link href="/case-studies" className="text-slate-600 hover:text-slate-900 transition-colors">
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
              <p className="text-sm font-semibold text-white mb-3">Product</p>
              <ul className="space-y-2 text-sm">
                <li><Link href="/" className="hover:text-white transition-colors">Platform</Link></li>
                <li><Link href="/case-studies" className="hover:text-white transition-colors">Case Studies</Link></li>
                <li><Link href="/blog" className="hover:text-white transition-colors">Blog</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-3">Company</p>
              <ul className="space-y-2 text-sm">
                <li><Link href="/about" className="hover:text-white transition-colors">About</Link></li>
                <li><Link href="/contact" className="hover:text-white transition-colors">Contact</Link></li>
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-3">Legal</p>
              <ul className="space-y-2 text-sm">
                <li><Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-white transition-colors">Terms of Use</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-8 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
            <p>&copy; {new Date().getFullYear()} MMC Build Pty Ltd. All rights reserved.</p>
            <p>ABN: 99 691 530 426</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
