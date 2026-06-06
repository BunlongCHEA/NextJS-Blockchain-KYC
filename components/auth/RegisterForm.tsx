"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { kycRegistrationSchema, KYCRegistrationFormData } from "@/lib/validations/kyc";
import { Bank } from "@/types/bank";
import axios from "axios";
import KYCScanVerify from "@/components/kyc/KYCScanVerify";

const COUNTRIES = [
  // Southeast Asia — primary market
  { iso: "KH", name: "Cambodia",      dial: "855" },
  { iso: "LA", name: "Laos",          dial: "856" },
  { iso: "MM", name: "Myanmar",       dial: "95"  },
  { iso: "TH", name: "Thailand",      dial: "66"  },
  { iso: "VN", name: "Vietnam",       dial: "84"  },
  { iso: "SG", name: "Singapore",     dial: "65"  },
  { iso: "MY", name: "Malaysia",      dial: "60"  },
  { iso: "ID", name: "Indonesia",     dial: "62"  },
  { iso: "PH", name: "Philippines",   dial: "63"  },
  { iso: "BN", name: "Brunei",        dial: "673" },
  // East Asia
  { iso: "CN", name: "China",         dial: "86"  },
  { iso: "JP", name: "Japan",         dial: "81"  },
  { iso: "KR", name: "South Korea",   dial: "82"  },
  { iso: "TW", name: "Taiwan",        dial: "886" },
  { iso: "HK", name: "Hong Kong",     dial: "852" },
  // South Asia
  { iso: "IN", name: "India",         dial: "91"  },
  { iso: "BD", name: "Bangladesh",    dial: "880" },
  // Middle East
  { iso: "AE", name: "UAE",           dial: "971" },
  { iso: "SA", name: "Saudi Arabia",  dial: "966" },
  // Western
  { iso: "US", name: "United States", dial: "1"   },
  { iso: "CA", name: "Canada",        dial: "1"   },
  { iso: "GB", name: "United Kingdom",dial: "44"  },
  { iso: "FR", name: "France",        dial: "33"  },
  { iso: "DE", name: "Germany",       dial: "49"  },
  { iso: "AU", name: "Australia",     dial: "61"  },
] as const;
 
type CountryISO = typeof COUNTRIES[number]["iso"];
 
// ── Province / State dropdown lists (country-specific) ───────────────────────
const PROVINCES_BY_COUNTRY: Partial<Record<CountryISO, readonly string[]>> = {
  KH: [
    "Banteay Meanchey","Battambang","Kampong Cham","Kampong Chhnang",
    "Kampong Speu","Kampong Thom","Kampot","Kandal","Kep","Koh Kong",
    "Kratie","Mondulkiri","Oddar Meanchey","Pailin","Phnom Penh",
    "Preah Sihanouk","Preah Vihear","Prey Veng","Pursat","Ratanakiri",
    "Siem Reap","Stung Treng","Svay Rieng","Takeo","Tbong Khmum",
  ],
  TH: [
    "Bangkok","Chiang Mai","Chiang Rai","Chonburi","Nakhon Ratchasima",
    "Nonthaburi","Pathum Thani","Phuket","Samut Prakan","Songkhla",
    "Surat Thani","Udon Thani",
  ],
  VN: [
    "An Giang","Ba Ria-Vung Tau","Bac Ninh","Binh Duong","Can Tho",
    "Da Nang","Dong Nai","Ha Noi","Hai Phong","Ho Chi Minh City",
    "Khanh Hoa","Lam Dong","Long An","Quang Ninh","Thua Thien Hue",
  ],
};
 
// ── Helpers ───────────────────────────────────────────────────────────────────
 
/** ISO 3166-1 alpha-2 → regional indicator emoji. "KH" → "🇰🇭" */
const toFlag = (iso: string): string =>
  iso.toUpperCase().split("").map((c) =>
    String.fromCodePoint(c.charCodeAt(0) + 127397)
  ).join("");
 
/** Remove leading zeros and non-digit characters from a local phone number.
 *  "012 345 678" → "12345678" */
const sanitizeLocal = (raw: string): string =>
  raw.replace(/\D/g, "").replace(/^0+/, "");
 
// ══════════════════════════════════════════════════════════════════════════════
//  Street address combiner
//
//  The three sub-fields (houseNo, streetName, district) are stored as one
//  comma-separated string in a SINGLE DB column (address_street in Go-KYC,
//  line1 in CBS addresses).
//
//  Canonical format:  "<HouseNo>, <StreetName>, <District>"
//  Empty parts are filtered so format degrades gracefully:
//    "123A", "Street 271", "" → "123A, Street 271"
//    "",     "Norodom Blvd", "Daun Penh" → "Norodom Blvd, Daun Penh"
//
//  CBS normalizeStreet() and Go-KYC normalizeAddressStreet() both parse this
//  format and apply consistent normalization before comparison.
// ══════════════════════════════════════════════════════════════════════════════
const combineStreet = (houseNo: string, streetName: string, district: string): string =>
  [houseNo.trim(), streetName.trim(), district.trim()]
    .filter(Boolean)
    .join(", ");
 
// ── Types ─────────────────────────────────────────────────────────────────────
interface RegisteredSession {
  customerId: string;
  accessToken: string;
  username: string;
  password: string;
}
 
// ══════════════════════════════════════════════════════════════════════════════
//  Component
// ══════════════════════════════════════════════════════════════════════════════
export default function RegisterForm() {
  const router   = useRouter();
  const [banks, setBanks]               = useState<Bank[]>([]);
  const [error, setError]               = useState<string | null>(null);
  const [isLoading, setIsLoading]       = useState(false);
  const [session, setSession]           = useState<RegisteredSession | null>(null);
  const [scanComplete, setScanComplete] = useState(false);
 
  // ── Phone compound-input state ─────────────────────────────────────────────
  const [phoneCountryISO, setPhoneCountryISO] = useState<CountryISO>("KH");
  const [phoneLocal, setPhoneLocal]           = useState("");
 
  // ── Street sub-field state ─────────────────────────────────────────────────
  // These three drive a single address.street form value via useEffect below.
  const [streetHouseNo,   setStreetHouseNo]   = useState("");
  const [streetName,      setStreetName]      = useState("");
  const [streetDistrict,  setStreetDistrict]  = useState("");
 
  // Live preview of the combined value (shown under the inputs)
  const [combinedStreet, setCombinedStreet] = useState("");
 
  // ── Address country state ─────────────────────────────────────────────────
  const [addressCountryISO, setAddressCountryISO] = useState<CountryISO>("KH");
 
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<KYCRegistrationFormData>({
    resolver: zodResolver(kycRegistrationSchema),
    defaultValues: { address: { country: "KH" } },
  });
 
  const idTypeValue = watch("id_type");
 
  // ── Sync phone sub-fields → form "phone" field ────────────────────────────
  useEffect(() => {
    const country = COUNTRIES.find((c) => c.iso === phoneCountryISO);
    const digits  = sanitizeLocal(phoneLocal);
    setValue("phone", digits ? `+${country?.dial ?? "855"}${digits}` : "", {
      shouldValidate: !!digits,
    });
  }, [phoneCountryISO, phoneLocal, setValue]);
 
  // ── Sync street sub-fields → form "address.street" field ─────────────────
  // Combines "HouseNo, StreetName, District" into a single string.
  // Go-KYC stores this in address_street; CBS stores it in addresses.line1.
  // Both are normalised by their respective normalizeStreet() / normalizeAddressStreet()
  // functions before any comparison, so minor whitespace/abbreviation variants match.
  useEffect(() => {
    const combined = combineStreet(streetHouseNo, streetName, streetDistrict);
    setCombinedStreet(combined);
    setValue("address.street", combined, { shouldValidate: !!combined });
  }, [streetHouseNo, streetName, streetDistrict, setValue]);
 
  // ── Load bank list ─────────────────────────────────────────────────────────
  useEffect(() => {
    axios
      .get(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/banks/list`)
      .then((res) => setBanks(res.data?.data || res.data || []))
      .catch(() => {/* continue without list */});
  }, []);
 
  // ── Handlers ──────────────────────────────────────────────────────────────
  const handlePhoneCountryChange = (iso: string) =>
    setPhoneCountryISO(iso as CountryISO);
 
  const handleAddressCountryChange = (iso: string) => {
    const typedISO = iso as CountryISO;
    setAddressCountryISO(typedISO);
    setValue("address.country", iso);
    setValue("address.state", ""); // reset province when country changes
  };
 
  // ── Province list for current address country ─────────────────────────────
  const addressProvinces: readonly string[] =
    PROVINCES_BY_COUNTRY[addressCountryISO] ?? [];
 
  // ── Submit ─────────────────────────────────────────────────────────────────
  const onSubmit = async (data: KYCRegistrationFormData) => {
    setIsLoading(true);
    setError(null);
    const base = process.env.NEXT_PUBLIC_API_URL;
    try {
      // Step A: create auth user
      await axios.post(`${base}/api/v1/auth/register`, {
        username: data.username, email: data.email,
        password: data.password, role: "customer", bank_id: data.bank_id,
      });
 
      // Step B: login → get token
      const loginRes  = await axios.post(`${base}/api/v1/auth/login`, {
        username: data.username, password: data.password,
      });
      const accessToken: string =
        loginRes.data?.data?.access_token ?? loginRes.data?.access_token ?? "";
 
      // Step C: create KYC profile
      // data.address.street  = "HouseNo, StreetName, District" (combined by useEffect)
      // data.address.country = ISO code e.g. "KH"
      // data.phone           = "+85512345678" (combined by useEffect)
      const kycRes = await axios.post(
        `${base}/api/v1/kyc`,
        {
          first_name:     data.first_name,
          last_name:      data.last_name,
          date_of_birth:  data.date_of_birth,
          nationality:    data.nationality,
          id_type:        data.id_type,
          id_number:      data.id_number,
          id_expiry_date: data.id_expiry_date,
          address:        data.address,
          email:          data.email,
          phone:          data.phone,
          bank_id:        data.bank_id,
        },
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
 
      const customerId: string =
        kycRes.data?.data?.customer_id ?? kycRes.data?.customer_id ?? "";
 
      setSession({ customerId, accessToken, username: data.username, password: data.password });
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
 
  // ── Success / scan screens ─────────────────────────────────────────────────
  if (scanComplete) {
    return (
      <Card className="w-full max-w-md mx-auto shadow-lg">
        <CardContent className="pt-6 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <UserPlus className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">Registration Submitted!</h2>
          <p className="text-gray-600 mb-4">
            Your KYC registration has been submitted. You will be notified once verified.
          </p>
          <Button onClick={() => router.push("/login/customer")} className="w-full">
            Go to Login
          </Button>
        </CardContent>
      </Card>
    );
  }
 
  if (session?.customerId) {
    return (
      <div className="w-full max-w-lg space-y-4">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white">Identity Verification</h2>
          <p className="text-gray-400 text-sm mt-1">
            Scan your ID document and take a selfie to complete KYC.
          </p>
        </div>
        <KYCScanVerify
          customerId={session.customerId}
          documentType={
            (idTypeValue === "passport" ? "passport" : "national_id") as
              "national_id" | "passport" | "driver_license"
          }
          captureMode="file"
          apiBaseUrl={process.env.NEXT_PUBLIC_API_URL ?? ""}
          accessToken={session.accessToken}
          onDone={() => setScanComplete(true)}
        />
      </div>
    );
  }
 
  // ── Registration form ──────────────────────────────────────────────────────
  const phoneCountry = COUNTRIES.find((c) => c.iso === phoneCountryISO) ?? COUNTRIES[0];
 
  return (
    <Card className="w-full shadow-lg border-0">
      <CardHeader>
        <CardTitle className="text-2xl text-gray-800 flex items-center gap-2">
          <UserPlus className="h-6 w-6" />
          KYC Registration
        </CardTitle>
        <CardDescription>Complete all fields to register for KYC verification</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
 
          {/* ── Personal Information ──────────────────────────────────── */}
          <section>
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
          </section>
 
          {/* ── Identity Document ─────────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Identity Document
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>ID Type</Label>
                <Select onValueChange={(v) => setValue("id_type", v as any)}>
                  <SelectTrigger><SelectValue placeholder="Select ID type" /></SelectTrigger>
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
          </section>
 
          {/* ── Contact Information ───────────────────────────────────── */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Contact Information
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" placeholder="john@example.com" {...register("email")} />
                {errors.email && <p className="text-red-500 text-xs">{errors.email.message}</p>}
              </div>
 
              {/* ── Phone: flag+dialcode selector + local number ─────── */}
              <div className="space-y-1">
                <Label htmlFor="phone_local">Phone</Label>
                <div className="flex">
                  {/* Country-code / flag selector */}
                  <Select value={phoneCountryISO} onValueChange={handlePhoneCountryChange}>
                    <SelectTrigger
                      className="w-[110px] rounded-r-none border-r-0 px-2 flex-shrink-0 focus:ring-0 focus:ring-offset-0"
                      aria-label="Phone country code"
                    >
                      <span className="flex items-center gap-1 text-sm">
                        <span className="text-base leading-none">{toFlag(phoneCountryISO)}</span>
                        <span className="text-gray-600">+{phoneCountry.dial}</span>
                        <ChevronDown className="h-3 w-3 text-gray-400 ml-auto" />
                      </span>
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.iso} value={c.iso}>
                          <span className="flex items-center gap-2">
                            <span className="text-base">{toFlag(c.iso)}</span>
                            <span className="text-gray-500 text-xs w-8">+{c.dial}</span>
                            <span>{c.name}</span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {/* Local number — digits only; leading zeros stripped by sanitizeLocal() */}
                  <Input
                    id="phone_local"
                    inputMode="numeric"
                    placeholder="12 345 678"
                    className="rounded-l-none flex-1"
                    value={phoneLocal}
                    onChange={(e) =>
                      setPhoneLocal(e.target.value.replace(/[^\d\s]/g, ""))
                    }
                  />
                </div>
                {/* Hidden field keeps the combined "+85512345678" for zod */}
                <input type="hidden" {...register("phone")} />
                <p className="text-gray-400 text-xs">
                  Enter digits only — no leading 0, no country code
                </p>
                {errors.phone && <p className="text-red-500 text-xs">{errors.phone.message}</p>}
              </div>
            </div>
          </section>
 
          {/* ── Address ───────────────────────────────────────────────── */}
          {/*
           * STREET ADDRESS DESIGN
           * ────────────────────
           * The street is split into three separate inputs to enforce
           * a canonical format in the database.  All three are combined
           * (via combineStreet()) into a single comma-separated string
           * before the form submits:
           *
           *   "HouseNo, StreetName, District"
           *   e.g. "123A, Street 271, Boeng Keng Kang I"
           *
           * This combined string is stored in:
           *   Go-KYC  → address_street column (via SaveKYC normalizeAddressStreet)
           *   CBS     → addresses.line1       (via buildAddress)
           *
           * CBS addressMatches() applies normalizeStreet() to both sides
           * before comparing, so minor abbreviation variants ("St." vs "Street")
           * still match correctly.
           *
           * Country → ISO 3166-1 alpha-2 dropdown ("KH" not "Cambodia")
           *   CBS buildAddress() substring(0,2) then gives "KH" ✅
           *
           * State/Province → dropdown where list is defined, else free text
           */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
              Address
            </h3>
            <div className="grid grid-cols-2 gap-4">
 
              {/* ── Street: 3-part input → combined into address.street ─ */}
              <div className="space-y-2 col-span-2">
                <Label>Street Address</Label>
 
                {/* Row 1: House/Unit No + Street Name */}
                <div className="grid grid-cols-5 gap-2">
                  <div className="col-span-1">
                    <Input
                      placeholder="No. / Unit"
                      value={streetHouseNo}
                      onChange={(e) => setStreetHouseNo(e.target.value)}
                      aria-label="House or unit number"
                    />
                  </div>
                  <div className="col-span-4">
                    <Input
                      placeholder="Street name (e.g. Street 271, Norodom Blvd)"
                      value={streetName}
                      onChange={(e) => setStreetName(e.target.value)}
                      aria-label="Street name"
                    />
                  </div>
                </div>
 
                {/* Row 2: District / Sangkat / County */}
                <Input
                  placeholder="District / Sangkat / County (e.g. Boeng Keng Kang I)"
                  value={streetDistrict}
                  onChange={(e) => setStreetDistrict(e.target.value)}
                  aria-label="District or Sangkat"
                />
 
                {/* Live preview of combined DB value */}
                {combinedStreet ? (
                  <p className="text-gray-400 text-xs">
                    Stored as:{" "}
                    <span className="font-mono text-gray-600 bg-gray-50 px-1 rounded">
                      {combinedStreet}
                    </span>
                  </p>
                ) : (
                  <p className="text-gray-400 text-xs">
                    All three parts are stored as one field: "No., Street, District"
                  </p>
                )}
 
                {/* Hidden registered field holds the combined value for zod */}
                <input type="hidden" {...register("address.street")} />
                {errors.address?.street && (
                  <p className="text-red-500 text-xs">{errors.address.street.message}</p>
                )}
              </div>
 
              {/* City */}
              <div className="space-y-1">
                <Label htmlFor="city">City</Label>
                <Input id="city" placeholder="Phnom Penh" {...register("address.city")} />
                {errors.address?.city && <p className="text-red-500 text-xs">{errors.address.city.message}</p>}
              </div>
 
              {/* State / Province — dropdown when country has a defined list */}
              <div className="space-y-1">
                <Label>State / Province</Label>
                {addressProvinces.length > 0 ? (
                  <Select onValueChange={(v) => setValue("address.state", v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select province" />
                    </SelectTrigger>
                    <SelectContent className="max-h-64">
                      {addressProvinces.map((p) => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input placeholder="State / Province" {...register("address.state")} />
                )}
                {errors.address?.state && <p className="text-red-500 text-xs">{errors.address.state.message}</p>}
              </div>
 
              {/* Postal Code */}
              <div className="space-y-1">
                <Label htmlFor="postal_code">Postal Code</Label>
                <Input
                  id="postal_code"
                  inputMode="numeric"
                  placeholder="12000"
                  {...register("address.postal_code")}
                />
                {errors.address?.postal_code && <p className="text-red-500 text-xs">{errors.address.postal_code.message}</p>}
              </div>
 
              {/* Country — ISO code dropdown */}
              <div className="space-y-1">
                <Label>Country</Label>
                <Select defaultValue="KH" onValueChange={handleAddressCountryChange}>
                  <SelectTrigger>
                    <SelectValue>
                      <span className="flex items-center gap-2">
                        <span className="text-base">{toFlag(addressCountryISO)}</span>
                        <span>{COUNTRIES.find((c) => c.iso === addressCountryISO)?.name ?? addressCountryISO}</span>
                      </span>
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c.iso} value={c.iso}>
                        <span className="flex items-center gap-2">
                          <span className="text-base">{toFlag(c.iso)}</span>
                          <span>{c.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <input type="hidden" {...register("address.country")} />
                {errors.address?.country && <p className="text-red-500 text-xs">{errors.address.country.message}</p>}
              </div>
 
            </div>
          </section>
 
          {/* ── Bank ──────────────────────────────────────────────────── */}
          <div className="space-y-1">
            <Label>Bank</Label>
            <Select onValueChange={(v) => setValue("bank_id", v)}>
              <SelectTrigger><SelectValue placeholder="Select your bank" /></SelectTrigger>
              <SelectContent>
                {banks.map((bank) => (
                  <SelectItem key={bank.id} value={bank.id}>
                    {bank.name} ({bank.code})
                  </SelectItem>
                ))}
                {banks.length === 0 && <SelectItem value="default">Default Bank</SelectItem>}
              </SelectContent>
            </Select>
            {errors.bank_id && <p className="text-red-500 text-xs">{errors.bank_id.message}</p>}
          </div>
 
          {/* ── Account Credentials ───────────────────────────────────── */}
          <section>
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
          </section>
 
          <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700" disabled={isLoading}>
            {isLoading ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting Registration…</>
            ) : "Submit KYC Registration"}
          </Button>
 
          <p className="text-center text-sm text-gray-500">
            Already registered?{" "}
            <Link href="/login/customer" className="text-blue-600 hover:text-blue-500">Sign in</Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}