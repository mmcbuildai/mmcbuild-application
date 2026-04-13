"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ShieldCheck,
  Hammer,
  Calculator,
  Users,
  GraduationCap,
  ArrowRight,
  Upload,
  FileSearch,
  ClipboardCheck,
  FileOutput,
  BarChart3,
  DollarSign,
  Search,
  Star,
  BookOpen,
  Award,
  CheckCircle2,
  ChevronRight,
  Layers,
  Timer,
  TrendingDown,
  Send,
  Play,
} from "lucide-react";

/* ── Types ── */
type ModuleKey = "comply" | "build" | "quote" | "direct" | "train";

interface WorkflowStep {
  icon: typeof Upload;
  title: string;
  description: string;
  mockUI: React.ReactNode;
}

/* ── Mock UI components for each step ── */

function MockFindingsCard() {
  const findings = [
    { severity: "High", title: "Fire resistance rating insufficient for external walls", clause: "NCC C1.9", color: "bg-red-100 text-red-700 border-red-200" },
    { severity: "Medium", title: "Waterproofing membrane continuity at wet area junctions", clause: "NCC F1.7", color: "bg-amber-100 text-amber-700 border-amber-200" },
    { severity: "Low", title: "Accessibility ramp gradient exceeds 1:14 at garage entry", clause: "NCC D3.3", color: "bg-blue-100 text-blue-700 border-blue-200" },
  ];
  return (
    <div className="space-y-2">
      {findings.map((f) => (
        <div key={f.clause} className={`rounded-lg border p-3 ${f.color}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold">{f.severity}</span>
            <span className="text-[10px] font-mono opacity-70">{f.clause}</span>
          </div>
          <p className="text-xs mt-1 leading-relaxed">{f.title}</p>
        </div>
      ))}
    </div>
  );
}

function MockUploadUI() {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <Upload className="h-8 w-8 text-slate-400 mx-auto mb-2" />
      <p className="text-sm font-medium text-slate-600">Drop building plans here</p>
      <p className="text-xs text-slate-400 mt-1">PDF, DWG, or image files up to 50MB</p>
      <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-xs font-medium text-white">
        <Upload className="h-3 w-3" /> Select Files
      </div>
    </div>
  );
}

function MockAnalysisRunning() {
  return (
    <div className="rounded-xl border bg-gradient-to-br from-blue-50 to-indigo-50 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
          <div className="h-4 w-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
        </div>
        <div>
          <p className="text-sm font-medium text-blue-900">AI Analysis Running</p>
          <p className="text-xs text-blue-600">Checking against NCC 2025 Volume Two...</p>
        </div>
      </div>
      <div className="space-y-2">
        {["Parsing building plans", "Extracting structural details", "Cross-referencing NCC clauses", "Generating findings"].map((step, i) => (
          <div key={step} className="flex items-center gap-2 text-xs text-blue-700">
            {i < 3 ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <div className="h-3 w-3 rounded-full border border-blue-400 border-t-transparent animate-spin" />}
            {step}
          </div>
        ))}
      </div>
    </div>
  );
}

function MockReportExport() {
  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Compliance Report</span>
        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Ready</span>
      </div>
      <div className="h-px bg-slate-100" />
      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        <div className="rounded-lg bg-red-50 p-2"><span className="text-lg font-bold text-red-600">3</span><br />High</div>
        <div className="rounded-lg bg-amber-50 p-2"><span className="text-lg font-bold text-amber-600">5</span><br />Medium</div>
        <div className="rounded-lg bg-blue-50 p-2"><span className="text-lg font-bold text-blue-600">2</span><br />Low</div>
      </div>
      <button className="w-full rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white flex items-center justify-center gap-2">
        <FileOutput className="h-3 w-3" /> Export PDF Report
      </button>
    </div>
  );
}

function MockSystemSelection() {
  const systems = [
    { name: "SIPs", selected: true },
    { name: "CLT / Mass Timber", selected: true },
    { name: "Steel Frame", selected: false },
    { name: "Volumetric Modular", selected: false },
  ];
  return (
    <div className="space-y-2">
      {systems.map((s) => (
        <div key={s.name} className={`flex items-center gap-3 rounded-lg border p-3 ${s.selected ? "border-teal-500 bg-teal-50" : "border-slate-200"}`}>
          <div className={`h-5 w-5 rounded border-2 flex items-center justify-center ${s.selected ? "border-teal-500 bg-teal-500" : "border-slate-300"}`}>
            {s.selected && <CheckCircle2 className="h-3 w-3 text-white" />}
          </div>
          <span className="text-sm font-medium">{s.name}</span>
        </div>
      ))}
    </div>
  );
}

function MockDesignSuggestions() {
  return (
    <div className="space-y-2">
      {[
        { title: "Switch to SIPs for external walls", saving: "12% material waste reduction", tag: "Recommended" },
        { title: "Prefab bathroom pods suit floor plan", saving: "3 weeks faster on-site", tag: "Opportunity" },
        { title: "CLT floor cassettes for level 1", saving: "Improved thermal performance", tag: "Optimisation" },
      ].map((s) => (
        <div key={s.title} className="rounded-lg border bg-white p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full">{s.tag}</span>
          </div>
          <p className="text-sm font-medium">{s.title}</p>
          <p className="text-xs text-muted-foreground mt-1">{s.saving}</p>
        </div>
      ))}
    </div>
  );
}

function MockCostComparison() {
  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cost Comparison</p>
      <div className="space-y-2">
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span>Traditional</span><span className="font-bold">$485,000</span>
          </div>
          <div className="h-6 rounded-full bg-slate-200 overflow-hidden">
            <div className="h-full bg-slate-500 rounded-full" style={{ width: "100%" }} />
          </div>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs mb-1">
            <span>MMC Approach</span><span className="font-bold text-green-600">$412,000</span>
          </div>
          <div className="h-6 rounded-full bg-green-100 overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: "85%" }} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 p-2">
        <TrendingDown className="h-4 w-4 text-green-600" />
        <span className="text-xs font-medium text-green-700">Save $73,000 (15%) with MMC</span>
      </div>
    </div>
  );
}

function MockHoldingCosts() {
  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Time Savings</p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-50 p-3 text-center">
          <p className="text-2xl font-bold text-slate-700">32</p>
          <p className="text-xs text-muted-foreground">weeks traditional</p>
        </div>
        <div className="rounded-lg bg-green-50 p-3 text-center">
          <p className="text-2xl font-bold text-green-600">22</p>
          <p className="text-xs text-muted-foreground">weeks MMC</p>
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-violet-50 border border-violet-200 p-2">
        <DollarSign className="h-4 w-4 text-violet-600" />
        <span className="text-xs font-medium text-violet-700">10 fewer weeks = $38,500 holding cost savings</span>
      </div>
    </div>
  );
}

function MockDirectorySearch() {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 rounded-lg border bg-white px-3 py-2 text-xs text-slate-400">Search trades...</div>
        <select className="rounded-lg border bg-white px-2 py-2 text-xs"><option>NSW</option></select>
        <select className="rounded-lg border bg-white px-2 py-2 text-xs"><option>SIPs Installer</option></select>
      </div>
      {[
        { name: "ModBuild Australia", type: "Builder", rating: 4.8, reviews: 12, region: "NSW, VIC" },
        { name: "Prefab Solutions Co", type: "Supplier", rating: 4.5, reviews: 8, region: "NSW" },
      ].map((p) => (
        <div key={p.name} className="flex items-center gap-3 rounded-lg border bg-white p-3">
          <div className="h-10 w-10 rounded-lg bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-sm">{p.name[0]}</div>
          <div className="flex-1">
            <p className="text-sm font-medium">{p.name}</p>
            <p className="text-xs text-muted-foreground">{p.type} &middot; {p.region}</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              <span className="text-xs font-medium">{p.rating}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">{p.reviews} reviews</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function MockProfileCard() {
  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-amber-100 flex items-center justify-center text-amber-700 font-bold text-lg">M</div>
        <div>
          <p className="font-semibold">ModBuild Australia</p>
          <p className="text-xs text-muted-foreground">MMC Builder &middot; Sydney, NSW</p>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        {["SIPs", "CLT", "Volumetric"].map((s) => (
          <span key={s} className="text-[10px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-200">{s}</span>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="flex-1 rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-white flex items-center justify-center gap-1">
          <Send className="h-3 w-3" /> Send Enquiry
        </button>
        <button className="rounded-lg border px-3 py-2 text-xs font-medium">View Portfolio</button>
      </div>
    </div>
  );
}

function MockCourseCatalog() {
  return (
    <div className="space-y-2">
      {[
        { title: "Introduction to SIPs Construction", lessons: 6, difficulty: "Beginner", progress: 0 },
        { title: "NCC 2025 Compliance Essentials", lessons: 8, difficulty: "Intermediate", progress: 0 },
        { title: "Prefab Bathroom Pod Installation", lessons: 4, difficulty: "Advanced", progress: 0 },
      ].map((c) => (
        <div key={c.title} className="flex items-center gap-3 rounded-lg border bg-white p-3">
          <div className="h-10 w-10 rounded-lg bg-indigo-100 flex items-center justify-center">
            <BookOpen className="h-5 w-5 text-indigo-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium">{c.title}</p>
            <p className="text-xs text-muted-foreground">{c.lessons} lessons &middot; {c.difficulty}</p>
          </div>
          <button className="text-xs bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium">Enrol</button>
        </div>
      ))}
    </div>
  );
}

function MockLessonQuiz() {
  return (
    <div className="rounded-xl border bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full">Quiz</span>
        <span className="text-xs text-muted-foreground">Question 2 of 5</span>
      </div>
      <p className="text-sm font-medium">What is the minimum R-value for a SIPs external wall panel in Climate Zone 6?</p>
      <div className="space-y-2">
        {["R2.0", "R2.8", "R3.5", "R4.0"].map((opt, i) => (
          <div key={opt} className={`flex items-center gap-2 rounded-lg border p-2.5 text-xs ${i === 2 ? "border-green-500 bg-green-50" : "border-slate-200"}`}>
            <div className={`h-4 w-4 rounded-full border-2 ${i === 2 ? "border-green-500 bg-green-500" : "border-slate-300"}`}>
              {i === 2 && <CheckCircle2 className="h-3 w-3 text-white" />}
            </div>
            {opt}
          </div>
        ))}
      </div>
    </div>
  );
}

function MockCertificate() {
  return (
    <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white p-5 text-center">
      <Award className="h-10 w-10 text-indigo-500 mx-auto mb-2" />
      <p className="text-sm font-bold text-indigo-900">Certificate of Completion</p>
      <p className="text-xs text-indigo-600 mt-1">Introduction to SIPs Construction</p>
      <div className="mt-3 h-px bg-indigo-100" />
      <p className="text-[10px] text-muted-foreground mt-2">Issued by MMC Build &middot; April 2026</p>
    </div>
  );
}

/* ── Module definitions ── */
const MODULES: Record<ModuleKey, {
  name: string;
  tagline: string;
  icon: typeof ShieldCheck;
  gradient: string;
  accentBg: string;
  steps: WorkflowStep[];
}> = {
  comply: {
    name: "MMC Comply",
    tagline: "AI-powered NCC compliance checking",
    icon: ShieldCheck,
    gradient: "from-blue-500 to-blue-600",
    accentBg: "bg-blue-50",
    steps: [
      {
        icon: Upload,
        title: "Upload Building Plans",
        description: "Upload your PDF plans, DWG files, or images. The AI extracts structural and design details automatically.",
        mockUI: <MockUploadUI />,
      },
      {
        icon: FileSearch,
        title: "AI Analyses Against NCC 2025",
        description: "The compliance engine cross-references your plans against NCC Volume Two, checking fire safety, waterproofing, accessibility, and more.",
        mockUI: <MockAnalysisRunning />,
      },
      {
        icon: ClipboardCheck,
        title: "Review Findings by Severity",
        description: "Get a prioritised list of compliance findings — high, medium, and low — each citing the specific NCC clause.",
        mockUI: <MockFindingsCard />,
      },
      {
        icon: FileOutput,
        title: "Export & Share Reports",
        description: "Export the full compliance report as PDF. Share individual findings with trades and assign remediation tasks.",
        mockUI: <MockReportExport />,
      },
    ],
  },
  build: {
    name: "MMC Build",
    tagline: "Design optimisation for modern construction",
    icon: Hammer,
    gradient: "from-teal-500 to-teal-600",
    accentBg: "bg-teal-50",
    steps: [
      {
        icon: Layers,
        title: "Select Construction Systems",
        description: "Choose which MMC systems apply to your project — SIPs, CLT, steel frame, volumetric modular, or hybrid approaches.",
        mockUI: <MockSystemSelection />,
      },
      {
        icon: Upload,
        title: "Upload Plans for Analysis",
        description: "Upload your building plans. The AI analyses spatial layout, structural elements, and identifies optimisation opportunities.",
        mockUI: <MockUploadUI />,
      },
      {
        icon: FileSearch,
        title: "AI Generates Design Suggestions",
        description: "Get actionable suggestions to reduce waste, improve buildability, and identify where MMC methods outperform traditional construction.",
        mockUI: <MockDesignSuggestions />,
      },
      {
        icon: BarChart3,
        title: "Buildability Score & Report",
        description: "Receive a buildability score with specific recommendations. Results feed directly into MMC Quote for cost comparison.",
        mockUI: <MockReportExport />,
      },
    ],
  },
  quote: {
    name: "MMC Quote",
    tagline: "Agentic cost estimation with Australian benchmarks",
    icon: Calculator,
    gradient: "from-violet-500 to-violet-600",
    accentBg: "bg-violet-50",
    steps: [
      {
        icon: Play,
        title: "Run Cost Estimation",
        description: "An AI agent analyses your project details, pulling from 70+ Australian rate benchmarks to build a line-by-line cost estimate.",
        mockUI: <MockAnalysisRunning />,
      },
      {
        icon: BarChart3,
        title: "Traditional vs MMC Comparison",
        description: "See a side-by-side cost breakdown — traditional construction versus your selected MMC approach — with percentage savings.",
        mockUI: <MockCostComparison />,
      },
      {
        icon: Timer,
        title: "Holding Cost Calculator",
        description: "Factor in finance costs, site overheads, insurance, and opportunity costs. See how faster MMC timelines reduce total project cost.",
        mockUI: <MockHoldingCosts />,
      },
      {
        icon: FileOutput,
        title: "Export Quote as PDF or Word",
        description: "Download the full cost estimate with line items, comparisons, and savings summary — ready to share with clients or stakeholders.",
        mockUI: <MockReportExport />,
      },
    ],
  },
  direct: {
    name: "MMC Direct",
    tagline: "Find MMC-capable trades across Australia",
    icon: Users,
    gradient: "from-amber-500 to-amber-600",
    accentBg: "bg-amber-50",
    steps: [
      {
        icon: Search,
        title: "Search by Trade & Region",
        description: "Find verified MMC professionals — builders, suppliers, specialists — filtered by trade type, state, and specialisation.",
        mockUI: <MockDirectorySearch />,
      },
      {
        icon: Star,
        title: "View Profiles & Reviews",
        description: "Browse company profiles with portfolios, certifications, insurance status, and ratings from other MMC Build users.",
        mockUI: <MockProfileCard />,
      },
      {
        icon: Send,
        title: "Send Direct Enquiries",
        description: "Contact professionals directly through the platform. Track enquiry status and responses in your dashboard.",
        mockUI: <MockProfileCard />,
      },
      {
        icon: ClipboardCheck,
        title: "Verified & Rated",
        description: "After working together, leave reviews to help the community. All listings are verified for insurance and certification status.",
        mockUI: <MockDirectorySearch />,
      },
    ],
  },
  train: {
    name: "MMC Train",
    tagline: "Self-paced training for your team",
    icon: GraduationCap,
    gradient: "from-indigo-500 to-indigo-600",
    accentBg: "bg-indigo-50",
    steps: [
      {
        icon: BookOpen,
        title: "Browse Course Catalog",
        description: "Find courses on MMC systems, NCC compliance, trade skills, and more. Filter by difficulty — beginner to advanced.",
        mockUI: <MockCourseCatalog />,
      },
      {
        icon: Play,
        title: "Complete Lessons & Quizzes",
        description: "Work through structured lessons with AI-generated content. Take quizzes to test your knowledge with instant feedback.",
        mockUI: <MockLessonQuiz />,
      },
      {
        icon: BarChart3,
        title: "Track Team Progress",
        description: "Monitor completion rates across your team. See who has finished which modules and where knowledge gaps exist.",
        mockUI: <MockCourseCatalog />,
      },
      {
        icon: Award,
        title: "Earn Certificates",
        description: "Complete all lessons and pass quizzes to earn a downloadable certificate. Add it to your professional profile.",
        mockUI: <MockCertificate />,
      },
    ],
  },
};

const MODULE_ORDER: ModuleKey[] = ["comply", "build", "quote", "direct", "train"];

/* ── Main demo page ── */
const STEP_DURATION = 4000; // 4 seconds per step

export default function DemoPage() {
  const [activeModule, setActiveModule] = useState<ModuleKey>("comply");
  const [activeStep, setActiveStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mod = MODULES[activeModule];
  const step = mod.steps[activeStep];
  const isLastStep = activeStep === mod.steps.length - 1;
  const isLastModule = MODULE_ORDER.indexOf(activeModule) === MODULE_ORDER.length - 1;

  const clearTimers = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (progressRef.current) { clearInterval(progressRef.current); progressRef.current = null; }
  }, []);

  // Auto-advance steps
  useEffect(() => {
    clearTimers();
    setProgress(0);

    if (!isPlaying || isLastStep) return;

    // Progress bar animation (updates every 50ms for smooth bar)
    const startTime = Date.now();
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      setProgress(Math.min((elapsed / STEP_DURATION) * 100, 100));
    }, 50);

    // Step advance
    timerRef.current = setInterval(() => {
      setActiveStep((prev) => prev + 1);
    }, STEP_DURATION);

    return clearTimers;
  }, [activeStep, activeModule, isPlaying, isLastStep, clearTimers]);

  function handleModuleChange(key: ModuleKey) {
    clearTimers();
    setActiveModule(key);
    setActiveStep(0);
    setIsPlaying(true);
    setProgress(0);
  }

  function handleNextModule() {
    const idx = MODULE_ORDER.indexOf(activeModule);
    if (idx < MODULE_ORDER.length - 1) {
      handleModuleChange(MODULE_ORDER[idx + 1]);
    }
  }

  function handleReplay() {
    setActiveStep(0);
    setIsPlaying(true);
    setProgress(0);
  }

  return (
    <div className="min-h-screen bg-[#0B1120]">
      {/* Nav */}
      <nav className="sticky top-0 z-50 border-b border-white/10 bg-[#0B1120]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500 to-cyan-600">
              <span className="font-bold text-white text-sm">M</span>
            </div>
            <span className="text-lg font-bold text-white tracking-tight">
              MMC Build
            </span>
          </div>
          <a
            href="/signup"
            className="inline-flex items-center gap-2 rounded-full bg-teal-600 px-5 py-2 text-sm font-medium text-white hover:bg-teal-500 transition-all"
          >
            Start Free Trial
            <ArrowRight className="h-3.5 w-3.5" />
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
              Platform Demo
            </span>
          </div>
          <h1 className="text-4xl font-extrabold text-white leading-tight lg:text-5xl">
            AI-Powered Construction
            <br />
            <span className="text-teal-400">Intelligence</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-white/50">
            Five integrated modules that take your residential construction
            project from compliance to completion — faster and cheaper with
            modern methods of construction.
          </p>

          {/* Pipeline */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            {MODULE_ORDER.map((key, i) => {
              const m = MODULES[key];
              const Icon = m.icon;
              const isActive = activeModule === key;
              return (
                <div key={key} className="flex items-center gap-2">
                  {i > 0 && <ChevronRight className="h-4 w-4 text-white/20" />}
                  <button
                    onClick={() => handleModuleChange(key)}
                    className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-all ${
                      isActive
                        ? "bg-white/15 text-white border border-white/20"
                        : "text-white/40 hover:text-white/70"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {m.name.replace("MMC ", "")}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Module demo area */}
      <section className="mx-auto max-w-6xl px-6 pb-16">
        {/* Module header */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.04] backdrop-blur-xl overflow-hidden">
          <div className={`bg-gradient-to-r ${mod.gradient} px-8 py-6`}>
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                <mod.icon className="h-6 w-6 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{mod.name}</h2>
                <p className="text-sm text-white/70">{mod.tagline}</p>
              </div>
            </div>
          </div>

          {/* Step progress bar */}
          <div className="px-8 pt-4 flex gap-1.5">
            {mod.steps.map((_, i) => (
              <div key={i} className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    i < activeStep
                      ? "bg-white w-full"
                      : i === activeStep && !isLastStep
                        ? "bg-white/70"
                        : i === activeStep && isLastStep
                          ? "bg-white w-full"
                          : "w-0"
                  }`}
                  style={
                    i === activeStep && !isLastStep
                      ? { width: `${progress}%`, transition: "width 50ms linear" }
                      : undefined
                  }
                />
              </div>
            ))}
          </div>

          {/* Step tabs (visual, non-interactive during autoplay) */}
          <div className="border-b border-white/10 px-8 flex gap-1 overflow-x-auto">
            {mod.steps.map((s, i) => (
              <div
                key={i}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
                  i < activeStep
                    ? "border-transparent text-white/60"
                    : activeStep === i
                      ? "border-white text-white"
                      : "border-transparent text-white/25"
                }`}
              >
                <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  i < activeStep
                    ? "bg-white/20"
                    : i === activeStep
                      ? "bg-white/15"
                      : "bg-white/5"
                }`}>
                  {i < activeStep ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </span>
                {s.title}
              </div>
            ))}
          </div>

          {/* Step content */}
          <div className="p-8">
            <div className="grid gap-8 lg:grid-cols-2">
              {/* Description */}
              <div className="flex flex-col justify-center">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${mod.gradient}`}>
                    <step.icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <p className="text-xs text-white/40 uppercase tracking-wider">Step {activeStep + 1} of {mod.steps.length}</p>
                    <h3 className="text-lg font-bold text-white">{step.title}</h3>
                  </div>
                </div>
                <p className="text-white/60 leading-relaxed">
                  {step.description}
                </p>

                {/* Actions — only show when autoplay pauses at last step */}
                {isLastStep && (
                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handleReplay}
                      className="rounded-lg border border-white/20 px-4 py-2.5 text-sm font-medium text-white/70 hover:text-white hover:border-white/40 transition-colors"
                    >
                      Replay
                    </button>
                    {!isLastModule ? (
                      <button
                        onClick={handleNextModule}
                        className={`rounded-lg bg-gradient-to-r ${mod.gradient} px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity flex items-center gap-2`}
                      >
                        Next Module: {MODULES[MODULE_ORDER[MODULE_ORDER.indexOf(activeModule) + 1]].name}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    ) : (
                      <a
                        href="/signup"
                        className={`rounded-lg bg-gradient-to-r ${mod.gradient} px-6 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity flex items-center gap-2`}
                      >
                        Start Free Trial
                        <ArrowRight className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                )}
              </div>

              {/* Mock UI preview */}
              <div className={`rounded-xl ${mod.accentBg} p-5 border border-white/5`}>
                {step.mockUI}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/10">
        <div className="mx-auto max-w-6xl px-6 py-16 text-center">
          <h2 className="text-2xl font-bold text-white">
            Ready to build smarter?
          </h2>
          <p className="text-white/50 mt-2">
            14-day free trial. All 5 modules unlocked. No credit card required.
          </p>
          <a
            href="/signup"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-teal-600 px-8 py-3 text-sm font-medium text-white hover:bg-teal-500 transition-all"
          >
            Start Free Trial
            <ArrowRight className="h-4 w-4" />
          </a>
          <p className="text-xs text-white/20 mt-8">
            MMC Build &middot; Global Buildtech Australia Pty Ltd
          </p>
        </div>
      </section>
    </div>
  );
}
