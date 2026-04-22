export interface Address {
  street:      string;
  city:        string;
  state:       string;
  postal_code: string;
  country:     string;
}

export interface Bank {
  id:            string;
  name:          string;
  code:          string;
  country:       string;
  license_no:    string;
  is_active:     boolean;
  contact_email: string;
  contact_phone: string;
  address:       Address;
  created_at:    string;   // ISO timestamp from DB
  updated_at:    string;
}