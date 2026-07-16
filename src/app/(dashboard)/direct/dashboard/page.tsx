import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMyProfessional, getReceivedEnquiries, getProfessionalReviews } from "../actions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardStats } from "@/components/direct/dashboard-stats";
import { ProfileEditForm } from "@/components/direct/profile-edit-form";
import { PortfolioManager } from "@/components/direct/portfolio-manager";
import { CompanyDocumentsManager } from "@/components/direct/company-documents-manager";
import type { CompanyDocument } from "@/lib/direct/types";
import { EnquiryList } from "@/components/direct/enquiry-list";
import { ReviewList } from "@/components/direct/review-list";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function TradeDashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, org_id")
    .eq("user_id", user.id)
    .single();

  if (!profile) redirect("/login");

  const professional = await getMyProfessional();
  if (!professional) redirect("/direct/register");

  // Load data in parallel
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as unknown as any;
  const [enquiries, reviewsResult, portfolioResult, documentsResult] =
    await Promise.all([
      getReceivedEnquiries(professional.id),
      getProfessionalReviews(professional.id),
      admin
        .from("portfolio_items")
        .select("*")
        .eq("professional_id", professional.id)
        .order("sort_order", { ascending: true }),
      admin
        .from("company_documents")
        .select("*")
        .eq("professional_id", professional.id)
        .order("created_at", { ascending: false }),
    ]);

  const portfolio = portfolioResult?.data ?? [];
  const documents = (documentsResult?.data ?? []) as CompanyDocument[];

  const statusBanners: Record<string, { bg: string; text: string; message: string }> = {
    pending: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", message: "Your listing is pending approval. Our team will review it shortly." },
    approved: { bg: "bg-green-50 border-green-200", text: "text-green-700", message: "Your listing is live and visible to all users." },
    suspended: { bg: "bg-red-50 border-red-200", text: "text-red-700", message: "Your listing has been suspended. Please contact support." },
  };
  const statusBanner = statusBanners[professional.status];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trade Dashboard</h1>
        <p className="text-muted-foreground">Manage your MMC Direct listing</p>
      </div>

      {statusBanner && (
        <div className={`border rounded-lg p-3 ${statusBanner.bg}`}>
          <p className={`text-sm ${statusBanner.text}`}>{statusBanner.message}</p>
        </div>
      )}

      <DashboardStats professional={professional} enquiryCount={enquiries.length} />

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="enquiries">Enquiries ({enquiries.length})</TabsTrigger>
          <TabsTrigger value="reviews">Reviews ({professional.review_count})</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileEditForm professional={professional} orgId={profile.org_id} />
        </TabsContent>

        <TabsContent value="portfolio" className="mt-4">
          <PortfolioManager
            professionalId={professional.id}
            orgId={profile.org_id}
            items={portfolio as { id: string; professional_id: string; image_url: string | null; title: string; description: string | null; sort_order: number; created_at: string }[]}
          />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <CompanyDocumentsManager
            professionalId={professional.id}
            orgId={profile.org_id}
            documents={documents}
          />
        </TabsContent>

        <TabsContent value="enquiries" className="mt-4">
          <EnquiryList enquiries={enquiries as { id: string; professional_id: string; sender_org_id: string; sender_name: string; subject: string; message: string; project_id: string | null; status: "new" | "read" | "replied" | "archived"; read_at: string | null; created_at: string }[]} />
        </TabsContent>

        <TabsContent value="reviews" className="mt-4">
          <ReviewList reviews={reviewsResult.reviews as { id: string; professional_id: string; reviewer_org_id: string; reviewer_name: string; rating: number; comment: string | null; created_at: string }[]} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
