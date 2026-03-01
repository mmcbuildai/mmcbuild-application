import { inngest } from "../client";

export const testFunction = inngest.createFunction(
  { id: "test-function", name: "Test Function" },
  { event: "test/hello" },
  async ({ event, step }) => {
    const greeting = await step.run("generate-greeting", async () => {
      return `Hello from MMC Build! Event data: ${JSON.stringify(event.data)}`;
    });

    return { message: greeting };
  }
);
