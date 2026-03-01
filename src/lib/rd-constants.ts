import type { RdTag } from "@/lib/supabase/types";

export const RD_STAGES = [
  { value: "stage_0", label: "Stage 0 — Foundation" },
  { value: "stage_1", label: "Stage 1 — MMC Comply" },
  { value: "stage_2", label: "Stage 2 — MMC Build" },
  { value: "stage_3", label: "Stage 3 — MMC Quote" },
  { value: "stage_4", label: "Stage 4 — MMC Direct" },
  { value: "stage_5", label: "Stage 5 — MMC Train" },
  { value: "stage_6", label: "Stage 6 — Billing & Payments" },
] as const;

export const RD_DELIVERABLES = [
  { value: "ai_compliance_engine", label: "AI Compliance Analysis Engine" },
  { value: "rag_pipeline", label: "RAG Pipeline & Embeddings" },
  { value: "ncc_knowledge_base", label: "NCC Knowledge Base Ingestion" },
  { value: "design_optimisation", label: "Design Optimisation AI" },
  { value: "cost_estimation", label: "AI Cost Estimation" },
  { value: "trade_matching", label: "Trade Matching Algorithm" },
  { value: "training_content_ai", label: "Training Content Generation" },
  { value: "pdf_report_gen", label: "PDF Report Generation" },
  { value: "auth_rbac", label: "Auth & RBAC System" },
  { value: "database_schema", label: "Database Schema & RLS" },
  { value: "ui_dashboard", label: "UI & Dashboard" },
  { value: "testing_qa", label: "Testing & QA" },
  { value: "devops_infra", label: "DevOps & Infrastructure" },
  { value: "other", label: "Other" },
] as const;

export const RD_TAG_OPTIONS = [
  { value: "core_rd" as RdTag, label: "Core R&D", description: "Novel technical uncertainty resolution" },
  { value: "rd_supporting" as RdTag, label: "R&D Supporting", description: "Directly supports core R&D activities" },
  { value: "not_eligible" as RdTag, label: "Not Eligible", description: "Standard development, not R&D" },
] as const;
