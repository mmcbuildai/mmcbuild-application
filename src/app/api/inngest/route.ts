import { serve } from "inngest/next";

// Inngest functions run as Vercel serverless invocations. The default
// per-invocation timeout is 60s, which isn't enough for the test-3d
// extraction (CloudConvert DWG→DXF/PDF + Sonnet calls can push 3–4 min).
// Lift to the Pro-plan ceiling of 300s. Functions still use step.run for
// finer-grained checkpointing.
export const maxDuration = 300;
import { inngest } from "@/lib/inngest/client";
import { testFunction } from "@/lib/inngest/functions/test-function";
import { processPlan } from "@/lib/inngest/functions/process-plan";
import { extractDesignAttributes } from "@/lib/inngest/functions/extract-design-attributes";
import { runComplianceCheck } from "@/lib/inngest/functions/run-compliance-check";
import { processKbDocument } from "@/lib/inngest/functions/process-kb-document";
import { classifyRdCommit } from "@/lib/inngest/functions/classify-rd-commit";
import { processCertification } from "@/lib/inngest/functions/process-certification";
import { sendRemediationEmail } from "@/lib/inngest/functions/send-remediation-email";
import { notifyRemediationResponse } from "@/lib/inngest/functions/notify-remediation-response";
import { runDesignOptimisation } from "@/lib/inngest/functions/run-design-optimisation";
import { runCostEstimation } from "@/lib/inngest/functions/run-cost-estimation";
import { runSupplierComparison } from "@/lib/inngest/functions/run-supplier-comparison";
import { ingestCostRates } from "@/lib/inngest/functions/ingest-cost-rates";
import { sendEnquiryNotification } from "@/lib/inngest/functions/send-enquiry-notification";
import { sendReviewNotification } from "@/lib/inngest/functions/send-review-notification";
import { generateTrainingContent } from "@/lib/inngest/functions/generate-training-content";
import { issueTrainingCertificate } from "@/lib/inngest/functions/issue-training-certificate";
import { syncStripeSubscription } from "@/lib/inngest/functions/sync-stripe-subscription";
import { syncHubspotListing } from "@/lib/inngest/functions/sync-hubspot-listing";
import { runTest3DExtractionFn } from "@/lib/inngest/functions/run-test-3d-extraction";
import { notifyNewProfessional } from "@/lib/inngest/functions/notify-new-professional";
import { reapStuckJobs } from "@/lib/inngest/functions/reap-stuck-jobs";
import { purgeSupersededPlans } from "@/lib/inngest/functions/purge-superseded-plans";
import { remindComplianceExpiry } from "@/lib/inngest/functions/remind-compliance-expiry";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [testFunction, processPlan, extractDesignAttributes, runComplianceCheck, processKbDocument, classifyRdCommit, processCertification, sendRemediationEmail, notifyRemediationResponse, runDesignOptimisation, runCostEstimation, runSupplierComparison, ingestCostRates, sendEnquiryNotification, sendReviewNotification, generateTrainingContent, issueTrainingCertificate, syncStripeSubscription, syncHubspotListing, runTest3DExtractionFn, notifyNewProfessional, reapStuckJobs, purgeSupersededPlans, remindComplianceExpiry],
  // Force Inngest to call back to the production URL instead of the
  // deployment-specific URL which is behind Vercel Deployment Protection.
  serveHost: process.env.NEXT_PUBLIC_APP_URL || undefined,
});
