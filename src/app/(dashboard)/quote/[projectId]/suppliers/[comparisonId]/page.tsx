import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupplierComparison } from "@/app/(dashboard)/quote/supplier-actions";
import { getTechnologyLabel } from "@/lib/ai/types";
import { SupplierComparisonResult } from "@/components/quote/supplier-comparison-result";

export default async function SupplierComparisonPage({
  params,
}: {
  params: Promise<{ projectId: string; comparisonId: string }>;
}) {
  const { projectId, comparisonId } = await params;
  const { comparison, variants } = await getSupplierComparison(comparisonId);

  if (!comparison) {
    redirect(`/quote/${projectId}`);
  }

  const categoryLabel = getTechnologyLabel(comparison.technology_category);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/quote/${projectId}`}
          className="text-sm text-muted-foreground hover:underline"
        >
          &larr; Back to Quote
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Supplier comparison</h1>
        <p className="text-muted-foreground">
          {categoryLabel} — up to 3 suppliers priced side by side for this project.
        </p>
      </div>

      <SupplierComparisonResult
        projectId={projectId}
        comparisonId={comparisonId}
        categoryLabel={categoryLabel}
        initialComparison={comparison}
        initialVariants={variants}
      />
    </div>
  );
}
