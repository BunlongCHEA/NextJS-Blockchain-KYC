export type Role = "admin" | "bank_admin" | "bank_officer" | "auditor" | "customer" | "integration_service";

export interface User {
  id: string;
  username: string;
  email: string;
  role: Role;
  is_active: boolean;
  is_deleted: boolean;
  password_change_required: boolean;
  password_expires_at?: string;
  last_login?: string;
  created_at: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface AuthSession {
  user: User;
  accessToken: string;
  passwordChangeRequired: boolean;
}
