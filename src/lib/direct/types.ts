export type ProfessionalStatus = "pending" | "approved" | "suspended" | "deregistered";

export type TradeType =
  | "builder" | "architect" | "structural_engineer" | "certifier"
  | "electrician" | "plumber" | "carpenter" | "steel_fabricator"
  | "clt_specialist" | "modular_manufacturer" | "prefab_supplier"
  | "facade_specialist" | "sustainability_consultant" | "quantity_surveyor"
  | "project_manager" | "interior_designer" | "landscaper" | "other";

export type AustralianState = "NSW" | "VIC" | "QLD" | "WA" | "SA" | "TAS" | "ACT" | "NT";

export type EnquiryStatus = "new" | "read" | "replied" | "archived";

export interface Professional {
  id: string;
  org_id: string;
  company_name: string;
  abn: string | null;
  trade_type: TradeType;
  headline: string | null;
  description: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_url: string | null;
  cover_image_url: string | null;
  regions: AustralianState[];
  years_experience: number | null;
  insurance_verified: boolean;
  licence_number: string | null;
  avg_rating: number;
  review_count: number;
  status: ProfessionalStatus;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  specialisations?: Specialisation[];
}

export interface Specialisation {
  id: string;
  professional_id: string;
  label: string;
  created_at: string;
}

export interface PortfolioItem {
  id: string;
  professional_id: string;
  image_url: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  created_at: string;
}

export interface CompanyDocument {
  id: string;
  professional_id: string;
  org_id: string;
  title: string;
  file_url: string;
  file_name: string | null;
  created_at: string;
}

export interface Review {
  id: string;
  professional_id: string;
  reviewer_org_id: string;
  reviewer_name: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface Enquiry {
  id: string;
  professional_id: string;
  sender_org_id: string;
  sender_name: string;
  subject: string;
  message: string;
  project_id: string | null;
  status: EnquiryStatus;
  read_at: string | null;
  created_at: string;
}
