export type UserRole =
  | "owner"
  | "admin"
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

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      organisations: {
        Row: {
          id: string;
          name: string;
          abn: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          abn?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          abn?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          role: UserRole;
          full_name: string;
          email: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          role?: UserRole;
          full_name: string;
          email: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          role?: UserRole;
          full_name?: string;
          email?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      projects: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          address: string | null;
          status: ProjectStatus;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          address?: string | null;
          status?: ProjectStatus;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string | null;
          status?: ProjectStatus;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "projects_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      project_site_intel: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          latitude: number | null;
          longitude: number | null;
          formatted_address: string | null;
          suburb: string | null;
          postcode: string | null;
          state: string | null;
          climate_zone: number | null;
          wind_region: string | null;
          bal_rating: string | null;
          council_name: string | null;
          council_code: string | null;
          zoning: string | null;
          overlays: Json;
          static_map_url: string | null;
          derived_at: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          org_id: string;
          latitude?: number | null;
          longitude?: number | null;
          formatted_address?: string | null;
          suburb?: string | null;
          postcode?: string | null;
          state?: string | null;
          climate_zone?: number | null;
          wind_region?: string | null;
          bal_rating?: string | null;
          council_name?: string | null;
          council_code?: string | null;
          zoning?: string | null;
          overlays?: Json;
          static_map_url?: string | null;
          derived_at?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          latitude?: number | null;
          longitude?: number | null;
          formatted_address?: string | null;
          suburb?: string | null;
          postcode?: string | null;
          state?: string | null;
          climate_zone?: number | null;
          wind_region?: string | null;
          bal_rating?: string | null;
          council_name?: string | null;
          council_code?: string | null;
          zoning?: string | null;
          overlays?: Json;
          static_map_url?: string | null;
          derived_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_site_intel_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: true;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_site_intel_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      project_members: {
        Row: {
          project_id: string;
          profile_id: string;
          role: UserRole;
          created_at: string;
        };
        Insert: {
          project_id: string;
          profile_id: string;
          role?: UserRole;
          created_at?: string;
        };
        Update: {
          role?: UserRole;
        };
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_members_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          file_name: string;
          file_path: string;
          file_size_bytes: number;
          page_count: number | null;
          status: PlanStatus;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          org_id: string;
          file_name: string;
          file_path: string;
          file_size_bytes?: number;
          page_count?: number | null;
          status?: PlanStatus;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          file_name?: string;
          file_path?: string;
          file_size_bytes?: number;
          page_count?: number | null;
          status?: PlanStatus;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "plans_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plans_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plans_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      questionnaire_responses: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          responses: Json;
          completed: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          org_id: string;
          responses?: Json;
          completed?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          responses?: Json;
          completed?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "questionnaire_responses_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questionnaire_responses_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "questionnaire_responses_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      compliance_checks: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          plan_id: string;
          questionnaire_id: string | null;
          status: CheckStatus;
          summary: string | null;
          overall_risk: RiskLevel | null;
          error_message: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          org_id: string;
          plan_id: string;
          questionnaire_id?: string | null;
          status?: CheckStatus;
          summary?: string | null;
          overall_risk?: RiskLevel | null;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          status?: CheckStatus;
          summary?: string | null;
          overall_risk?: RiskLevel | null;
          error_message?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_checks_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_checks_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_checks_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_checks_questionnaire_id_fkey";
            columns: ["questionnaire_id"];
            isOneToOne: false;
            referencedRelation: "questionnaire_responses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "compliance_checks_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      compliance_findings: {
        Row: {
          id: string;
          check_id: string;
          ncc_section: string;
          category: string;
          title: string;
          description: string;
          recommendation: string | null;
          severity: FindingSeverity;
          confidence: number;
          ncc_citation: string | null;
          page_references: number[] | null;
          sort_order: number;
        };
        Insert: {
          id?: string;
          check_id: string;
          ncc_section: string;
          category: string;
          title: string;
          description: string;
          recommendation?: string | null;
          severity?: FindingSeverity;
          confidence?: number;
          ncc_citation?: string | null;
          page_references?: number[] | null;
          sort_order?: number;
        };
        Update: {
          id?: string;
          ncc_section?: string;
          category?: string;
          title?: string;
          description?: string;
          recommendation?: string | null;
          severity?: FindingSeverity;
          confidence?: number;
          ncc_citation?: string | null;
          page_references?: number[] | null;
          sort_order?: number;
        };
        Relationships: [
          {
            foreignKeyName: "compliance_findings_check_id_fkey";
            columns: ["check_id"];
            isOneToOne: false;
            referencedRelation: "compliance_checks";
            referencedColumns: ["id"];
          },
        ];
      };
      document_embeddings: {
        Row: {
          id: string;
          org_id: string;
          source_type: string;
          source_id: string;
          chunk_index: number;
          content: string;
          metadata: Json;
          embedding: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          source_type: string;
          source_id: string;
          chunk_index?: number;
          content: string;
          metadata?: Json;
          embedding?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          content?: string;
          metadata?: Json;
          embedding?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "document_embeddings_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          id: string;
          user_id: string;
          org_id: string;
          feature: string;
          rating: number;
          comment: string | null;
          ai_output_id: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          org_id: string;
          feature: string;
          rating: number;
          comment?: string | null;
          ai_output_id?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          rating?: number;
          comment?: string | null;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          action: string;
          entity_type: string;
          entity_id: string | null;
          details: Json;
          ip_address: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          details?: Json;
          ip_address?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          action?: string;
          entity_type?: string;
          details?: Json;
        };
        Relationships: [];
      };
      knowledge_bases: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          source_type: string;
          scope: KbScope;
          org_id: string | null;
          is_active: boolean;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          source_type?: string;
          scope?: KbScope;
          org_id?: string | null;
          is_active?: boolean;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          source_type?: string;
          scope?: KbScope;
          org_id?: string | null;
          is_active?: boolean;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_bases_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      knowledge_documents: {
        Row: {
          id: string;
          kb_id: string;
          file_name: string;
          file_path: string;
          file_size_bytes: number;
          page_count: number | null;
          chunk_count: number | null;
          status: KbDocumentStatus;
          error_message: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          kb_id: string;
          file_name: string;
          file_path: string;
          file_size_bytes?: number;
          page_count?: number | null;
          chunk_count?: number | null;
          status?: KbDocumentStatus;
          error_message?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          file_name?: string;
          file_path?: string;
          file_size_bytes?: number;
          page_count?: number | null;
          chunk_count?: number | null;
          status?: KbDocumentStatus;
          error_message?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_kb_id_fkey";
            columns: ["kb_id"];
            isOneToOne: false;
            referencedRelation: "knowledge_bases";
            referencedColumns: ["id"];
          },
        ];
      };
      rd_time_entries: {
        Row: {
          id: string;
          profile_id: string;
          org_id: string;
          date: string;
          hours: number;
          stage: string;
          deliverable: string;
          rd_tag: RdTag;
          description: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          profile_id: string;
          org_id: string;
          date: string;
          hours: number;
          stage: string;
          deliverable: string;
          rd_tag?: RdTag;
          description?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          hours?: number;
          stage?: string;
          deliverable?: string;
          rd_tag?: RdTag;
          description?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rd_time_entries_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rd_time_entries_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      rd_tracking_config: {
        Row: {
          id: string;
          org_id: string;
          enabled: boolean;
          github_repo: string | null;
          webhook_secret: string | null;
          default_hours_per_commit: number;
          auto_approve_threshold: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          enabled?: boolean;
          github_repo?: string | null;
          webhook_secret?: string | null;
          default_hours_per_commit?: number;
          auto_approve_threshold?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          enabled?: boolean;
          github_repo?: string | null;
          webhook_secret?: string | null;
          default_hours_per_commit?: number;
          auto_approve_threshold?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rd_tracking_config_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: true;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      rd_commit_logs: {
        Row: {
          id: string;
          org_id: string;
          sha: string;
          author_name: string | null;
          author_email: string | null;
          message: string | null;
          files_changed: Json | null;
          repo: string | null;
          branch: string | null;
          committed_at: string | null;
          status: CommitLogStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          sha: string;
          author_name?: string | null;
          author_email?: string | null;
          message?: string | null;
          files_changed?: Json | null;
          repo?: string | null;
          branch?: string | null;
          committed_at?: string | null;
          status?: CommitLogStatus;
          created_at?: string;
        };
        Update: {
          id?: string;
          sha?: string;
          author_name?: string | null;
          author_email?: string | null;
          message?: string | null;
          files_changed?: Json | null;
          repo?: string | null;
          branch?: string | null;
          committed_at?: string | null;
          status?: CommitLogStatus;
        };
        Relationships: [
          {
            foreignKeyName: "rd_commit_logs_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      rd_auto_entries: {
        Row: {
          id: string;
          org_id: string;
          commit_id: string;
          date: string;
          hours: number;
          stage: string;
          deliverable: string;
          rd_tag: RdTag;
          description: string | null;
          ai_reasoning: string | null;
          confidence: number | null;
          review_status: ReviewStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          commit_id: string;
          date: string;
          hours: number;
          stage: string;
          deliverable: string;
          rd_tag?: RdTag;
          description?: string | null;
          ai_reasoning?: string | null;
          confidence?: number | null;
          review_status?: ReviewStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          date?: string;
          hours?: number;
          stage?: string;
          deliverable?: string;
          rd_tag?: RdTag;
          description?: string | null;
          ai_reasoning?: string | null;
          confidence?: number | null;
          review_status?: ReviewStatus;
          reviewed_by?: string | null;
          reviewed_at?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rd_auto_entries_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rd_auto_entries_commit_id_fkey";
            columns: ["commit_id"];
            isOneToOne: false;
            referencedRelation: "rd_commit_logs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rd_auto_entries_reviewed_by_fkey";
            columns: ["reviewed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      rd_file_mappings: {
        Row: {
          id: string;
          org_id: string;
          pattern: string;
          stage: string;
          deliverable: string;
          rd_tag: RdTag;
          priority: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          pattern: string;
          stage: string;
          deliverable: string;
          rd_tag?: RdTag;
          priority?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          pattern?: string;
          stage?: string;
          deliverable?: string;
          rd_tag?: RdTag;
          priority?: number;
        };
        Relationships: [
          {
            foreignKeyName: "rd_file_mappings_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
        ];
      };
      project_certifications: {
        Row: {
          id: string;
          project_id: string;
          org_id: string;
          cert_type: CertType;
          file_name: string;
          file_path: string;
          file_size_bytes: number;
          status: CertStatus;
          state: string | null;
          issuer_name: string | null;
          issue_date: string | null;
          expiry_date: string | null;
          notes: string | null;
          error_message: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          org_id: string;
          cert_type?: CertType;
          file_name: string;
          file_path: string;
          file_size_bytes?: number;
          status?: CertStatus;
          state?: string | null;
          issuer_name?: string | null;
          issue_date?: string | null;
          expiry_date?: string | null;
          notes?: string | null;
          error_message?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          cert_type?: CertType;
          file_name?: string;
          file_path?: string;
          file_size_bytes?: number;
          status?: CertStatus;
          state?: string | null;
          issuer_name?: string | null;
          issue_date?: string | null;
          expiry_date?: string | null;
          notes?: string | null;
          error_message?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "project_certifications_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_certifications_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "project_certifications_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      rd_experiments: {
        Row: {
          id: string;
          org_id: string;
          title: string;
          hypothesis: string;
          methodology: string | null;
          outcome: string | null;
          status: ExperimentStatus;
          stage: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          title: string;
          hypothesis: string;
          methodology?: string | null;
          outcome?: string | null;
          status?: ExperimentStatus;
          stage?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          hypothesis?: string;
          methodology?: string | null;
          outcome?: string | null;
          status?: ExperimentStatus;
          stage?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "rd_experiments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organisations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "rd_experiments_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_user_org_id: {
        Args: Record<string, never>;
        Returns: string;
      };
      get_my_profile: {
        Args: Record<string, never>;
        Returns: Json;
      };
      user_has_role: {
        Args: { required_role: UserRole };
        Returns: boolean;
      };
      match_documents: {
        Args: {
          query_embedding: string;
          match_threshold?: number;
          match_count?: number;
          filter_metadata?: Json;
        };
        Returns: {
          id: string;
          content: string;
          metadata: Json;
          similarity: number;
        }[];
      };
      match_documents_hybrid: {
        Args: {
          query_embedding: string;
          query_text?: string;
          match_threshold?: number;
          match_count?: number;
          filter_org_id?: string | null;
          filter_source_type?: string | null;
          filter_source_id?: string | null;
          include_system?: boolean;
        };
        Returns: {
          id: string;
          content: string;
          metadata: Json;
          source_type: string;
          source_id: string;
          chunk_index: number;
          similarity: number;
        }[];
      };
    };
    Enums: {
      user_role: UserRole;
      project_status: ProjectStatus;
      plan_status: PlanStatus;
      check_status: CheckStatus;
      risk_level: RiskLevel;
      finding_severity: FindingSeverity;
      kb_scope: KbScope;
      kb_document_status: KbDocumentStatus;
      rd_tag: RdTag;
      experiment_status: ExperimentStatus;
      commit_log_status: CommitLogStatus;
      review_status: ReviewStatus;
      cert_type: CertType;
      cert_status: CertStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
