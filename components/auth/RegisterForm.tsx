"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { kycRegistrationSchema, KYCRegistrationFormData } from "@/lib/validations/kyc";
import { Bank } from "@/types/bank";
import axios from "axios";
import KYCScanVerify from "@/components/kyc/KYCScanVerify";

// After /api/v1/kyc/register the backend returns the new customer_id
interface RegisterResponse {
  customer_id: string;
  access_token?: string; // some setups issue a short-lived token for the scan step
  message?: string;
}

export default function RegisterForm() {
  const router = useRouter();
  const [banks, setBanks] = useState<Bank[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // After registration we keep track of the new user for the scan step
  const [registered, setRegistered] = useState<RegisterResponse | null>(null);
  // Once scanning is done (or skipped) we show the final success card
  const [scanComplete, setScanComplete] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<KYCRegistrationFormData>({
    resolver: zodResolver(kycRegistrationSchema),
  });

  useEffect(() => {
    const fetchBanks = async () => {
      try {
        const response = await axios.get(
          `${process.env.NEXT_PUBLIC_API_URL}/api/v1/banks/list`
        );
        setBanks(response.data?.data || response.data || []);
      } catch {
        // Banks list unavailable
      }
    };
    fetchBanks();
  }, []);

  // Step 1: Submit registration form
  const onSubmit = async (data: KYCRegistrationFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      // await axios.post(
      //   `${process.env.NEXT_PUBLIC_API_URL}/api/v1/kyc/register`,
      //   data
      // );
      // setSuccess(true);

      const resp = await axios.post<{ data: RegisterResponse }>(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/kyc/register`,
        data
      );
      const payload = resp.data?.data;
      setRegistered({
        customer_id: payload?.customer_id ?? "",
        access_token: payload?.access_token,
        message: payload?.message,
      });

    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          "Registration failed. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Scan done / skipped
  const handleScanDone = () => {
    setScanComplete(true);
  };

  // Step 3 final success
  if (scanComplete) {
    return (
      <Card className="w-full max-w-md mx-auto shadow-lg">
        <CardContent className="pt-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Registration Submitted!</h2>
          <p className="text-gray-600 mb-4">
            Your KYC registration has been submitted. You will be notified once your account is verified.
          </p>
          <Button onClick={() => router.push("/login/customer")} className="w-full">
            Go to Login
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Step 2: KYC scan verify (after form submit)
  if (registered?.customer_id) {
    return (
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white">Identity Verification</h2>
          <p className="text-gray-400 text-sm mt-1">
            Scan your ID document and take a selfie to complete KYC.
          </p>
        </div>
        <KYCScanVerify
          customerId={registered.customer_id}
          documentType="national_id"
          captureMode="file"  // uses POST /api/v1/kyc/scan-verify/file (multipart)
          apiBaseUrl={process.env.NEXT_PUBLIC_API_URL ?? ""}
          accessToken={registered.access_token ?? ""}
          onDone={handleScanDone}
        />
      </div>
    );
  }

  // ── Step 1: Registration form ────────────────────────────────────────────
  return (
    <Card className="w-full shadow-lg border-0">
      <CardHeader>
        <CardTitle className="text-2xl text-gray-800 flex items-center gap-2">
          <UserPlus className="h-6 w-6" />
          KYC Registration
        </CardTitle>
        <CardDescription>
          Complete all fields to register for KYC verification
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Personal Information */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Personal Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="first_name">First Name</Label>
                <Input id="first_name" placeholder="John" {...register("first_name")} />
                {errors.first_name && <p className="text-red-500 text-xs">{errors.first_name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="last_name">Last Name</Label>
                <Input id="last_name" placeholder="Doe" {...register("last_name")} />
                {errors.last_name && <p className="text-red-500 text-xs">{errors.last_name.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="date_of_birth">Date of Birth</Label>
                <Input id="date_of_birth" type="date" {...register("date_of_birth")} />
                {errors.date_of_birth && <p className="text-red-500 text-xs">{errors.date_of_birth.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="nationality">Nationality</Label>
                <Input id="nationality" placeholder="e.g. Cambodian" {...register("nationality")} />
                {errors.nationality && <p className="text-red-500 text-xs">{errors.nationality.message}</p>}
              </div>
            </div>
          </div>

          {/* Identity Document */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Identity Document
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="id_type">ID Type</Label>
                <Select onValueChange={(v) => setValue("id_type", v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select ID type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="passport">Passport</SelectItem>
                    <SelectItem value="national_id">National ID</SelectItem>
                    <SelectItem value="driver_license">Driver License</SelectItem>
                  </SelectContent>
                </Select>
                {errors.id_type && <p className="text-red-500 text-xs">{errors.id_type.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="id_number">ID Number</Label>
                <Input id="id_number" placeholder="ID number" {...register("id_number")} />
                {errors.id_number && <p className="text-red-500 text-xs">{errors.id_number.message}</p>}
              </div>
              <div className="space-y-1 col-span-2">
                <Label htmlFor="id_expiry_date">ID Expiry Date</Label>
                <Input id="id_expiry_date" type="date" {...register("id_expiry_date")} />
                {errors.id_expiry_date && <p className="text-red-500 text-xs">{errors.id_expiry_date.message}</p>}
              </div>
            </div>
          </div>

          {/* Contact Information */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Contact Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="john@example.com" {...register("email")} />
                {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">Phone</Label>
                <Input id="phone" type="tel" placeholder="+855 12 345 678" {...register("phone")} />
                {errors.phone && <p className="text-red-500 text-xs">{errors.phone.message}</p>}
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Address
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1 col-span-2">
                <Label htmlFor="street">Street</Label>
                <Input id="street" placeholder="123 Main St" {...register("address.street")} />
                {errors.address?.street && <p className="text-red-500 text-xs">{errors.address.street.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="city">City</Label>
                <Input id="city" placeholder="Phnom Penh" {...register("address.city")} />
                {errors.address?.city && <p className="text-red-500 text-xs">{errors.address.city.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="state">State/Province</Label>
                <Input id="state" placeholder="State" {...register("address.state")} />
                {errors.address?.state && <p className="text-red-500 text-xs">{errors.address.state.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="postal_code">Postal Code</Label>
                <Input id="postal_code" placeholder="12000" {...register("address.postal_code")} />
                {errors.address?.postal_code && <p className="text-red-500 text-xs">{errors.address.postal_code.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="country">Country</Label>
                <Input id="country" placeholder="Cambodia" {...register("address.country")} />
                {errors.address?.country && <p className="text-red-500 text-xs">{errors.address.country.message}</p>}
              </div>
            </div>
          </div>

          {/* Bank Selection */}
          <div className="space-y-1">
            <Label htmlFor="bank_id">Bank</Label>
            <Select onValueChange={(v) => setValue("bank_id", v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select your bank" />
              </SelectTrigger>
              <SelectContent>
                {banks.map((bank) => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bank.name} ({bank.code})
                  </SelectItem>
                ))}
                {banks.length === 0 && (
                  <SelectItem value="default">Default Bank</SelectItem>
                )}
              </SelectContent>
            </Select>
            {errors.bank_id && <p className="text-red-500 text-xs">{errors.bank_id.message}</p>}
          </div>

          {/* Account Credentials */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Account Credentials
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="username">Username</Label>
                <Input id="username" placeholder="Choose a username" {...register("username")} />
                {errors.username && <p className="text-red-500 text-xs">{errors.username.message}</p>}
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Min 15 chars, uppercase, number, special"
                  {...register("password")}
                />
                {errors.password && <p className="text-red-500 text-xs">{errors.password.message}</p>}
              </div>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Submitting Registration…
              </>
            ) : (
              "Submit KYC Registration"
            )}
          </Button>

          <p className="text-center text-sm text-gray-500">
            Already registered?{" "}
            <Link href="/login/customer" className="text-blue-600 hover:text-blue-500">
              Sign in
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
