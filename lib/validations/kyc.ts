import { z } from "zod";
import { passwordSchema } from "./password";

export const kycRegistrationSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  nationality: z.string().min(1, "Nationality is required"),
  id_type: z.enum(["passport", "national_id", "driver_license"]),
  id_number: z.string().min(1, "ID number is required"),
  id_expiry_date: z.string().min(1, "ID expiry date is required"),
  address: z.object({
    street: z.string().min(1, "Street is required"),
    city: z.string().min(1, "City is required"),
    state: z.string().min(1, "State is required"),
    postal_code: z.string().min(1, "Postal code is required"),
    country: z.string().min(1, "Country is required"),
  }),
  email: z.string().email("Invalid email"),
  phone: z.string().min(1, "Phone is required"),
  bank_id: z.string().min(1, "Bank is required"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: passwordSchema,
});

export type KYCRegistrationFormData = z.infer<typeof kycRegistrationSchema>;
