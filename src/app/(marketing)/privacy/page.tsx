import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — MMC Build",
  description:
    "Learn how MMC Build protects your privacy. Read our comprehensive privacy policy covering data collection, usage, security, and your rights.",
};

export default function PrivacyPage() {
  return (
    <>
      <section className="relative bg-[#0f172a] text-white overflow-hidden py-24">
        <div className="absolute top-0 left-1/2 w-[800px] h-[400px] -translate-x-1/2 bg-blue-600/20 blur-[100px] rounded-full pointer-events-none" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 text-center z-10">
          <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl lg:text-6xl mb-6">
            Privacy Policy
          </h1>
          <p className="mx-auto max-w-2xl text-xl text-slate-300">
            Last updated: 18 August 2026
          </p>
        </div>
      </section>

      <section className="py-24 bg-white">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="prose prose-lg prose-slate max-w-none">
            <h2>1. Introduction</h2>
            <p>
              MMC Build Pty Ltd (&quot;MMC Build&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;) is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our services.
            </p>

            <h2>2. Information We Collect</h2>
            <p>We collect information that you provide directly to us, including:</p>
            <ul>
              <li>Name and contact information</li>
              <li>Company and job title</li>
              <li>Account credentials</li>
              <li>Payment information</li>
              <li>Communications with us</li>
            </ul>

            <h2>3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul>
              <li>Provide, maintain, and improve our services</li>
              <li>Process transactions and send related information</li>
              <li>Send promotional communications (with your consent)</li>
              <li>Respond to your comments and questions</li>
              <li>Analyse usage patterns and trends</li>
            </ul>

            <h2>4. Information Sharing</h2>
            <p>
              We do not sell or trade your personal information. We share it only with the service providers listed below, who process it on our behalf so that the platform can operate, and otherwise only where required by law.
            </p>
            <ul>
              <li><strong>Supabase</strong> — database, user accounts and file storage, including the plans and documents you upload.</li>
              <li><strong>Vercel</strong> — hosting for our website and application.</li>
              <li><strong>Stripe</strong> — subscription payments and card details. We never store your full card number ourselves.</li>
              <li><strong>HubSpot</strong> — our customer relationship system. It holds enquiry and sign-up records, and records how you arrived at our website.</li>
              <li><strong>Google Analytics</strong> (operated by Google) — records how visitors use our website, including which pages are viewed and which advertisement or campaign referred you, so we can measure and improve our Google Ads campaigns.</li>
              <li><strong>Resend</strong> — sending account, billing and notification emails.</li>
              <li><strong>Anthropic</strong> and <strong>OpenAI</strong> — the artificial intelligence services that analyse uploaded plans and documents to produce your compliance, design and cost results.</li>
              <li><strong>CloudConvert</strong> — converting uploaded CAD and plan files into formats the platform can read.</li>
              <li><strong>Inngest</strong> — running those analyses in the background after you upload a file.</li>
              <li><strong>Sentry</strong> — recording technical errors so that faults can be diagnosed and fixed.</li>
            </ul>
            <p>
              Several of these providers operate outside Australia, including in the United States and Europe. Where that is the case, your information is stored and processed overseas, and is subject to the laws of the country in which it is held. By using the platform you consent to that transfer.
            </p>
            <p>
              We do not send your uploaded plans, documents or account details to any provider other than those listed above.
            </p>

            <h2>5. Data Security</h2>
            <p>
              We implement appropriate technical and organisational measures to protect your personal information against unauthorised access, alteration, disclosure, or destruction.
            </p>

            <h2>6. Your Rights</h2>
            <p>You have the right to:</p>
            <ul>
              <li>Access your personal information</li>
              <li>Correct inaccurate data</li>
              <li>Request deletion of your data</li>
              <li>Object to processing</li>
              <li>Data portability</li>
            </ul>

            <h2>7. Cookies</h2>
            <p>
              We use cookies and similar technologies. Some are strictly necessary — they keep you signed in and keep the platform secure, and it cannot work without them.
            </p>
            <p>
              We also use non-essential analytics and marketing cookies. In particular, HubSpot sets a visitor cookie that records how you arrived at our website, including which advertisement or campaign referred you, and links that to any enquiry or sign-up you later submit. That information is held by HubSpot in the United States. We use it to understand which of our campaigns are effective.
            </p>
            <p>
              We also use Google Analytics, which sets a similar cookie to recognise you as a returning visitor across page views and visits. This lets us see which pages you view and, where you arrived via a Google advertisement, links that visit to the campaign that referred you and to any subsequent enquiry, sign-up or purchase — so we can measure and improve the performance of our Google Ads campaigns. That information is held by Google in the United States.
            </p>
            <p>
              You can instruct your browser to refuse all cookies or to tell you when one is being set. If you refuse non-essential cookies the platform will still work — we simply will not know which campaign brought you to us.
            </p>

            <h2>8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the &quot;Last updated&quot; date.
            </p>

            <h2>9. Contact Us</h2>
            <p>If you have any questions about this Privacy Policy, please contact us at:</p>
            <p>
              <strong>Email:</strong> admin@mmcbuild.com.au
              <br />
              <strong>Location:</strong> New South Wales, Australia
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
