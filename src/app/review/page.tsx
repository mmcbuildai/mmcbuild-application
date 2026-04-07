import {
  FileCheck,
  Bug,
  ExternalLink,
  Clock,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  MessageCircle,
  Palette,
  Shield,
} from "lucide-react";

const REPO = "dennissolver/mmcbuild";
const DESIGN_TEMPLATE_URL = `https://github.com/${REPO}/issues/new?template=design-feedback.yml`;
const QA_TEMPLATE_URL = `https://github.com/${REPO}/issues/new?template=qa-report.yml`;
const PROJECT_BOARD_URL = "https://github.com/users/dennissolver/projects/4";

interface StatusBadgeProps {
  status: "overdue" | "pending" | "in-progress" | "done";
  label: string;
}

function StatusBadge({ status, label }: StatusBadgeProps) {
  const styles = {
    overdue: "bg-red-500/20 text-red-400 border-red-500/30",
    pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    "in-progress": "bg-blue-500/20 text-blue-400 border-blue-500/30",
    done: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  };
  const icons = {
    overdue: <AlertTriangle className="h-3.5 w-3.5" />,
    pending: <Clock className="h-3.5 w-3.5" />,
    "in-progress": <Clock className="h-3.5 w-3.5" />,
    done: <CheckCircle2 className="h-3.5 w-3.5" />,
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${styles[status]}`}
    >
      {icons[status]}
      {label}
    </span>
  );
}

interface ActionCardProps {
  name: string;
  role: string;
  icon: React.ReactNode;
  gradient: string;
  accentText: string;
  items: {
    title: string;
    status: StatusBadgeProps["status"];
    statusLabel: string;
    issueNumber: number;
  }[];
  submitUrl: string;
  submitLabel: string;
  submitDescription: string;
  steps: string[];
}

function ActionCard({
  name,
  role,
  icon,
  gradient,
  accentText,
  items,
  submitUrl,
  submitLabel,
  submitDescription,
  steps,
}: ActionCardProps) {
  return (
    <div className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl overflow-hidden">
      {/* Header */}
      <div className={`${gradient} px-6 py-5`}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
            {icon}
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">{name}</h2>
            <p className={`text-sm ${accentText}`}>{role}</p>
          </div>
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 p-6 space-y-4">
        <h3 className="text-sm font-medium uppercase tracking-wider text-white/50">
          Your Items
        </h3>
        {items.map((item) => (
          <div
            key={item.issueNumber}
            className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3"
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">
                {item.title}
              </p>
              <a
                href={`https://github.com/${REPO}/issues/${item.issueNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white/40 hover:text-white/60 transition-colors"
              >
                Issue #{item.issueNumber}
              </a>
            </div>
            <StatusBadge status={item.status} label={item.statusLabel} />
          </div>
        ))}

        {/* How to submit */}
        <div className="pt-2">
          <h3 className="text-sm font-medium uppercase tracking-wider text-white/50 mb-3">
            How to Submit
          </h3>
          <p className="text-sm text-white/60 mb-3">{submitDescription}</p>
          <ol className="space-y-2">
            {steps.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm text-white/50">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-medium text-white/70">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {/* CTA */}
      <div className="px-6 pb-6">
        <a
          href={submitUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex w-full items-center justify-center gap-2 rounded-full ${gradient} px-6 py-3 text-sm font-medium text-white shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all`}
        >
          {submitLabel}
          <ArrowRight className="h-4 w-4" />
        </a>
      </div>
    </div>
  );
}

export default function ReviewPage() {
  return (
    <div className="min-h-screen bg-[#0B1120]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0B1120]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600">
              <Shield className="h-5 w-5 text-white" />
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              MMC Build
            </span>
          </div>
          <a
            href={PROJECT_BOARD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/15 hover:text-white transition-all"
          >
            Project Board
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-teal-500/10 via-transparent to-transparent" />
        <div className="relative mx-auto max-w-6xl px-6 py-16 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-2 mb-6 backdrop-blur-sm">
            <div className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-sm font-medium text-white/80">
              Sprint 4 — Client Review
            </span>
          </div>
          <h1 className="text-4xl font-extrabold italic text-white leading-tight lg:text-5xl">
            Sprint{" "}
            <span className="text-teal-400">Review</span>{" "}
            Dashboard
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/50">
            All six modules are live. We&apos;re now in the feedback and
            iteration phase. Submit your design feedback or QA findings below.
          </p>
        </div>
      </section>

      {/* Cards */}
      <section className="mx-auto max-w-6xl px-6 pb-12">
        <div className="grid gap-8 lg:grid-cols-2">
          <ActionCard
            name="Karen"
            role="Design Review"
            icon={<Palette className="h-5 w-5 text-white" />}
            gradient="bg-gradient-to-r from-violet-600 to-purple-500"
            accentText="text-violet-300"
            items={[
              {
                title: "Figma mockups — final colours, fonts & components",
                status: "overdue",
                statusLabel: "Overdue",
                issueNumber: 9,
              },
            ]}
            submitUrl={DESIGN_TEMPLATE_URL}
            submitLabel="Submit Design Feedback"
            submitDescription="Request a design change, flag a UI issue, or share updated mockups."
            steps={[
              "Click the button below — opens a simple form",
              "Pick the module and type of change from dropdowns",
              "Describe what needs to change",
              "Paste a Figma link or drag in screenshots",
              "Submit — Dennis gets notified automatically",
            ]}
          />

          <ActionCard
            name="Karthik"
            role="QA Testing"
            icon={<Bug className="h-5 w-5 text-white" />}
            gradient="bg-gradient-to-r from-blue-600 to-cyan-500"
            accentText="text-cyan-300"
            items={[
              {
                title: "Full platform QA sign-off",
                status: "pending",
                statusLabel: "Pending",
                issueNumber: 10,
              },
            ]}
            submitUrl={QA_TEMPLATE_URL}
            submitLabel="Report a Bug"
            submitDescription="Found something broken or confusing? Report it here."
            steps={[
              "Click the button below — opens a simple form",
              "Pick the module and type of issue from dropdowns",
              "Describe what happened and what you expected",
              "Add a screenshot if you can (drag and drop)",
              "Submit — Dennis gets notified automatically",
            ]}
          />
        </div>
      </section>

      {/* Blocking Items */}
      <section className="mx-auto max-w-6xl px-6 pb-12">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-white/50 mb-4">
            Blocking Items
          </h2>
          <div className="space-y-3">
            {[
              {
                item: "Figma design mockups",
                owner: "Karen",
                due: "Overdue",
                status: "overdue" as const,
              },
              {
                item: "AusIndustry R&D registration",
                owner: "Karen + accountant",
                due: "30 Apr 2026",
                status: "in-progress" as const,
              },
              {
                item: "QA sign-off",
                owner: "Karthik",
                due: "TBC",
                status: "pending" as const,
              },
            ].map((blocker) => (
              <div
                key={blocker.item}
                className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3"
              >
                <div className="flex-1">
                  <p className="text-sm font-medium text-white">
                    {blocker.item}
                  </p>
                  <p className="text-xs text-white/40">
                    {blocker.owner} · Due: {blocker.due}
                  </p>
                </div>
                <StatusBadge
                  status={blocker.status}
                  label={
                    blocker.status === "overdue"
                      ? "Overdue"
                      : blocker.status === "in-progress"
                        ? "In Progress"
                        : "Pending"
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How Decisions Work */}
      <section className="mx-auto max-w-6xl px-6 pb-12">
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl p-6">
          <h2 className="text-sm font-medium uppercase tracking-wider text-white/50 mb-4">
            How Decisions Get Made
          </h2>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              {
                label: "Accept",
                color: "bg-emerald-500/20 border-emerald-500/30 text-emerald-400",
                description: "Will be built this sprint",
              },
              {
                label: "Defer",
                color: "bg-amber-500/20 border-amber-500/30 text-amber-400",
                description: "Good idea — not this sprint",
              },
              {
                label: "Reject",
                color: "bg-red-500/20 border-red-500/30 text-red-400",
                description: "Won't implement (reason given)",
              },
            ].map((decision) => (
              <div
                key={decision.label}
                className={`flex flex-col items-center gap-2 rounded-xl border ${decision.color} bg-white/[0.02] p-4 text-center`}
              >
                <span className="text-sm font-bold">{decision.label}</span>
                <span className="text-xs text-white/50">
                  {decision.description}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-sm text-white/40">
            Dennis reviews every submission and labels it. Accepted items get
            built and deployed automatically.
          </p>
        </div>
      </section>

      {/* Footer / Contact */}
      <footer className="border-t border-white/10 mt-8">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-white/40">Questions?</p>
            <div className="flex items-center gap-6">
              <a
                href="https://wa.me/61402612471"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
              <a
                href="mailto:dennis@corporateaisolutions.com"
                className="inline-flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
              >
                <FileCheck className="h-4 w-4" />
                Email
              </a>
            </div>
            <p className="text-xs text-white/20 mt-4">
              MMC Build · Global Buildtech Australia Pty Ltd · Sprint 4
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
