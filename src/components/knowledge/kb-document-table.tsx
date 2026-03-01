"use client";

import { deleteKbDocument } from "@/app/(dashboard)/settings/knowledge/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FileText, Trash2, Loader2, CheckCircle, XCircle } from "lucide-react";
import type { Database } from "@/lib/supabase/types";

type KbDocument = Database["public"]["Tables"]["knowledge_documents"]["Row"];

const statusConfig = {
  pending: { label: "Pending", variant: "outline" as const, icon: Loader2 },
  processing: { label: "Processing", variant: "secondary" as const, icon: Loader2 },
  ready: { label: "Ready", variant: "default" as const, icon: CheckCircle },
  error: { label: "Error", variant: "destructive" as const, icon: XCircle },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export function KbDocumentTable({
  documents,
  kbId,
}: {
  documents: KbDocument[];
  kbId: string;
}) {
  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <FileText className="mb-2 h-8 w-8" />
        <p className="text-sm">No documents uploaded yet</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>File</TableHead>
          <TableHead>Size</TableHead>
          <TableHead>Pages</TableHead>
          <TableHead>Chunks</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Uploaded</TableHead>
          <TableHead className="w-[60px]" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((doc) => {
          const status = statusConfig[doc.status];
          const StatusIcon = status.icon;
          return (
            <TableRow key={doc.id}>
              <TableCell className="font-medium">{doc.file_name}</TableCell>
              <TableCell>{formatBytes(doc.file_size_bytes)}</TableCell>
              <TableCell>{doc.page_count ?? "—"}</TableCell>
              <TableCell>{doc.chunk_count ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={status.variant} className="gap-1">
                  <StatusIcon
                    className={`h-3 w-3 ${
                      doc.status === "processing" ? "animate-spin" : ""
                    }`}
                  />
                  {status.label}
                </Badge>
                {doc.error_message && (
                  <p className="text-xs text-destructive mt-1">
                    {doc.error_message}
                  </p>
                )}
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">
                {new Date(doc.created_at).toLocaleDateString("en-AU")}
              </TableCell>
              <TableCell>
                <form
                  action={async () => {
                    await deleteKbDocument(doc.id, kbId);
                  }}
                >
                  <Button
                    variant="ghost"
                    size="icon"
                    type="submit"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </form>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
