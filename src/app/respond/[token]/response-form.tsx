"use client";

import { useState } from "react";

interface Finding {
  title: string;
  description: string;
  severity: string;
  ncc_section: string;
  ncc_citation: string | null;
  category: string;
  remediation_action: string | null;
}

interface ResponseFormProps {
  token: string;
  finding: Finding;
  projectName: string;
  currentStatus: string;
  previousNotes: string | null;
}

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  non_compliant: "bg-yellow-100 text-yellow-800",
  advisory: "bg-blue-100 text-blue-800",
  compliant: "bg-green-100 text-green-800",
};

const SEVERITY_LABELS: Record<string, string> = {
  critical: "Critical",
  non_compliant: "Non-Compliant",
  advisory: "Advisory",
  compliant: "Compliant",
};

const STATUS_OPTIONS = [
  { value: "acknowledged", label: "Acknowledged", description: "I have reviewed this finding" },
  { value: "in_progress", label: "In Progress", description: "Remediation work has started" },
  { value: "completed", label: "Completed", description: "Remediation is complete" },
  { value: "disputed", label: "Disputed", description: "I disagree with this finding" },
] as const;

export function ResponseForm({
  token,
  finding,
  projectName,
  currentStatus,
  previousNotes,
}: ResponseFormProps) {
  const [status, setStatus] = useState(
    currentStatus !== "awaiting" ? currentStatus : ""
  );
  const [notes, setNotes] = useState(previousNotes ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!status) return;

    setSubmitting(true);
    setError(null);

    try {
      let filePath: string | undefined;
      let fileName: string | undefined;

      // Upload file first if provided
      if (file) {
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await fetch(`/api/remediation/${token}/upload`, {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const uploadErr = await uploadRes.json();
          throw new Error(uploadErr.error || "File upload failed");
        }

        const uploadData = await uploadRes.json();
        filePath = uploadData.file_path;
        fileName = uploadData.file_name;
      }

      // Submit response
      const res = await fetch(`/api/remediation/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          notes: notes || undefined,
          file_path: filePath,
          file_name: fileName,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit response");
      }

      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-lg border bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
          <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900">Response Submitted</h2>
        <p className="mt-2 text-sm text-gray-500">
          Your response has been recorded. The builder will be notified of your update.
        </p>
        <p className="mt-4 text-xs text-gray-400">
          You can revisit this page to update your response at any time before the link expires.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Finding details (read-only) */}
      <div className="rounded-lg border bg-white p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-gray-500 mb-1">{projectName}</p>
            <h2 className="text-lg font-semibold text-gray-900">{finding.title}</h2>
          </div>
          <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${SEVERITY_STYLES[finding.severity] ?? ""}`}>
            {SEVERITY_LABELS[finding.severity] ?? finding.severity}
          </span>
        </div>

        <p className="text-sm text-gray-600 leading-relaxed">{finding.description}</p>

        {finding.remediation_action && (
          <div className="rounded-md bg-blue-50 border border-blue-200 p-4">
            <p className="text-xs font-medium text-blue-800 mb-1">Required Action</p>
            <p className="text-sm text-blue-900">{finding.remediation_action}</p>
          </div>
        )}

        {finding.ncc_citation && (
          <div>
            <p className="text-xs font-medium text-gray-700 mb-1">NCC Reference</p>
            <p className="text-xs font-mono text-gray-500">{finding.ncc_citation}</p>
          </div>
        )}

        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{finding.ncc_section}</span>
          <span>&middot;</span>
          <span className="capitalize">{finding.category.replace(/_/g, " ")}</span>
        </div>
      </div>

      {/* Response form */}
      <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-6 space-y-5">
        <h3 className="text-base font-semibold text-gray-900">Your Response</h3>

        {/* Status select */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            Remediation Status <span className="text-red-500">*</span>
          </label>
          <div className="grid gap-2">
            {STATUS_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  status === opt.value
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="status"
                  value={opt.value}
                  checked={status === opt.value}
                  onChange={() => setStatus(opt.value)}
                  className="mt-0.5"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-500">{opt.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            id="notes"
            rows={4}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Describe the remediation work done or provide additional context..."
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* File upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Supporting Document (optional)
          </label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.xls,.xlsx"
            className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-gray-100 file:px-4 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
          />
          <p className="mt-1 text-xs text-gray-400">Max 10MB. PDF, DOC, images, or spreadsheets.</p>
        </div>

        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <button
          type="submit"
          disabled={!status || submitting}
          className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting..." : "Submit Response"}
        </button>
      </form>
    </div>
  );
}
