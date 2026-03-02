import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { testFunction } from "@/lib/inngest/functions/test-function";
import { processPlan } from "@/lib/inngest/functions/process-plan";
import { runComplianceCheck } from "@/lib/inngest/functions/run-compliance-check";
import { processKbDocument } from "@/lib/inngest/functions/process-kb-document";
import { classifyRdCommit } from "@/lib/inngest/functions/classify-rd-commit";
import { processCertification } from "@/lib/inngest/functions/process-certification";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [testFunction, processPlan, runComplianceCheck, processKbDocument, classifyRdCommit, processCertification],
});
