import { ModuleHero } from "@/components/shared/module-hero";
import { ExplainerVideo } from "@/components/shared/explainer-video";
import { ProfessionalCard } from "@/components/direct/professional-card";
import { DirectorySearch } from "@/components/direct/directory-search";
import { DirectoryPagination } from "@/components/direct/directory-pagination";
import { searchProfessionals, getTopProfessionals } from "./actions";
import { Users, Search, Star, MapPin } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Suspense } from "react";
import type { Professional, Specialisation } from "@/lib/direct/types";

async function DirectPreviewCard() {
  const topPros = await getTopProfessionals(3);

  if (topPros.length === 0) {
    return (
      <div className="bg-white/[0.08] border border-white/15 rounded-2xl backdrop-blur-xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <Search className="w-5 h-5 text-white/70" />
          <span className="text-base font-medium text-white/90">Search Professionals</span>
        </div>
        <div className="space-y-3">
          {[
            { company: "ModularPro Australia", type: "Modular Builder", location: "Sydney", rating: 4.9 },
            { company: "CLT Structures Co", type: "CLT Specialist", location: "Melbourne", rating: 4.8 },
            { company: "Green Build Consulting", type: "Sustainability", location: "Brisbane", rating: 4.7 },
          ].map((pro) => (
            <div key={pro.company} className="bg-white/[0.06] border border-white/10 rounded-xl px-5 py-4 flex justify-between items-center">
              <div>
                <p className="text-sm font-semibold text-white">{pro.company}</p>
                <p className="text-xs text-white/60">{pro.type}</p>
                <p className="text-xs text-white/50 flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3 h-3" />{pro.location}
                </p>
              </div>
              <div className="flex items-center gap-1 text-amber-400 font-semibold text-sm">
                <Star className="w-4 h-4 fill-amber-400" />{pro.rating}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/[0.08] border border-white/15 rounded-2xl backdrop-blur-xl p-6 shadow-2xl">
      <div className="flex items-center gap-3 mb-4">
        <Search className="w-5 h-5 text-white/70" />
        <span className="text-base font-medium text-white/90">Featured Professionals</span>
      </div>
      <div className="space-y-3">
        {topPros.map((pro: Professional & { professional_specialisations?: Specialisation[] }) => (
          <div key={pro.id} className="bg-white/[0.06] border border-white/10 rounded-xl px-5 py-4 flex justify-between items-center">
            <div>
              <p className="text-sm font-semibold text-white">{pro.company_name}</p>
              <p className="text-xs text-white/60">{pro.trade_type}</p>
              <p className="text-xs text-white/50 flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3" />{pro.regions?.join(", ") || "Australia"}
              </p>
            </div>
            <div className="flex items-center gap-1 text-amber-400 font-semibold text-sm">
              <Star className="w-4 h-4 fill-amber-400" />
              {pro.avg_rating > 0 ? Number(pro.avg_rating).toFixed(1) : "New"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function DirectPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; trade?: string; region?: string; spec?: string; page?: string }>;
}) {
  const params = await searchParams;
  const result = await searchProfessionals({
    query: params.q,
    trade_type: params.trade,
    region: params.region,
    specialisation: params.spec,
    page: params.page ? parseInt(params.page) : 1,
  });

  return (
    <div>
      <ModuleHero
        module="direct"
        heading={<>Find Your <span className="text-amber-400">Perfect</span> Team</>}
        description="Browse verified builders, architects, suppliers, and trades specialising in modern methods of construction across Australia."
        previewCard={
          <Suspense fallback={null}>
            <DirectPreviewCard />
          </Suspense>
        }
      />

      <ExplainerVideo
        module="direct"
        videoUrl="/videos/direct-explainer.mp4"
        title="Australia's verified MMC supplier directory"
        description="Find prefab, panelised, modular, and 3D concrete printing suppliers — searchable by state, capability, and certification — with compliance documents you can call up directly on your drawings."
        bullets={[
          {
            heading: "Verified credentials",
            body: "Each supplier's CodeMark, NCC, and product datasheets are uploaded by the supplier and verified by us. Specify with confidence.",
          },
          {
            heading: "Capability filtering",
            body: "Filter by state, MMC category, project size, and lead time. Surface only suppliers who can deliver what your design needs.",
          },
          {
            heading: "Quote without leaving",
            body: "When a supplier matches a Build suggestion, request a quote inside MMC Quote — no platform-hopping, no chasing emails.",
          },
        ]}
      />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Trade Directory</h2>
            <p className="text-sm text-muted-foreground">
              {result.total} professional{result.total !== 1 ? "s" : ""} found
            </p>
          </div>
          <Link href="/direct/register">
            <Button className="bg-amber-600 hover:bg-amber-700">
              Register Your Business
            </Button>
          </Link>
        </div>

        <DirectorySearch />

        {result.professionals.length > 0 ? (
          <>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {result.professionals.map((pro: Professional & { professional_specialisations?: Specialisation[] }) => (
                <ProfessionalCard key={pro.id} professional={pro} />
              ))}
            </div>
            <DirectoryPagination page={result.page ?? 1} totalPages={result.totalPages ?? 1} />
          </>
        ) : (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Users className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="font-semibold text-lg">No professionals found</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Try adjusting your search filters or check back later.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
