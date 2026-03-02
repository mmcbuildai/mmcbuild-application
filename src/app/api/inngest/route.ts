import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { testFunction } from "@/lib/inngest/functions/test-function";
import { processPlan } from "@/lib/inngest/functions/process-plan";
import { runComplianceCheck } from "@/lib/inngest/functions/run-compliance-check";
import { processKbDocument } from "@/lib/inngest/functions/process-kb-document";
import { classifyRdCommit } from "@/lib/inngest/functions/classify-rd-commit";
import { processCertification } from "@/lib/inngest/functions/process-certification";
import { sendRemediationEmail } from "@/lib/inngest/functions/send-remediation-email";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [testFunction, processPlan, runComplianceCheck, processKbDocument, classifyRdCommit, processCertification, sendRemediationEmail],
  // Force Inngest to call back to the production URL instead of the
  // deployment-specific URL which is behind Vercel Deployment Protection.
  serveHost: process.env.NEXT_PUBLIC_APP_URL || undefined,
});
