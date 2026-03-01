import { getKnowledgeBase, listKbDocuments } from "../actions";
import { KbDocumentUpload } from "@/components/knowledge/kb-document-upload";
import { KbDocumentTable } from "@/components/knowledge/kb-document-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function KnowledgeBaseDetailPage({
  params,
}: {
  params: Promise<{ kbId: string }>;
}) {
  const { kbId } = await params;
  const kb = await getKnowledgeBase(kbId);
  const documents = await listKbDocuments(kbId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings/knowledge">
          <Button variant="ghost" size="sm" className="mb-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Knowledge Bases
          </Button>
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">{kb.name}</h1>
          <Badge variant={kb.scope === "system" ? "default" : "secondary"}>
            {kb.scope}
          </Badge>
        </div>
        {kb.description && (
          <p className="text-muted-foreground mt-1">{kb.description}</p>
        )}
      </div>

      <KbDocumentUpload kbId={kbId} />

      <div>
        <h2 className="text-lg font-semibold mb-4">
          Documents ({documents.length})
        </h2>
        <KbDocumentTable documents={documents} kbId={kbId} />
      </div>
    </div>
  );
}
