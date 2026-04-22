export type KYCStatus = "PENDING" | "VERIFIED" | "REJECTED" | "SUSPENDED" | "EXPIRED";

export interface Address {
  street: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
}

export interface KYCData {
  customer_id: string;
  first_name: string;
  last_name: string;
  date_of_birth: string;
  nationality: string;
  id_type: string;
  id_number: string;
  id_expiry_date: string;
  address: Address;
  email: string;
  phone: string;
  status: KYCStatus;
  verified_by: string;
  verification_date: number;  // Unix seconds
  created_at: number; // Unix seconds
  updated_at: number; // Unix seconds
  document_hash: string;
  risk_level: string;
  bank_id: string;
  last_review_date: number; // Unix seconds
  next_review_date: number; // Unix seconds
  review_count: number;
  review_notes?: string;
  scan_score?: number;
  scan_status?: string;
  last_scan_at?: string | null;  // RFC3339 from Go *time.Time
  // Encryption placeholder
  id_image_path?: string;
  selfie_image_path?: string;
}
