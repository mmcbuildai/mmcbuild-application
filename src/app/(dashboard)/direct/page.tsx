import { ExplainerVideo } from "@/components/shared/explainer-video";
import { BetaTaskPanel } from "@/components/beta/beta-task-panel";
import { ProfessionalCard } from "@/components/direct/professional-card";
import { DirectorySearch } from "@/components/direct/directory-search";
import { DirectoryPagination } from "@/components/direct/directory-pagination";
import { searchProfessionals, getMyProfessional } from "./actions";
import { Truck, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import type { Professional, Specialisation } from "@/lib/direct/types";
import { createClient } from "@/lib/supabase/server";
import { ComingSoon } from "@/components/shared/coming-soon";
import { shouldShowComingSoon } from "@/lib/launch-modules";

export default async function DirectPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; trade?: string; region?: string; spec?: string; page?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  let role: string | null = null;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    role = profile?.role ?? null;
  }
  if (shouldShowComingSoon("direct", role)) {
    return (
      <ComingSoon
        moduleName="MMC Direct"
        description="The MMC Direct trade and supplier directory will be available in the next release. Builders, certifiers, and suppliers across Australia will list their services here."
        Icon={Truck}
      />
    );
  }

  const params = await searchParams;
  const [result, myListing] = await Promise.all([
    searchProfessionals({
      query: params.q,
      trade_type: params.trade,
      region: params.region,
      specialisation: params.spec,
      page: params.page ? parseInt(params.page) : 1,
    }),
    // Does the caller's org already have a listing? Drives the CTA below so it
    // matches what /direct/register actually does — when a listing exists that
    // page redirects to the dashboard, so a "Register Your Business" button
    // there would silently bounce the user (SCRUM-238). Show "Manage Your
    // Business" → dashboard instead when they already have one.
    getMyProfessional(),
  ]);
  const hasListing = !!myListing;
  const businessCta = hasListing
    ? { href: "/direct/dashboard", label: "Manage Your Business" }
    : { href: "/direct/register", label: "Register Your Business" };

  return (
    <div className="space-y-6">
      <BetaTaskPanel moduleId="direct" />
      <ExplainerVideo module="direct" videoUrl="/videos/direct-explainer.mp4" />

      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">MMC Direct</h2>
            <p className="text-sm text-muted-foreground">
              {result.total} professional{result.total !== 1 ? "s" : ""} found
            </p>
          </div>
          <Link href={businessCta.href}>
            <Button className="bg-amber-600 hover:bg-amber-700">
              {businessCta.label}
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
