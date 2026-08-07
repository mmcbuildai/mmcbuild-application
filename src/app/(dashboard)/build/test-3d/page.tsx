import { notFound } from "next/navigation";
import { Test3DHarness } from "@/components/build/test-3d-harness";
import { is3dRenderingEnabled } from "@/lib/build/render-3d";
import { createClient } from "@/lib/supabase/server";
import { isOperatorEmail } from "@/lib/auth/operator";

export const metadata = {
  title: "3D Extractor Test Harness",
};

// Full-house orchestrator can make up to 1 classification + 1 floor plan +
// 4 elevations + 1 section + 1 schedule = 8 Sonnet calls (with extended
// thinking on the heavy ones). Allow 5 min so the server action doesn't
// time out before all pages are extracted.
export const maxDuration = 300;

export default async function Test3DPage() {
  // SCRUM-365: this harness is an internal diagnostic that renders the raw
  // extractor output. It must be operator-only.
  //
  // The 3D flag alone is NOT the gate. PR #134 made this route 404 while
  // NEXT_PUBLIC_3D_RENDERING_ENABLED is false, which closes it for Go Live 1 —
  // but only as a side effect of the toggle. The whole point of shipping a
  // toggle rather than deleting the feature is that 3D gets switched back on,
  // and on that day the route would silently become reachable by every
  // signed-in customer again. So gate on the operator allowlist as well, and
  // keep both checks: the flag hides the feature, the allowlist restricts the
  // diagnostic.
  if (!is3dRenderingEnabled()) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // 404 rather than redirect: a non-operator should not learn the route exists.
  // Operator identity is an EMAIL allowlist, never an org role — every
  // self-signup owns their own org, so "owner" would let every customer in
  // (see lib/auth/operator.ts).
  if (!isOperatorEmail(user?.email)) notFound();

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
