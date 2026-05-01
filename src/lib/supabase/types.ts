export type UserRole =
  | "owner"
  | "admin"
  | "project_manager"
  | "architect"
  | "builder"
  | "trade"
  | "viewer";

export type ProjectStatus =
  | "draft"
  | "active"
  | "completed"
  | "archived";

export type PlanStatus =
  | "uploading"
  | "processing"
  | "ready"
  | "error";

export type CheckStatus =
  | "queued"
  | "processing"
  | "completed"
  | "error";

export type RiskLevel =
  | "low"
  | "medium"
  | "high"
  | "critical";

export type FindingSeverity =
  | "compliant"
  | "advisory"
  | "non_compliant"
  | "critical";

export type KbScope = "system" | "org";

export type KbDocumentStatus = "pending" | "processing" | "ready" | "error";

export type RdTag = "core_rd" | "rd_supporting" | "not_eligible";

export type ExperimentStatus = "planned" | "in_progress" | "completed";

export type CommitLogStatus = "pending" | "processing" | "classified" | "error";

export type ReviewStatus = "pending" | "approved" | "rejected";

export type CertType =
  | "structural"
  | "geotechnical"
  | "energy_nathers"
  | "energy_jv3"
  | "bushfire_bal"
  | "acoustic"
  | "hydraulic"
  | "electrical"
  | "waterproofing"
  | "form_15_qld"
  | "form_16_qld"
  | "form_21_qld"
  | "cdc_nsw"
  | "cc_nsw"
  | "oc_nsw"
  | "building_permit_vic"
  | "reg_126_vic"
  | "design_compliance_wa"
  | "building_rules_sa"
  | "likely_compliance_tas"
  | "other";

export type CertStatus = "uploading" | "processing" | "ready" | "error";

export type RemediationStatus =
  | "awaiting"
  | "acknowledged"
  | "in_progress"
  | "completed"
  | "disputed";

export type InvitationStatus = "pending" | "accepted" | "expired" | "revoked";

export interface OrgInvitation {
  id: string;
  org_id: string;
  email: string;
  role: UserRole;
  invited_by: string;
  status: InvitationStatus;
  token: string;
  expires_at: string;
  accepted_at: string | null;
  created_at: string;
}

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      ai_usage_log: {
        Row: {
          ai_function: string
          cache_creation_tokens: number | null
          cache_read_tokens: number | null
          check_id: string | null
          created_at: string | null
          error_message: string | null
          estimated_cost_usd: number | null
          id: string
          input_tokens: number | null
          latency_ms: number | null
          model_id: string
          org_id: string | null
          output_tokens: number | null
          provider: string
          was_fallback: boolean | null
        }
        Insert: {
          ai_function: string
          cache_creation_tokens?: number | null
          cache_read_tokens?: number | null
          check_id?: string | null
          created_at?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_id: string
          org_id?: string | null
          output_tokens?: number | null
          provider: string
          was_fallback?: boolean | null
        }
        Update: {
          ai_function?: string
          cache_creation_tokens?: number | null
          cache_read_tokens?: number | null
          check_id?: string | null
          created_at?: string | null
          error_message?: string | null
          estimated_cost_usd?: number | null
          id?: string
          input_tokens?: number | null
          latency_ms?: number | null
          model_id?: string
          org_id?: string | null
          output_tokens?: number | null
          provider?: string
          was_fallback?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_log_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "compliance_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          details: Json | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          org_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          org_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          org_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_feedback: {
        Row: {
          completed_at: string | null
          created_at: string | null
          feedback: string | null
          id: string
          module_id: string
          org_id: string
          rating: number | null
          started_at: string | null
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          feedback?: string | null
          id?: string
          module_id: string
          org_id: string
          rating?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          feedback?: string | null
          id?: string
          module_id?: string
          org_id?: string
          rating?: number | null
          started_at?: string | null
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      certificates: {
        Row: {
          cert_number: string
          course_id: string
          enrollment_id: string
          id: string
          issued_at: string
          pdf_url: string | null
          profile_id: string
        }
        Insert: {
          cert_number: string
          course_id: string
          enrollment_id: string
          id?: string
          issued_at?: string
          pdf_url?: string | null
          profile_id: string
        }
        Update: {
          cert_number?: string
          course_id?: string
          enrollment_id?: string
          id?: string
          issued_at?: string
          pdf_url?: string | null
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_checks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          error_message: string | null
          id: string
          org_id: string
          overall_risk: Database["public"]["Enums"]["risk_level"] | null
          plan_id: string
          progress_completed: string[] | null
          progress_current: string | null
          project_id: string
          questionnaire_id: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["check_status"]
          summary: string | null
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          error_message?: string | null
          id?: string
          org_id: string
          overall_risk?: Database["public"]["Enums"]["risk_level"] | null
          plan_id: string
          progress_completed?: string[] | null
          progress_current?: string | null
          project_id: string
          questionnaire_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["check_status"]
          summary?: string | null
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          error_message?: string | null
          id?: string
          org_id?: string
          overall_risk?: Database["public"]["Enums"]["risk_level"] | null
          plan_id?: string
          progress_completed?: string[] | null
          progress_current?: string | null
          project_id?: string
          questionnaire_id?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["check_status"]
          summary?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compliance_checks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_checks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_checks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_checks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_checks_questionnaire_id_fkey"
            columns: ["questionnaire_id"]
            isOneToOne: false
            referencedRelation: "questionnaire_responses"
            referencedColumns: ["id"]
          },
        ]
      }
      compliance_findings: {
        Row: {
          agreement_score: number | null
          amended_action: string | null
          amended_description: string | null
          amended_discipline:
            | Database["public"]["Enums"]["contributor_discipline"]
            | null
          assigned_contributor_id: string | null
          category: string
          check_id: string
          confidence: number
          description: string
          id: string
          ncc_citation: string | null
          ncc_section: string
          page_references: number[] | null
          recommendation: string | null
          rejection_reason: string | null
          remediation_action: string | null
          remediation_responded_at: string | null
          remediation_status:
            | Database["public"]["Enums"]["remediation_status"]
            | null
          responsible_discipline:
            | Database["public"]["Enums"]["contributor_discipline"]
            | null
          review_status:
            | Database["public"]["Enums"]["finding_review_status"]
            | null
          reviewed_at: string | null
          reviewed_by: string | null
          secondary_model: string | null
          sent_at: string | null
          severity: Database["public"]["Enums"]["finding_severity"]
          sort_order: number
          source_chunk_ids: string[] | null
          title: string
          validation_tier: number | null
          was_reconciled: boolean | null
        }
        Insert: {
          agreement_score?: number | null
          amended_action?: string | null
          amended_description?: string | null
          amended_discipline?:
            | Database["public"]["Enums"]["contributor_discipline"]
            | null
          assigned_contributor_id?: string | null
          category: string
          check_id: string
          confidence?: number
          description: string
          id?: string
          ncc_citation?: string | null
          ncc_section: string
          page_references?: number[] | null
          recommendation?: string | null
          rejection_reason?: string | null
          remediation_action?: string | null
          remediation_responded_at?: string | null
          remediation_status?:
            | Database["public"]["Enums"]["remediation_status"]
            | null
          responsible_discipline?:
            | Database["public"]["Enums"]["contributor_discipline"]
            | null
          review_status?:
            | Database["public"]["Enums"]["finding_review_status"]
            | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          secondary_model?: string | null
          sent_at?: string | null
          severity?: Database["public"]["Enums"]["finding_severity"]
          sort_order?: number
          source_chunk_ids?: string[] | null
          title: string
          validation_tier?: number | null
          was_reconciled?: boolean | null
        }
        Update: {
          agreement_score?: number | null
          amended_action?: string | null
          amended_description?: string | null
          amended_discipline?:
            | Database["public"]["Enums"]["contributor_discipline"]
            | null
          assigned_contributor_id?: string | null
          category?: string
          check_id?: string
          confidence?: number
          description?: string
          id?: string
          ncc_citation?: string | null
          ncc_section?: string
          page_references?: number[] | null
          recommendation?: string | null
          rejection_reason?: string | null
          remediation_action?: string | null
          remediation_responded_at?: string | null
          remediation_status?:
            | Database["public"]["Enums"]["remediation_status"]
            | null
          responsible_discipline?:
            | Database["public"]["Enums"]["contributor_discipline"]
            | null
          review_status?:
            | Database["public"]["Enums"]["finding_review_status"]
            | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          secondary_model?: string | null
          sent_at?: string | null
          severity?: Database["public"]["Enums"]["finding_severity"]
          sort_order?: number
          source_chunk_ids?: string[] | null
          title?: string
          validation_tier?: number | null
          was_reconciled?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "compliance_findings_assigned_contributor_id_fkey"
            columns: ["assigned_contributor_id"]
            isOneToOne: false
            referencedRelation: "project_contributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_findings_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "compliance_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "compliance_findings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_estimates: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          mmc_duration_weeks: number | null
          org_id: string
          plan_id: string
          project_id: string
          region: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["cost_estimate_status"]
          summary: string | null
          total_mmc: number | null
          total_savings_pct: number | null
          total_traditional: number | null
          traditional_duration_weeks: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          mmc_duration_weeks?: number | null
          org_id: string
          plan_id: string
          project_id: string
          region?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["cost_estimate_status"]
          summary?: string | null
          total_mmc?: number | null
          total_savings_pct?: number | null
          total_traditional?: number | null
          traditional_duration_weeks?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          mmc_duration_weeks?: number | null
          org_id?: string
          plan_id?: string
          project_id?: string
          region?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["cost_estimate_status"]
          summary?: string | null
          total_mmc?: number | null
          total_savings_pct?: number | null
          total_traditional?: number | null
          traditional_duration_weeks?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_estimates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_estimates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_estimates_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cost_estimates_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_line_items: {
        Row: {
          confidence: number
          cost_category: string
          created_at: string
          element_description: string
          estimate_id: string
          id: string
          mmc_alternative: string | null
          mmc_rate: number | null
          mmc_total: number | null
          quantity: number | null
          rate_source_detail: string | null
          rate_source_name: string | null
          savings_pct: number | null
          sort_order: number
          source: Database["public"]["Enums"]["cost_line_source"]
          traditional_rate: number | null
          traditional_total: number | null
          unit: string | null
        }
        Insert: {
          confidence?: number
          cost_category: string
          created_at?: string
          element_description: string
          estimate_id: string
          id?: string
          mmc_alternative?: string | null
          mmc_rate?: number | null
          mmc_total?: number | null
          quantity?: number | null
          rate_source_detail?: string | null
          rate_source_name?: string | null
          savings_pct?: number | null
          sort_order?: number
          source?: Database["public"]["Enums"]["cost_line_source"]
          traditional_rate?: number | null
          traditional_total?: number | null
          unit?: string | null
        }
        Update: {
          confidence?: number
          cost_category?: string
          created_at?: string
          element_description?: string
          estimate_id?: string
          id?: string
          mmc_alternative?: string | null
          mmc_rate?: number | null
          mmc_total?: number | null
          quantity?: number | null
          rate_source_detail?: string | null
          rate_source_name?: string | null
          savings_pct?: number | null
          sort_order?: number
          source?: Database["public"]["Enums"]["cost_line_source"]
          traditional_rate?: number | null
          traditional_total?: number | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cost_line_items_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: false
            referencedRelation: "cost_estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_rate_sources: {
        Row: {
          config: Json
          created_at: string
          id: string
          is_active: boolean
          last_synced_at: string | null
          name: string
          source_type: string
        }
        Insert: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          name: string
          source_type: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          last_synced_at?: string | null
          name?: string
          source_type?: string
        }
        Relationships: []
      }
      cost_reference_rates: {
        Row: {
          base_rate: number
          category: string
          created_at: string
          effective_date: string | null
          element: string
          expires_at: string | null
          id: string
          source: string
          source_detail: string | null
          source_id: string | null
          state: string
          unit: string
          year: number
        }
        Insert: {
          base_rate: number
          category: string
          created_at?: string
          effective_date?: string | null
          element: string
          expires_at?: string | null
          id?: string
          source?: string
          source_detail?: string | null
          source_id?: string | null
          state?: string
          unit: string
          year?: number
        }
        Update: {
          base_rate?: number
          category?: string
          created_at?: string
          effective_date?: string | null
          element?: string
          expires_at?: string | null
          id?: string
          source?: string
          source_detail?: string | null
          source_id?: string | null
          state?: string
          unit?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "cost_reference_rates_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "cost_rate_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          category: string
          created_at: string
          created_by_org_id: string
          created_by_profile_id: string
          description: string | null
          difficulty: Database["public"]["Enums"]["course_difficulty"]
          enrollment_count: number
          estimated_duration_minutes: number
          fts: unknown
          id: string
          lesson_count: number
          slug: string
          status: Database["public"]["Enums"]["course_status"]
          thumbnail_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by_org_id: string
          created_by_profile_id: string
          description?: string | null
          difficulty?: Database["public"]["Enums"]["course_difficulty"]
          enrollment_count?: number
          estimated_duration_minutes?: number
          fts?: unknown
          id?: string
          lesson_count?: number
          slug: string
          status?: Database["public"]["Enums"]["course_status"]
          thumbnail_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by_org_id?: string
          created_by_profile_id?: string
          description?: string | null
          difficulty?: Database["public"]["Enums"]["course_difficulty"]
          enrollment_count?: number
          estimated_duration_minutes?: number
          fts?: unknown
          id?: string
          lesson_count?: number
          slug?: string
          status?: Database["public"]["Enums"]["course_status"]
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_created_by_org_id_fkey"
            columns: ["created_by_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_created_by_profile_id_fkey"
            columns: ["created_by_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      design_checks: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          id: string
          org_id: string
          plan_id: string
          project_id: string
          spatial_layout: Json | null
          started_at: string | null
          status: Database["public"]["Enums"]["design_check_status"]
          summary: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          id?: string
          org_id: string
          plan_id: string
          project_id: string
          spatial_layout?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["design_check_status"]
          summary?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          id?: string
          org_id?: string
          plan_id?: string
          project_id?: string
          spatial_layout?: Json | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["design_check_status"]
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "design_checks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_checks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_checks_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "design_checks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      design_suggestions: {
        Row: {
          affected_room_ids: string[] | null
          affected_wall_ids: string[] | null
          benefits: string
          check_id: string
          confidence: number
          created_at: string
          current_approach: string
          estimated_cost_savings: number | null
          estimated_time_savings: number | null
          estimated_waste_reduction: number | null
          id: string
          implementation_complexity: Database["public"]["Enums"]["implementation_complexity"]
          sort_order: number
          suggested_alternative: string
          technology_category: string
        }
        Insert: {
          affected_room_ids?: string[] | null
          affected_wall_ids?: string[] | null
          benefits: string
          check_id: string
          confidence?: number
          created_at?: string
          current_approach: string
          estimated_cost_savings?: number | null
          estimated_time_savings?: number | null
          estimated_waste_reduction?: number | null
          id?: string
          implementation_complexity?: Database["public"]["Enums"]["implementation_complexity"]
          sort_order?: number
          suggested_alternative: string
          technology_category: string
        }
        Update: {
          affected_room_ids?: string[] | null
          affected_wall_ids?: string[] | null
          benefits?: string
          check_id?: string
          confidence?: number
          created_at?: string
          current_approach?: string
          estimated_cost_savings?: number | null
          estimated_time_savings?: number | null
          estimated_waste_reduction?: number | null
          id?: string
          implementation_complexity?: Database["public"]["Enums"]["implementation_complexity"]
          sort_order?: number
          suggested_alternative?: string
          technology_category?: string
        }
        Relationships: [
          {
            foreignKeyName: "design_suggestions_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "design_checks"
            referencedColumns: ["id"]
          },
        ]
      }
      directory_enquiries: {
        Row: {
          created_at: string
          id: string
          message: string
          professional_id: string
          project_id: string | null
          read_at: string | null
          sender_name: string
          sender_org_id: string
          status: string
          subject: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          professional_id: string
          project_id?: string | null
          read_at?: string | null
          sender_name: string
          sender_org_id: string
          status?: string
          subject: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          professional_id?: string
          project_id?: string | null
          read_at?: string | null
          sender_name?: string
          sender_org_id?: string
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "directory_enquiries_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directory_enquiries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directory_enquiries_sender_org_id_fkey"
            columns: ["sender_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      directory_listings: {
        Row: {
          abn: string | null
          admin_notes: string | null
          categories: string[]
          company_name: string
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string | null
          description: string | null
          id: string
          licences_held: string | null
          location: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          service_area: string[] | null
          status: string
          updated_at: string | null
        }
        Insert: {
          abn?: string | null
          admin_notes?: string | null
          categories?: string[]
          company_name: string
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          licences_held?: string | null
          location?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_area?: string[] | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          abn?: string | null
          admin_notes?: string | null
          categories?: string[]
          company_name?: string
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string | null
          description?: string | null
          id?: string
          licences_held?: string | null
          location?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          service_area?: string[] | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "directory_listings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      directory_reviews: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          professional_id: string
          rating: number
          reviewer_name: string
          reviewer_org_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          professional_id: string
          rating: number
          reviewer_name: string
          reviewer_org_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          professional_id?: string
          rating?: number
          reviewer_name?: string
          reviewer_org_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "directory_reviews_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directory_reviews_reviewer_org_id_fkey"
            columns: ["reviewer_org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      document_embeddings: {
        Row: {
          chunk_index: number
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json
          org_id: string
          search_vector: unknown
          source_id: string
          source_type: string
          updated_at: string
        }
        Insert: {
          chunk_index?: number
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          org_id: string
          search_vector?: unknown
          source_id: string
          source_type: string
          updated_at?: string
        }
        Update: {
          chunk_index?: number
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          org_id?: string
          search_vector?: unknown
          source_id?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_embeddings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          completed_at: string | null
          course_id: string
          enrolled_at: string
          id: string
          org_id: string
          profile_id: string
          progress_pct: number
          status: Database["public"]["Enums"]["enrollment_status"]
        }
        Insert: {
          completed_at?: string | null
          course_id: string
          enrolled_at?: string
          id?: string
          org_id: string
          profile_id: string
          progress_pct?: number
          status?: Database["public"]["Enums"]["enrollment_status"]
        }
        Update: {
          completed_at?: string | null
          course_id?: string
          enrolled_at?: string
          id?: string
          org_id?: string
          profile_id?: string
          progress_pct?: number
          status?: Database["public"]["Enums"]["enrollment_status"]
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          ai_output_id: string | null
          comment: string | null
          created_at: string
          feature: string
          id: string
          metadata: Json | null
          org_id: string
          rating: number
          user_id: string
        }
        Insert: {
          ai_output_id?: string | null
          comment?: string | null
          created_at?: string
          feature: string
          id?: string
          metadata?: Json | null
          org_id: string
          rating: number
          user_id: string
        }
        Update: {
          ai_output_id?: string | null
          comment?: string | null
          created_at?: string
          feature?: string
          id?: string
          metadata?: Json | null
          org_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      finding_activity_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          finding_id: string
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          finding_id: string
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          finding_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finding_activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_activity_log_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "compliance_findings"
            referencedColumns: ["id"]
          },
        ]
      }
      finding_feedback: {
        Row: {
          check_id: string
          correction_severity: string | null
          correction_text: string | null
          created_at: string | null
          finding_id: string
          id: string
          org_id: string
          rating: number
          user_id: string
        }
        Insert: {
          check_id: string
          correction_severity?: string | null
          correction_text?: string | null
          created_at?: string | null
          finding_id: string
          id?: string
          org_id: string
          rating: number
          user_id: string
        }
        Update: {
          check_id?: string
          correction_severity?: string | null
          correction_text?: string | null
          created_at?: string | null
          finding_id?: string
          id?: string
          org_id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "finding_feedback_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "compliance_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_feedback_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "compliance_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_feedback_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      finding_share_tokens: {
        Row: {
          contributor_id: string
          created_at: string
          created_by: string
          email_to: string
          expires_at: string
          finding_id: string
          id: string
          org_id: string
          project_id: string
          remediation_status: Database["public"]["Enums"]["remediation_status"]
          responded_at: string | null
          response_file_name: string | null
          response_file_path: string | null
          response_notes: string | null
          sent_at: string | null
          token: string
          updated_at: string
        }
        Insert: {
          contributor_id: string
          created_at?: string
          created_by: string
          email_to: string
          expires_at?: string
          finding_id: string
          id?: string
          org_id: string
          project_id: string
          remediation_status?: Database["public"]["Enums"]["remediation_status"]
          responded_at?: string | null
          response_file_name?: string | null
          response_file_path?: string | null
          response_notes?: string | null
          sent_at?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          contributor_id?: string
          created_at?: string
          created_by?: string
          email_to?: string
          expires_at?: string
          finding_id?: string
          id?: string
          org_id?: string
          project_id?: string
          remediation_status?: Database["public"]["Enums"]["remediation_status"]
          responded_at?: string | null
          response_file_name?: string | null
          response_file_path?: string | null
          response_notes?: string | null
          sent_at?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "finding_share_tokens_contributor_id_fkey"
            columns: ["contributor_id"]
            isOneToOne: false
            referencedRelation: "project_contributors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_share_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_share_tokens_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "compliance_findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_share_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "finding_share_tokens_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      holding_cost_variables: {
        Row: {
          created_at: string
          custom_items: Json
          estimate_id: string
          id: string
          updated_at: string
          weekly_council_fees: number
          weekly_finance_cost: number
          weekly_insurance: number
          weekly_opportunity_cost: number
          weekly_site_costs: number
        }
        Insert: {
          created_at?: string
          custom_items?: Json
          estimate_id: string
          id?: string
          updated_at?: string
          weekly_council_fees?: number
          weekly_finance_cost?: number
          weekly_insurance?: number
          weekly_opportunity_cost?: number
          weekly_site_costs?: number
        }
        Update: {
          created_at?: string
          custom_items?: Json
          estimate_id?: string
          id?: string
          updated_at?: string
          weekly_council_fees?: number
          weekly_finance_cost?: number
          weekly_insurance?: number
          weekly_opportunity_cost?: number
          weekly_site_costs?: number
        }
        Relationships: [
          {
            foreignKeyName: "holding_cost_variables_estimate_id_fkey"
            columns: ["estimate_id"]
            isOneToOne: true
            referencedRelation: "cost_estimates"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_bases: {
        Row: {
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          org_id: string | null
          scope: Database["public"]["Enums"]["kb_scope"]
          slug: string
          source_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          org_id?: string | null
          scope?: Database["public"]["Enums"]["kb_scope"]
          slug: string
          source_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          org_id?: string | null
          scope?: Database["public"]["Enums"]["kb_scope"]
          slug?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_bases_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          chunk_count: number | null
          created_at: string
          created_by: string
          error_message: string | null
          file_name: string
          file_path: string
          file_size_bytes: number
          id: string
          kb_id: string
          page_count: number | null
          status: Database["public"]["Enums"]["kb_document_status"]
          updated_at: string
        }
        Insert: {
          chunk_count?: number | null
          created_at?: string
          created_by: string
          error_message?: string | null
          file_name: string
          file_path: string
          file_size_bytes?: number
          id?: string
          kb_id: string
          page_count?: number | null
          status?: Database["public"]["Enums"]["kb_document_status"]
          updated_at?: string
        }
        Update: {
          chunk_count?: number | null
          created_at?: string
          created_by?: string
          error_message?: string | null
          file_name?: string
          file_path?: string
          file_size_bytes?: number
          id?: string
          kb_id?: string
          page_count?: number | null
          status?: Database["public"]["Enums"]["kb_document_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_kb_id_fkey"
            columns: ["kb_id"]
            isOneToOne: false
            referencedRelation: "knowledge_bases"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_completions: {
        Row: {
          completed_at: string
          enrollment_id: string
          id: string
          lesson_id: string
        }
        Insert: {
          completed_at?: string
          enrollment_id: string
          id?: string
          lesson_id: string
        }
        Update: {
          completed_at?: string
          enrollment_id?: string
          id?: string
          lesson_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_completions_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_completions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: string
          course_id: string
          created_at: string
          estimated_reading_minutes: number
          id: string
          quiz_questions: Json
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          course_id: string
          created_at?: string
          estimated_reading_minutes?: number
          id?: string
          quiz_questions?: Json
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          course_id?: string
          created_at?: string
          estimated_reading_minutes?: number
          id?: string
          quiz_questions?: Json
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          project_ids: string[] | null
          role: Database["public"]["Enums"]["user_role"]
          seat_type: Database["public"]["Enums"]["seat_type"]
          status: Database["public"]["Enums"]["invitation_status"]
          token: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          org_id: string
          project_ids?: string[] | null
          role?: Database["public"]["Enums"]["user_role"]
          seat_type?: Database["public"]["Enums"]["seat_type"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          project_ids?: string[] | null
          role?: Database["public"]["Enums"]["user_role"]
          seat_type?: Database["public"]["Enums"]["seat_type"]
          status?: Database["public"]["Enums"]["invitation_status"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invitations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_rate_overrides: {
        Row: {
          base_rate: number
          category: string
          created_at: string
          created_by: string
          element: string
          id: string
          notes: string | null
          org_id: string
          source_label: string
          state: string
          unit: string
          updated_at: string
          year: number
        }
        Insert: {
          base_rate: number
          category: string
          created_at?: string
          created_by: string
          element: string
          id?: string
          notes?: string | null
          org_id: string
          source_label?: string
          state?: string
          unit: string
          updated_at?: string
          year?: number
        }
        Update: {
          base_rate?: number
          category?: string
          created_at?: string
          created_by?: string
          element?: string
          id?: string
          notes?: string | null
          org_id?: string
          source_label?: string
          state?: string
          unit?: string
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "org_rate_overrides_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_rate_overrides_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          abn: string | null
          created_at: string
          id: string
          name: string
          stripe_customer_id: string | null
          subscription_tier: string
          trial_ends_at: string | null
          trial_started_at: string | null
          trial_usage_count: number
          updated_at: string
        }
        Insert: {
          abn?: string | null
          created_at?: string
          id?: string
          name: string
          stripe_customer_id?: string | null
          subscription_tier?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          trial_usage_count?: number
          updated_at?: string
        }
        Update: {
          abn?: string | null
          created_at?: string
          id?: string
          name?: string
          stripe_customer_id?: string | null
          subscription_tier?: string
          trial_ends_at?: string | null
          trial_started_at?: string | null
          trial_usage_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          created_by: string
          extracted_layers: Json | null
          file_kind: string
          file_name: string
          file_path: string
          file_size_bytes: number
          id: string
          org_id: string
          page_count: number | null
          project_id: string
          status: Database["public"]["Enums"]["plan_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          extracted_layers?: Json | null
          file_kind?: string
          file_name: string
          file_path: string
          file_size_bytes?: number
          id?: string
          org_id: string
          page_count?: number | null
          project_id: string
          status?: Database["public"]["Enums"]["plan_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          extracted_layers?: Json | null
          file_kind?: string
          file_name?: string
          file_path?: string
          file_size_bytes?: number
          id?: string
          org_id?: string
          page_count?: number | null
          project_id?: string
          status?: Database["public"]["Enums"]["plan_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plans_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          professional_id: string
          sort_order: number
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          professional_id: string
          sort_order?: number
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          professional_id?: string
          sort_order?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professional_specialisations: {
        Row: {
          created_at: string
          id: string
          label: string
          professional_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label: string
          professional_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professional_specialisations_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          abn: string | null
          approved_at: string | null
          avg_rating: number
          company_name: string
          cover_image_url: string | null
          created_at: string
          description: string | null
          email: string | null
          fts: unknown
          headline: string | null
          id: string
          insurance_verified: boolean
          licence_number: string | null
          logo_url: string | null
          org_id: string
          phone: string | null
          regions: Database["public"]["Enums"]["australian_state"][]
          review_count: number
          status: Database["public"]["Enums"]["professional_status"]
          trade_type: Database["public"]["Enums"]["trade_type"]
          updated_at: string
          website: string | null
          years_experience: number | null
        }
        Insert: {
          abn?: string | null
          approved_at?: string | null
          avg_rating?: number
          company_name: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          fts?: unknown
          headline?: string | null
          id?: string
          insurance_verified?: boolean
          licence_number?: string | null
          logo_url?: string | null
          org_id: string
          phone?: string | null
          regions?: Database["public"]["Enums"]["australian_state"][]
          review_count?: number
          status?: Database["public"]["Enums"]["professional_status"]
          trade_type?: Database["public"]["Enums"]["trade_type"]
          updated_at?: string
          website?: string | null
          years_experience?: number | null
        }
        Update: {
          abn?: string | null
          approved_at?: string | null
          avg_rating?: number
          company_name?: string
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          fts?: unknown
          headline?: string | null
          id?: string
          insurance_verified?: boolean
          licence_number?: string | null
          logo_url?: string | null
          org_id?: string
          phone?: string | null
          regions?: Database["public"]["Enums"]["australian_state"][]
          review_count?: number
          status?: Database["public"]["Enums"]["professional_status"]
          trade_type?: Database["public"]["Enums"]["trade_type"]
          updated_at?: string
          website?: string | null
          years_experience?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "professionals_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          org_id: string
          persona: Database["public"]["Enums"]["user_persona"] | null
          role: Database["public"]["Enums"]["user_role"]
          seat_type: Database["public"]["Enums"]["seat_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name: string
          id?: string
          org_id: string
          persona?: Database["public"]["Enums"]["user_persona"] | null
          role?: Database["public"]["Enums"]["user_role"]
          seat_type?: Database["public"]["Enums"]["seat_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          org_id?: string
          persona?: Database["public"]["Enums"]["user_persona"] | null
          role?: Database["public"]["Enums"]["user_role"]
          seat_type?: Database["public"]["Enums"]["seat_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_certifications: {
        Row: {
          cert_type: Database["public"]["Enums"]["cert_type"]
          created_at: string
          created_by: string
          error_message: string | null
          expiry_date: string | null
          file_name: string
          file_path: string
          file_size_bytes: number
          id: string
          issue_date: string | null
          issuer_name: string | null
          notes: string | null
          org_id: string
          project_id: string
          state: string | null
          status: Database["public"]["Enums"]["cert_status"]
          updated_at: string
        }
        Insert: {
          cert_type?: Database["public"]["Enums"]["cert_type"]
          created_at?: string
          created_by: string
          error_message?: string | null
          expiry_date?: string | null
          file_name: string
          file_path: string
          file_size_bytes?: number
          id?: string
          issue_date?: string | null
          issuer_name?: string | null
          notes?: string | null
          org_id: string
          project_id: string
          state?: string | null
          status?: Database["public"]["Enums"]["cert_status"]
          updated_at?: string
        }
        Update: {
          cert_type?: Database["public"]["Enums"]["cert_type"]
          created_at?: string
          created_by?: string
          error_message?: string | null
          expiry_date?: string | null
          file_name?: string
          file_path?: string
          file_size_bytes?: number
          id?: string
          issue_date?: string | null
          issuer_name?: string | null
          notes?: string | null
          org_id?: string
          project_id?: string
          state?: string | null
          status?: Database["public"]["Enums"]["cert_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_certifications_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_certifications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_certifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contributors: {
        Row: {
          company_name: string | null
          contact_email: string | null
          contact_name: string
          contact_phone: string | null
          created_at: string
          created_by: string | null
          discipline: Database["public"]["Enums"]["contributor_discipline"]
          id: string
          notes: string | null
          org_id: string
          project_id: string
          updated_at: string
        }
        Insert: {
          company_name?: string | null
          contact_email?: string | null
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          discipline?: Database["public"]["Enums"]["contributor_discipline"]
          id?: string
          notes?: string | null
          org_id: string
          project_id: string
          updated_at?: string
        }
        Update: {
          company_name?: string | null
          contact_email?: string | null
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          created_by?: string | null
          discipline?: Database["public"]["Enums"]["contributor_discipline"]
          id?: string
          notes?: string | null
          org_id?: string
          project_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contributors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contributors_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contributors_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          profile_id: string
          project_id: string
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          profile_id: string
          project_id: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          profile_id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: [
          {
            foreignKeyName: "project_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_site_intel: {
        Row: {
          bal_rating: string | null
          climate_zone: number | null
          council_code: string | null
          council_name: string | null
          created_at: string | null
          derived_at: string | null
          formatted_address: string | null
          id: string
          latitude: number | null
          longitude: number | null
          org_id: string
          overlays: Json | null
          postcode: string | null
          project_id: string
          state: string | null
          static_map_url: string | null
          suburb: string | null
          updated_at: string | null
          wind_region: string | null
          zoning: string | null
        }
        Insert: {
          bal_rating?: string | null
          climate_zone?: number | null
          council_code?: string | null
          council_name?: string | null
          created_at?: string | null
          derived_at?: string | null
          formatted_address?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          org_id: string
          overlays?: Json | null
          postcode?: string | null
          project_id: string
          state?: string | null
          static_map_url?: string | null
          suburb?: string | null
          updated_at?: string | null
          wind_region?: string | null
          zoning?: string | null
        }
        Update: {
          bal_rating?: string | null
          climate_zone?: number | null
          council_code?: string | null
          council_name?: string | null
          created_at?: string | null
          derived_at?: string | null
          formatted_address?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          org_id?: string
          overlays?: Json | null
          postcode?: string | null
          project_id?: string
          state?: string | null
          static_map_url?: string | null
          suburb?: string | null
          updated_at?: string | null
          wind_region?: string | null
          zoning?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_site_intel_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_site_intel_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_user_access: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          org_id: string
          profile_id: string
          project_id: string
          role: Database["public"]["Enums"]["seat_type"]
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          org_id: string
          profile_id: string
          project_id: string
          role: Database["public"]["Enums"]["seat_type"]
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          org_id?: string
          profile_id?: string
          project_id?: string
          role?: Database["public"]["Enums"]["seat_type"]
        }
        Relationships: [
          {
            foreignKeyName: "project_user_access_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_user_access_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_user_access_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_user_access_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          address: string | null
          bal: string | null
          climate_zone: string | null
          council: string | null
          created_at: string
          created_by: string
          id: string
          lat: number | null
          lng: number | null
          lot_size_sqm: number | null
          name: string
          org_id: string
          postcode: string | null
          property_lookup_id: string | null
          property_profile: Json | null
          selected_systems: Json | null
          setup_step: number
          state: string | null
          status: Database["public"]["Enums"]["project_status"]
          suburb: string | null
          updated_at: string
          wind_region: string | null
          zoning: string | null
        }
        Insert: {
          address?: string | null
          bal?: string | null
          climate_zone?: string | null
          council?: string | null
          created_at?: string
          created_by: string
          id?: string
          lat?: number | null
          lng?: number | null
          lot_size_sqm?: number | null
          name: string
          org_id: string
          postcode?: string | null
          property_lookup_id?: string | null
          property_profile?: Json | null
          selected_systems?: Json | null
          setup_step?: number
          state?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          suburb?: string | null
          updated_at?: string
          wind_region?: string | null
          zoning?: string | null
        }
        Update: {
          address?: string | null
          bal?: string | null
          climate_zone?: string | null
          council?: string | null
          created_at?: string
          created_by?: string
          id?: string
          lat?: number | null
          lng?: number | null
          lot_size_sqm?: number | null
          name?: string
          org_id?: string
          postcode?: string | null
          property_lookup_id?: string | null
          property_profile?: Json | null
          selected_systems?: Json | null
          setup_step?: number
          state?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          suburb?: string | null
          updated_at?: string
          wind_region?: string | null
          zoning?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      questionnaire_responses: {
        Row: {
          completed: boolean
          created_at: string
          created_by: string
          id: string
          org_id: string
          project_id: string
          responses: Json
          updated_at: string
        }
        Insert: {
          completed?: boolean
          created_at?: string
          created_by: string
          id?: string
          org_id: string
          project_id: string
          responses?: Json
          updated_at?: string
        }
        Update: {
          completed?: boolean
          created_at?: string
          created_by?: string
          id?: string
          org_id?: string
          project_id?: string
          responses?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "questionnaire_responses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_responses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questionnaire_responses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_attempts: {
        Row: {
          answers: Json
          attempted_at: string
          enrollment_id: string
          id: string
          lesson_id: string
          passed: boolean
          score: number
        }
        Insert: {
          answers?: Json
          attempted_at?: string
          enrollment_id: string
          id?: string
          lesson_id: string
          passed?: boolean
          score?: number
        }
        Update: {
          answers?: Json
          attempted_at?: string
          enrollment_id?: string
          id?: string
          lesson_id?: string
          passed?: boolean
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_attempts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_attempts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_auto_entries: {
        Row: {
          ai_reasoning: string | null
          commit_id: string
          confidence: number | null
          created_at: string
          date: string
          deliverable: string
          description: string | null
          hours: number
          id: string
          org_id: string
          rd_tag: Database["public"]["Enums"]["rd_tag"]
          review_status: Database["public"]["Enums"]["review_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          stage: string
          updated_at: string
        }
        Insert: {
          ai_reasoning?: string | null
          commit_id: string
          confidence?: number | null
          created_at?: string
          date: string
          deliverable: string
          description?: string | null
          hours: number
          id?: string
          org_id: string
          rd_tag?: Database["public"]["Enums"]["rd_tag"]
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          stage: string
          updated_at?: string
        }
        Update: {
          ai_reasoning?: string | null
          commit_id?: string
          confidence?: number | null
          created_at?: string
          date?: string
          deliverable?: string
          description?: string | null
          hours?: number
          id?: string
          org_id?: string
          rd_tag?: Database["public"]["Enums"]["rd_tag"]
          review_status?: Database["public"]["Enums"]["review_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rd_auto_entries_commit_id_fkey"
            columns: ["commit_id"]
            isOneToOne: false
            referencedRelation: "rd_commit_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rd_auto_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rd_auto_entries_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_commit_logs: {
        Row: {
          author_email: string | null
          author_name: string | null
          branch: string | null
          committed_at: string | null
          created_at: string
          files_changed: Json | null
          id: string
          message: string | null
          org_id: string
          repo: string | null
          sha: string
          status: Database["public"]["Enums"]["commit_log_status"]
        }
        Insert: {
          author_email?: string | null
          author_name?: string | null
          branch?: string | null
          committed_at?: string | null
          created_at?: string
          files_changed?: Json | null
          id?: string
          message?: string | null
          org_id: string
          repo?: string | null
          sha: string
          status?: Database["public"]["Enums"]["commit_log_status"]
        }
        Update: {
          author_email?: string | null
          author_name?: string | null
          branch?: string | null
          committed_at?: string | null
          created_at?: string
          files_changed?: Json | null
          id?: string
          message?: string | null
          org_id?: string
          repo?: string | null
          sha?: string
          status?: Database["public"]["Enums"]["commit_log_status"]
        }
        Relationships: [
          {
            foreignKeyName: "rd_commit_logs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_experiments: {
        Row: {
          created_at: string
          created_by: string
          hypothesis: string
          id: string
          methodology: string | null
          org_id: string
          outcome: string | null
          stage: string | null
          status: Database["public"]["Enums"]["experiment_status"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          hypothesis: string
          id?: string
          methodology?: string | null
          org_id: string
          outcome?: string | null
          stage?: string | null
          status?: Database["public"]["Enums"]["experiment_status"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          hypothesis?: string
          id?: string
          methodology?: string | null
          org_id?: string
          outcome?: string | null
          stage?: string | null
          status?: Database["public"]["Enums"]["experiment_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rd_experiments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rd_experiments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_file_mappings: {
        Row: {
          created_at: string
          deliverable: string
          id: string
          org_id: string
          pattern: string
          priority: number
          rd_tag: Database["public"]["Enums"]["rd_tag"]
          stage: string
        }
        Insert: {
          created_at?: string
          deliverable: string
          id?: string
          org_id: string
          pattern: string
          priority?: number
          rd_tag?: Database["public"]["Enums"]["rd_tag"]
          stage: string
        }
        Update: {
          created_at?: string
          deliverable?: string
          id?: string
          org_id?: string
          pattern?: string
          priority?: number
          rd_tag?: Database["public"]["Enums"]["rd_tag"]
          stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "rd_file_mappings_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_time_entries: {
        Row: {
          created_at: string
          date: string
          deliverable: string
          description: string | null
          hours: number
          id: string
          org_id: string
          profile_id: string
          rd_tag: Database["public"]["Enums"]["rd_tag"]
          stage: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          deliverable: string
          description?: string | null
          hours: number
          id?: string
          org_id: string
          profile_id: string
          rd_tag?: Database["public"]["Enums"]["rd_tag"]
          stage: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          deliverable?: string
          description?: string | null
          hours?: number
          id?: string
          org_id?: string
          profile_id?: string
          rd_tag?: Database["public"]["Enums"]["rd_tag"]
          stage?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rd_time_entries_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rd_time_entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      rd_tracking_config: {
        Row: {
          auto_approve_threshold: number
          created_at: string
          default_hours_per_commit: number
          enabled: boolean
          github_repo: string | null
          id: string
          org_id: string
          updated_at: string
          webhook_secret: string | null
        }
        Insert: {
          auto_approve_threshold?: number
          created_at?: string
          default_hours_per_commit?: number
          enabled?: boolean
          github_repo?: string | null
          id?: string
          org_id: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Update: {
          auto_approve_threshold?: number
          created_at?: string
          default_hours_per_commit?: number
          enabled?: boolean
          github_repo?: string | null
          id?: string
          org_id?: string
          updated_at?: string
          webhook_secret?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rd_tracking_config_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      report_versions: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          module: string
          org_id: string
          pdf_url: string | null
          project_id: string
          report_data: Json
          source_id: string
          version_number: number
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          module: string
          org_id: string
          pdf_url?: string | null
          project_id: string
          report_data?: Json
          source_id: string
          version_number: number
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          module?: string
          org_id?: string
          pdf_url?: string | null
          project_id?: string
          report_data?: Json
          source_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_versions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          org_id: string
          plan_id: string
          status: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at: string
          usage_count: number
          usage_limit: number
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          org_id: string
          plan_id: string
          status?: string
          stripe_customer_id: string
          stripe_subscription_id: string
          updated_at?: string
          usage_count?: number
          usage_limit?: number
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          org_id?: string
          plan_id?: string
          status?: string
          stripe_customer_id?: string
          stripe_subscription_id?: string
          updated_at?: string
          usage_count?: number
          usage_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      test_results: {
        Row: {
          created_at: string | null
          id: string
          notes: string | null
          section: string
          status: string
          tc_id: string
          tested_at: string | null
          tested_by: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notes?: string | null
          section: string
          status?: string
          tc_id: string
          tested_at?: string | null
          tested_by?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notes?: string | null
          section?: string
          status?: string
          tc_id?: string
          tested_at?: string | null
          tested_by?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      test_screenshots: {
        Row: {
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          test_result_id: string
          uploaded_at: string | null
        }
        Insert: {
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          test_result_id: string
          uploaded_at?: string | null
        }
        Update: {
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          test_result_id?: string
          uploaded_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_screenshots_test_result_id_fkey"
            columns: ["test_result_id"]
            isOneToOne: false
            referencedRelation: "test_results"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_limits: {
        Row: {
          created_at: string | null
          id: string
          month_year: string
          run_count: number | null
          run_limit: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          month_year: string
          run_count?: number | null
          run_limit?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          month_year?: string
          run_count?: number | null
          run_limit?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      model_performance: {
        Row: {
          ai_function: string | null
          avg_cost_usd: number | null
          avg_latency_ms: number | null
          fallback_count: number | null
          last_used_at: string | null
          model_id: string | null
          total_calls: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      get_my_profile: { Args: never; Returns: Json }
      get_user_org_id: { Args: never; Returns: string }
      increment_usage: { Args: { p_org_id: string }; Returns: number }
      match_documents: {
        Args: {
          filter_metadata?: Json
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      match_documents_hybrid:
        | {
            Args: {
              filter_org_id?: string
              filter_source_id?: string
              filter_source_type?: string
              match_count?: number
              match_threshold?: number
              query_embedding: string
              query_text?: string
            }
            Returns: {
              chunk_index: number
              content: string
              id: string
              metadata: Json
              similarity: number
              source_id: string
              source_type: string
            }[]
          }
        | {
            Args: {
              filter_org_id?: string
              filter_source_id?: string
              filter_source_type?: string
              include_system?: boolean
              match_count?: number
              match_threshold?: number
              query_embedding: string
              query_text?: string
            }
            Returns: {
              chunk_index: number
              content: string
              id: string
              metadata: Json
              similarity: number
              source_id: string
              source_type: string
            }[]
          }
      refresh_model_performance: { Args: never; Returns: undefined }
      user_has_role: {
        Args: { required_role: Database["public"]["Enums"]["user_role"] }
        Returns: boolean
      }
    }
    Enums: {
      australian_state:
        | "NSW"
        | "VIC"
        | "QLD"
        | "WA"
        | "SA"
        | "TAS"
        | "ACT"
        | "NT"
      cert_status: "uploading" | "processing" | "ready" | "error"
      cert_type:
        | "structural"
        | "geotechnical"
        | "energy_nathers"
        | "energy_jv3"
        | "bushfire_bal"
        | "acoustic"
        | "hydraulic"
        | "electrical"
        | "waterproofing"
        | "form_15_qld"
        | "form_16_qld"
        | "form_21_qld"
        | "cdc_nsw"
        | "cc_nsw"
        | "oc_nsw"
        | "building_permit_vic"
        | "reg_126_vic"
        | "design_compliance_wa"
        | "building_rules_sa"
        | "likely_compliance_tas"
        | "other"
      check_status: "queued" | "processing" | "completed" | "error"
      commit_log_status: "pending" | "processing" | "classified" | "error"
      contributor_discipline:
        | "architect"
        | "structural_engineer"
        | "hydraulic_engineer"
        | "energy_consultant"
        | "building_surveyor"
        | "geotechnical_engineer"
        | "acoustic_engineer"
        | "fire_engineer"
        | "landscape_architect"
        | "builder"
        | "other"
      cost_estimate_status: "queued" | "processing" | "completed" | "error"
      cost_line_source: "ai_estimated" | "reference" | "user_override"
      course_difficulty: "beginner" | "intermediate" | "advanced"
      course_status: "draft" | "published" | "archived"
      design_check_status: "queued" | "processing" | "completed" | "error"
      enrollment_status: "active" | "completed" | "dropped"
      experiment_status: "planned" | "in_progress" | "completed"
      finding_review_status:
        | "pending"
        | "accepted"
        | "amended"
        | "rejected"
        | "sent"
      finding_severity: "compliant" | "advisory" | "non_compliant" | "critical"
      implementation_complexity: "low" | "medium" | "high"
      invitation_status: "pending" | "accepted" | "expired" | "revoked"
      kb_document_status: "pending" | "processing" | "ready" | "error"
      kb_scope: "system" | "org"
      plan_status:
        | "uploading"
        | "processing"
        | "ready"
        | "error"
        | "manual_review"
      professional_status: "pending" | "approved" | "suspended"
      project_status: "draft" | "active" | "completed" | "archived"
      rd_tag: "core_rd" | "rd_supporting" | "not_eligible"
      remediation_status:
        | "awaiting"
        | "acknowledged"
        | "in_progress"
        | "completed"
        | "disputed"
      review_status: "pending" | "approved" | "rejected"
      risk_level: "low" | "medium" | "high" | "critical"
      seat_type: "internal" | "external" | "viewer"
      trade_type:
        | "builder"
        | "architect"
        | "structural_engineer"
        | "certifier"
        | "electrician"
        | "plumber"
        | "carpenter"
        | "steel_fabricator"
        | "clt_specialist"
        | "modular_manufacturer"
        | "prefab_supplier"
        | "facade_specialist"
        | "sustainability_consultant"
        | "quantity_surveyor"
        | "project_manager"
        | "interior_designer"
        | "landscaper"
        | "other"
      user_persona:
        | "builder"
        | "developer"
        | "architect_bd"
        | "design_and_build"
        | "consultant"
        | "trade"
        | "admin"
      user_role:
        | "owner"
        | "admin"
        | "project_manager"
        | "architect"
        | "builder"
        | "trade"
        | "viewer"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      australian_state: ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"],
      cert_status: ["uploading", "processing", "ready", "error"],
      cert_type: [
        "structural",
        "geotechnical",
        "energy_nathers",
        "energy_jv3",
        "bushfire_bal",
        "acoustic",
        "hydraulic",
        "electrical",
        "waterproofing",
        "form_15_qld",
        "form_16_qld",
        "form_21_qld",
        "cdc_nsw",
        "cc_nsw",
        "oc_nsw",
        "building_permit_vic",
        "reg_126_vic",
        "design_compliance_wa",
        "building_rules_sa",
        "likely_compliance_tas",
        "other",
      ],
      check_status: ["queued", "processing", "completed", "error"],
      commit_log_status: ["pending", "processing", "classified", "error"],
      contributor_discipline: [
        "architect",
        "structural_engineer",
        "hydraulic_engineer",
        "energy_consultant",
        "building_surveyor",
        "geotechnical_engineer",
        "acoustic_engineer",
        "fire_engineer",
        "landscape_architect",
        "builder",
        "other",
      ],
      cost_estimate_status: ["queued", "processing", "completed", "error"],
      cost_line_source: ["ai_estimated", "reference", "user_override"],
      course_difficulty: ["beginner", "intermediate", "advanced"],
      course_status: ["draft", "published", "archived"],
      design_check_status: ["queued", "processing", "completed", "error"],
      enrollment_status: ["active", "completed", "dropped"],
      experiment_status: ["planned", "in_progress", "completed"],
      finding_review_status: [
        "pending",
        "accepted",
        "amended",
        "rejected",
        "sent",
      ],
      finding_severity: ["compliant", "advisory", "non_compliant", "critical"],
      implementation_complexity: ["low", "medium", "high"],
      invitation_status: ["pending", "accepted", "expired", "revoked"],
      kb_document_status: ["pending", "processing", "ready", "error"],
      kb_scope: ["system", "org"],
      plan_status: [
        "uploading",
        "processing",
        "ready",
        "error",
        "manual_review",
      ],
      professional_status: ["pending", "approved", "suspended"],
      project_status: ["draft", "active", "completed", "archived"],
      rd_tag: ["core_rd", "rd_supporting", "not_eligible"],
      remediation_status: [
        "awaiting",
        "acknowledged",
        "in_progress",
        "completed",
        "disputed",
      ],
      review_status: ["pending", "approved", "rejected"],
      risk_level: ["low", "medium", "high", "critical"],
      seat_type: ["internal", "external", "viewer"],
      trade_type: [
        "builder",
        "architect",
        "structural_engineer",
        "certifier",
        "electrician",
        "plumber",
        "carpenter",
        "steel_fabricator",
        "clt_specialist",
        "modular_manufacturer",
        "prefab_supplier",
        "facade_specialist",
        "sustainability_consultant",
        "quantity_surveyor",
        "project_manager",
        "interior_designer",
        "landscaper",
        "other",
      ],
      user_persona: [
        "builder",
        "developer",
        "architect_bd",
        "design_and_build",
        "consultant",
        "trade",
        "admin",
      ],
      user_role: [
        "owner",
        "admin",
        "project_manager",
        "architect",
        "builder",
        "trade",
        "viewer",
      ],
    },
  },
} as const
