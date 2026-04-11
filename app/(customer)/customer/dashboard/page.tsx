"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Shield, FileCheck, Clock, CheckCircle, ArrowRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import KYCStatusBadge from "@/components/kyc/KYCStatusBadge";
import { KYCData } from "@/types/kyc";
import api from "@/lib/api";
import { format } from "date-fns";

export default function CustomerDashboardPage() {
  const { data: session } = useSession();
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">
          Welcome back, {session?.user?.name}!
        </h1>
        <p className="text-gray-500 mt-1">Here&apos;s your KYC status overview</p>
      </div>

      {/* Status Card */}
      <Card className="bg-gradient-to-r from-blue-500 to-blue-600 border-0 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm mb-1">KYC Status</p>
              {loading ? (
                <div className="h-6 w-24 bg-blue-400 rounded animate-pulse" />
              ) : kycData ? (
                <div className="flex items-center gap-2">
                  <KYCStatusBadge status={kycData.status} className="text-sm px-3 py-1" />
                </div>
              ) : (
                <p className="text-white font-semibold">Not Submitted</p>
              )}
            </div>
            <div className="p-3 bg-blue-400/30 rounded-xl">
              <Shield className="h-8 w-8" />
            </div>
          </div>
          {kycData?.status === "VERIFIED" && (
            <p className="text-blue-100 text-sm mt-3 flex items-center gap-1">
              <CheckCircle className="h-4 w-4" />
              Your identity has been verified successfully
            </p>
          )}
          {kycData?.status === "PENDING" && (
            <p className="text-blue-100 text-sm mt-3 flex items-center gap-1">
              <Clock className="h-4 w-4" />
              Your application is under review
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Shield className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">KYC Details</h3>
                <p className="text-gray-500 text-sm">View your KYC information</p>
              </div>
            </div>
            {kycData && (
              <div className="space-y-1 mb-4 text-sm text-gray-600">
                <p>Name: <span className="font-medium text-gray-800">{kycData.first_name} {kycData.last_name}</span></p>
                <p>ID: <span className="font-mono font-medium text-gray-800">{kycData.id_number}</span></p>
                {kycData.verification_date > 0 && (
                  <p>Verified: <span className="font-medium text-gray-800">
                    {format(new Date(kycData.verification_date * 1000), "MMM d, yyyy")}
                  </span></p>
                )}
              </div>
            )}
            <Link href="/customer/kyc">
              <Button variant="outline" size="sm" className="w-full">
                View Details <ArrowRight className="h-3 w-3 ml-1" />
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <FileCheck className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-gray-800">Certificate</h3>
                <p className="text-gray-500 text-sm">Your KYC verification certificate</p>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              {kycData?.status === "VERIFIED"
                ? "Your certificate is available for download."
                : "Certificate will be available after KYC verification."}
            </p>
            <Link href="/customer/certificate">
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={kycData?.status !== "VERIFIED"}
              >
                {kycData?.status === "VERIFIED" ? "Download Certificate" : "Not Available"}
                {kycData?.status === "VERIFIED" && <ArrowRight className="h-3 w-3 ml-1" />}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
