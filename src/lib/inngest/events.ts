export type Events = {
  "plan/uploaded": {
    data: {
      projectId: string;
      fileUrl: string;
      fileName: string;
      uploadedBy: string;
    };
  };
  "compliance/check.requested": {
    data: {
      projectId: string;
      planId: string;
      questionnaireData: Record<string, unknown>;
    };
  };
  "design/optimisation.requested": {
    data: {
      projectId: string;
      planId: string;
    };
  };
  "cost/estimation.requested": {
    data: {
      projectId: string;
      planId: string;
    };
  };
  "report/generate.requested": {
    data: {
      projectId: string;
      reportType: "compliance" | "optimisation" | "quote";
      resultId: string;
    };
  };
  "stripe/subscription.sync": {
    data: {
      customerId: string;
      subscriptionId: string;
      status: string;
    };
  };
  "kb/document.uploaded": {
    data: {
      documentId: string;
      kbId: string;
      fileName: string;
      filePath: string;
    };
  };
  "rd/commit.detected": {
    data: {
      commitLogId: string;
      orgId: string;
      sha: string;
    };
  };
};
