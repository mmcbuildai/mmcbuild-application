import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { isOperatorEmail } from "@/lib/auth/operator";
import { getSuppliersForAdmin } from "./actions";
import { SupplierTierManager } from "@/components/admin/supplier-tier-manager";

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

  const suppliers = await getSuppliersForAdmin();

  return (
    <div className="space-y-6">
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
  );
}
