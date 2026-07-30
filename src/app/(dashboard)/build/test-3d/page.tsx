import { notFound } from "next/navigation";
import { Test3DHarness } from "@/components/build/test-3d-harness";
import { is3dRenderingEnabled } from "@/lib/build/render-3d";

export const metadata = {
  title: "3D Extractor Test Harness",
};

// Full-house orchestrator can make up to 1 classification + 1 floor plan +
// 4 elevations + 1 section + 1 schedule = 8 Sonnet calls (with extended
// thinking on the heavy ones). Allow 5 min so the server action doesn't
// time out before all pages are extracted.
export const maxDuration = 300;

export default function Test3DPage() {
  // This harness renders the raw extractor output in 3D and carries no operator
  // gate of its own — any signed-in user who guesses the URL reaches it. With 3D
  // switched off for Go Live 1, that is exactly the render we are hiding, so the
  // route 404s rather than leaving a back door to it.
  if (!is3dRenderingEnabled()) notFound();

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">3D Extractor Test Harness</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Dev tool. Upload a plan (PDF / PNG / JPG), see the spatial extractor
          result rendered in 3D. Skips project, paywall, and Inngest. One AI
          call per click (Sonnet vision; Haiku page classifier if PDF
          auto-detect runs).
        </p>
      </div>

      <div className="rounded-lg border bg-white px-4 py-3 text-sm">
        <p className="font-medium">Supported file types</p>
        <ul className="mt-2 space-y-1.5 text-zinc-700 list-disc pl-5">
          <li>
            <strong>PDF</strong> &mdash; sent directly to Claude via the
            Anthropic <code>document</code> content type. Claude reads the
            multi-page PDF natively, finds the floor plan page, and extracts
            the spatial layout in one call. Max 32&nbsp;MB raw / 100 pages.
          </li>
          <li>
            <strong>PNG, JPG</strong> &mdash; direct to Vision (image content
            type).
          </li>
          <li>
            <strong>RVT, SKP, DOC, DOCX, DWG</strong> &mdash; converted to PDF
            via CloudConvert (~$0.01&ndash;0.02 per file, ~30s&ndash;3 min
            depending on size), then same native-PDF path as PDF above.
          </li>
          <li>
            <strong>WebP</strong> &mdash; not currently supported (extractor
            media-type mismatch). Convert to PNG/JPG first.
          </li>
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          Uploads go to Supabase Storage first (bucket{" "}
          <code>plan-uploads</code>, path{" "}
          <code>&lt;org_id&gt;/test-3d/&hellip;</code>), then the Server Action
          downloads from storage. This bypasses the Vercel function 4.5&nbsp;MB
          request-body limit. Hard cap: 50&nbsp;MB to match production.
        </p>
      </div>

      <details className="rounded-lg border bg-zinc-50 px-4 py-3 text-sm">
        <summary className="cursor-pointer font-medium">
          Where to find sample plans to stress-test
        </summary>
        <ul className="mt-3 space-y-2 text-zinc-700">
          <li>
            <strong>Volume builder display home pages</strong> — Metricon,
            Coral, Wisdom, McDonald Jones, Clarendon. Each home page links to
            a downloadable floor plan PDF. Good for clean single-storey and
            double-storey residential plans.
          </li>
          <li>
            <strong>realestate.com.au new-build listings</strong> — many
            display the floor plan as a PDF or PNG in the gallery. Good for
            realistic ICP-grade plans.
          </li>
          <li>
            <strong>NSW Planning Portal / VicSmart / SA PlanSA</strong> —
            council DA documents are public. Search a recent residential
            application and download the architectural set PDF. Good for
            multi-page sets that exercise the page classifier.
          </li>
          <li>
            <strong>Wikimedia Commons</strong> — search the &quot;Floor
            plans&quot; category for image-only PNGs / JPGs. Good for testing
            the image path that skips PDF rendering.
          </li>
          <li>
            <strong>Hand-sketch / photo of a sketch</strong> — phone photo of
            a hand-drawn plan. Good for stress-testing extractor robustness
            on non-CAD inputs.
          </li>
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          Not linking specific URLs because builder and council PDF links
          rotate. Test for personal use only — most floor plans are
          copyrighted by the builder or architect.
        </p>
      </details>

      <Test3DHarness />
    </div>
  );
}
