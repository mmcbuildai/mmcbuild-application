import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CertificateWithCourse } from "@/lib/train/types";
import { Award, Download } from "lucide-react";

interface CertificateCardProps {
  certificate: CertificateWithCourse;
}

export function CertificateCard({ certificate }: CertificateCardProps) {
  const issuedDate = new Date(certificate.issued_at).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <Award className="h-5 w-5 text-purple-600" />
          <CardTitle className="text-base">{certificate.course?.title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 text-sm text-muted-foreground mb-3">
          <div className="flex justify-between">
            <span>Certificate No</span>
            <Badge variant="outline" className="font-mono text-xs">
              {certificate.cert_number}
            </Badge>
          </div>
          <div className="flex justify-between">
            <span>Issued</span>
            <span>{issuedDate}</span>
          </div>
        </div>
        {certificate.pdf_url && (
          <a href={certificate.pdf_url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="w-full">
              <Download className="mr-1 h-3.5 w-3.5" />
              Download PDF
            </Button>
          </a>
        )}
      </CardContent>
    </Card>
  );
}
