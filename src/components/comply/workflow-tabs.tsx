"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ComplianceReport } from "./compliance-report";
import { WorkflowReport } from "./workflow-report";
import { ActionItems } from "./action-items";
import type { RemediationResponse } from "./finding-review-card";

interface Finding {
  id: string;
  ncc_section: string;
  category: string;
  title: string;
  description: string;
  recommendation: string | null;
  severity: "compliant" | "advisory" | "non_compliant" | "critical";
  confidence: number;
  ncc_citation: string | null;
  page_references: number[] | null;
  sort_order: number;
  responsible_discipline: string | null;
  assigned_contributor_id: string | null;
  remediation_action: string | null;
  review_status: string | null;
  rejection_reason: string | null;
  amended_description: string | null;
  amended_action: string | null;
  amended_discipline: string | null;
  sent_at: string | null;
  remediation_status: string | null;
  remediation_responded_at: string | null;
  responses?: RemediationResponse[];
}

interface Contributor {
  id: string;
  discipline: string;
  contact_name: string;
  company_name: string | null;
  contact_email: string | null;
}

interface WorkflowTabsProps {
  check: {
    id: string;
    summary: string | null;
    overall_risk: "low" | "medium" | "high" | "critical" | null;
    completed_at: string | null;
  };
  findings: Finding[];
  contributors: Contributor[];
  projectId?: string;
}

export function WorkflowTabs({
  check,
  findings,
  contributors,
  projectId,
}: WorkflowTabsProps) {
  const hasFlagged = findings.some(
    (f) => f.severity === "non_compliant" || f.severity === "critical"
  );

  const defaultTab = hasFlagged ? "action-items" : "workflow";

  return (
    <Tabs defaultValue={defaultTab}>
      <TabsList>
        {hasFlagged && (
          <TabsTrigger value="action-items">Action Items</TabsTrigger>
        )}
        <TabsTrigger value="workflow">Workflow</TabsTrigger>
        <TabsTrigger value="report">Report</TabsTrigger>
      </TabsList>

      {hasFlagged && (
        <TabsContent value="action-items">
          <ActionItems
            findings={findings}
            contributors={contributors}
            projectId={projectId}
          />
        </TabsContent>
      )}

      <TabsContent value="workflow">
        <WorkflowReport findings={findings} contributors={contributors} projectId={projectId} />
      </TabsContent>

      <TabsContent value="report">
        <ComplianceReport check={check} findings={findings} />
      </TabsContent>
    </Tabs>
  );
}
