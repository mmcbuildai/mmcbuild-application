import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isOperatorEmail } from "@/lib/auth/operator";
import { getSuppliersForAdmin, getComplianceReviewQueue } from "./actions";
import { SupplierTierManager } from "@/components/admin/supplier-tier-manager";
import { SupplierComplianceReview } from "@/components/admin/supplier-compliance-review";

// SCRUM-171: operator surface to set supplier tiers and seed their product
// catalogue. The directory is a global shared marketplace, so access is gated on
// the operator allowlist (SCRUM-345), not a per-org role.
export default async function AdminSuppliersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  if (!isOperatorEmail(user.email)) redirect("/dashboard");

  const [suppliers, complianceDocs] = await Promise.all([
    getSuppliersForAdmin(),
    getComplianceReviewQueue(),
  ]);

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Suppliers &amp; Products</h1>
          <p className="text-muted-foreground">
            Set each supplier&apos;s tier and manage their product catalogue. Only
            Growth Partner suppliers have their products surfaced inside MMC Build
            optimisation suggestions; Free and Verified suppliers appear in the
            Directory only.
          </p>
        </div>
        <SupplierTierManager suppliers={suppliers} />
      </div>

      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold">Compliance documents</h2>
          <p className="text-muted-foreground">
            Verify supplier-uploaded compliance documents (CodeMark, NCC reports,
            datasheets). Only verified, unexpired documents appear on the public
            directory listing and in Build suggestions.
          </p>
        </div>
        <SupplierComplianceReview docs={complianceDocs} />
      </div>
    </div>
  );
}
