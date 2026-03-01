import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { testFunction } from "@/lib/inngest/functions/test-function";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [testFunction],
});
