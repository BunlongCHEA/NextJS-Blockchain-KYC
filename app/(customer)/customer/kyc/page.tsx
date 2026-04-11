"use client";

import { useEffect, useState } from "react";
import { Shield, MapPin, CreditCard, Phone, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import KYCStatusBadge from "@/components/kyc/KYCStatusBadge";
import { KYCData } from "@/types/kyc";
import api from "@/lib/api";
import { format } from "date-fns";

function InfoRow({ label, value }: { label: string; value?: string | number }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0">
      <span className="text-gray-500 text-sm w-36 shrink-0">{label}</span>
      <span className="text-gray-800 text-sm font-medium">{value || "-"}</span>
    </div>
  );
}

export default function CustomerKYCPage() {
  const [kycData, setKycData] = useState<KYCData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchKYC = async () => {
      try {
        const res = await api.get("/api/v1/kyc/me");
        setKycData(res.data?.data || res.data);
      } catch {
        setKycData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchKYC();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!kycData) {
    return (
      <div className="text-center py-12">
        <Shield className="h-12 w-12 text-gray-300 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">No KYC Data Found</h2>
        <p className="text-gray-500">Your KYC information could not be loaded.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">My KYC Information</h1>
          <p className="text-gray-500 mt-1">Your submitted KYC details</p>
        </div>
        <KYCStatusBadge status={kycData.status} className="text-sm px-3 py-1" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Personal Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-gray-700">
              <CreditCard className="h-4 w-4 text-blue-500" />
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label="Full Name" value={`${kycData.first_name} ${kycData.last_name}`} />
            <InfoRow label="Date of Birth" value={kycData.date_of_birth} />
            <InfoRow label="Nationality" value={kycData.nationality} />
            <InfoRow label="ID Type" value={kycData.id_type?.replace("_", " ")} />
            <InfoRow label="ID Number" value={kycData.id_number} />
            <InfoRow label="ID Expiry" value={kycData.id_expiry_date} />
          </CardContent>
        </Card>

        {/* Contact Information */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-gray-700">
              <Phone className="h-4 w-4 text-green-500" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label="Email" value={kycData.email} />
            <InfoRow label="Phone" value={kycData.phone} />
          </CardContent>
        </Card>

        {/* Address */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-gray-700">
              <MapPin className="h-4 w-4 text-red-500" />
              Address
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow label="Street" value={kycData.address?.street} />
            <InfoRow label="City" value={kycData.address?.city} />
            <InfoRow label="State" value={kycData.address?.state} />
            <InfoRow label="Postal Code" value={kycData.address?.postal_code} />
            <InfoRow label="Country" value={kycData.address?.country} />
          </CardContent>
        </Card>

        {/* Verification Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-gray-700">
              <Calendar className="h-4 w-4 text-purple-500" />
              Verification Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow
              label="Status"
              value={kycData.status}
            />
            <InfoRow label="Risk Level" value={kycData.risk_level || "low"} />
            {kycData.verification_date > 0 && (
              <InfoRow
                label="Verified On"
                value={format(new Date(kycData.verification_date * 1000), "MMM d, yyyy")}
              />
            )}
            {kycData.next_review_date > 0 && (
              <InfoRow
                label="Next Review"
                value={format(new Date(kycData.next_review_date * 1000), "MMM d, yyyy")}
              />
            )}
            <InfoRow label="Scan Score" value={kycData.scan_score?.toString()} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
