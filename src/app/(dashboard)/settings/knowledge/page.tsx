import { listKnowledgeBases } from "./actions";
import { KbCreateDialog } from "@/components/knowledge/kb-create-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Database } from "lucide-react";
import Link from "next/link";

export default async function KnowledgeBasesPage() {
  const knowledgeBases = await listKnowledgeBases();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Knowledge Bases</h1>
          <p className="text-muted-foreground">
            Manage reference documents for AI compliance analysis
          </p>
        </div>
        <KbCreateDialog />
      </div>

      {knowledgeBases.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {knowledgeBases.map((kb) => (
            <Link key={kb.id} href={`/settings/knowledge/${kb.id}`}>
              <Card className="hover:shadow-md transition-shadow cursor-pointer">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{kb.name}</CardTitle>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <CardDescription>
                    {kb.description ?? "No description"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={kb.scope === "system" ? "default" : "secondary"}
                    >
                      {kb.scope}
                    </Badge>
                    {!kb.is_active && (
                      <Badge variant="outline">Inactive</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="flex flex-col items-center justify-center py-12">
          <Database className="mb-4 h-12 w-12 text-muted-foreground" />
          <h3 className="text-lg font-medium">No knowledge bases yet</h3>
          <p className="mb-4 text-sm text-muted-foreground">
            Create a knowledge base and upload NCC reference documents.
          </p>
        </Card>
      )}
    </div>
  );
}
