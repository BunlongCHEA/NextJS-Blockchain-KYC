"use client";

import { useEffect, useState } from "react";
import {
  Shield, MapPin, CreditCard, Phone, Calendar,
  CheckCircle2, Clock, XCircle, AlertTriangle, RefreshCw,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { KYCData } from "@/types/kyc";
import api from "@/lib/api";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";

function safeDate(unix: number | null | undefined): Date | null {
  if (!unix || unix <= 0) return null;
  try { const d = new Date(unix * 1000); return isNaN(d.getTime()) ? null : d; } catch { return null; }
}

function InfoRow({ label, value, mono = false, highlight = false }: {
  label: string; value?: string | number | null; mono?: boolean; highlight?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-slate-100 last:border-0">
      <span className="text-slate-500 text-xs w-32 shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm flex-1 ${mono ? "font-mono" : "font-medium"} ${
        highlight ? "text-emerald-700" : "text-slate-800"
      } ${!value ? "text-slate-400 font-normal" : ""}`}>
        {value || "—"}
      </span>
    </div>
  );
}

const STATUS_ICON: Record<string, React.ElementType> = {
  VERIFIED: CheckCircle2, PENDING: Clock, REJECTED: XCircle,
  SUSPENDED: AlertTriangle, EXPIRED: Clock,
};
const STATUS_COLOR: Record<string, string> = {
  VERIFIED: "text-emerald-600 bg-emerald-50 border-emerald-200",
  PENDING:  "text-amber-600  bg-amber-50  border-amber-200",
  REJECTED: "text-red-600    bg-red-50    border-red-200",
  SUSPENDED:"text-orange-600 bg-orange-50 border-orange-200",
  EXPIRED:  "text-gray-600   bg-gray-50   border-gray-200",
};

export default function CustomerKYCPage() {
  const [kycData,  setKycData]  = useState<KYCData | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [showScan, setShowScan] = useState(false);

  const fetchKyc = async () => {
    setLoading(true);
    try {
      // /kyc/me requires Go route from bank-customer-go-additions.go
      // Go wraps response as: { success, data: { kyc_data:{...}, on_blockchain:bool } }
      const r = await api.get("/api/v1/kyc/me");
      const payload = r.data?.data;
      const kyc = payload?.kyc_data ?? (payload?.customer_id ? payload : null);
      setKycData(kyc ?? null);
    } catch { setKycData(null); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchKyc(); }, []);

  if (loading) return (
    <div className="space-y-4">
      {[...Array(3)].map((_,i) => <Skeleton key={i} className="h-52 w-full rounded-xl"/>)}
    </div>
  );

  if (!kycData) return (
    <div className="text-center py-16">
      <Shield className="h-14 w-14 text-slate-200 mx-auto mb-4"/>
      <h2 className="text-lg font-bold text-slate-700">No KYC Record Found</h2>
      <p className="text-slate-400 text-sm mt-1">Your KYC information could not be loaded.</p>
    </div>
  );

  const statusColor = STATUS_COLOR[kycData.status] ?? STATUS_COLOR.PENDING;
  const StatusIcon  = STATUS_ICON[kycData.status] ?? Clock;
  const verDate     = safeDate(kycData.verification_date);
  const nextReview  = safeDate(kycData.next_review_date);
  const daysToReview = nextReview ? differenceInDays(nextReview, new Date()) : null;
  const reviewSoon   = daysToReview !== null && daysToReview <= 60;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">My KYC</h1>
          <p className="text-slate-400 text-sm">Your submitted identity details</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`text-xs border ${statusColor} flex items-center gap-1 px-2.5 py-1`}>
            <StatusIcon className="h-3 w-3"/>{kycData.status}
          </Badge>
          <Button onClick={fetchKyc} variant="outline" size="sm" className="border-slate-200 text-slate-500 text-xs h-8">
            <RefreshCw className="h-3.5 w-3.5"/>
          </Button>
        </div>
      </div>

      {/* Review warning */}
      {reviewSoon && (
        <div className={`flex items-start gap-3 rounded-xl border p-4 ${daysToReview!<14?"bg-red-50 border-red-200":"bg-amber-50 border-amber-200"}`}>
          <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${daysToReview!<14?"text-red-500":"text-amber-500"}`}/>
          <div>
            <p className={`text-sm font-medium ${daysToReview!<14?"text-red-700":"text-amber-700"}`}>
              Periodic review due {daysToReview! <= 0 ? "now" : `in ${daysToReview} days`}
            </p>
            <p className="text-xs mt-0.5 text-slate-500">
              Contact your bank ({kycData.bank_id}) to complete the review and keep your KYC active.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Personal */}
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-500"/>Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <InfoRow label="Full Name"    value={`${kycData.first_name} ${kycData.last_name}`}/>
            <InfoRow label="Date of Birth" value={kycData.date_of_birth}/>
            <InfoRow label="Nationality"  value={kycData.nationality}/>
            <InfoRow label="ID Type"      value={kycData.id_type?.replace(/_/g," ")}/>
            <InfoRow label="ID Number"    value={kycData.id_number} mono/>
            <InfoRow label="ID Expiry"    value={kycData.id_expiry_date}/>
          </CardContent>
        </Card>

        {/* Contact */}
        <Card className="border border-slate-200 shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <Phone className="h-4 w-4 text-green-500"/>Contact & Address
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <InfoRow label="Email" value={kycData.email}/>
            <InfoRow label="Phone" value={kycData.phone}/>
            <InfoRow label="Street"      value={kycData.address?.street}/>
            <InfoRow label="City"        value={kycData.address?.city}/>
            <InfoRow label="State"       value={kycData.address?.state}/>
            <InfoRow label="Postal"      value={kycData.address?.postal_code}/>
            <InfoRow label="Country"     value={kycData.address?.country}/>
          </CardContent>
        </Card>

        {/* Verification */}
        <Card className={`border shadow-sm ${kycData.status==="VERIFIED"?"border-emerald-200":"border-slate-200"}`}>
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-sm text-slate-700 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-purple-500"/>Verification Status
            </CardTitle>
          </CardHeader>
          <CardContent className="px-5 pb-5">
            <InfoRow label="Status"     value={kycData.status} highlight={kycData.status==="VERIFIED"}/>
            <InfoRow label="Risk Level" value={kycData.risk_level}/>
            <InfoRow label="Bank"       value={kycData.bank_id}/>
            {verDate && <InfoRow label="Verified"  value={format(verDate,"MMM d, yyyy")}/>}
            {nextReview && (
              <InfoRow
                label="Next Review"
                value={`${format(nextReview,"MMM d, yyyy")}${daysToReview!>0?` (${daysToReview}d)`:""}`}
              />
            )}
            <InfoRow label="Review Count" value={kycData.review_count}/>
          </CardContent>
        </Card>

        {/* AI Scan — collapsible */}
        {(kycData.scan_score != null || kycData.scan_status) && (
          <Card className="border border-slate-200 shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm text-slate-700 flex items-center gap-2 cursor-pointer"
                onClick={()=>setShowScan(p=>!p)}>
                <Shield className="h-4 w-4 text-indigo-500"/>
                AI Scan Results
                {showScan ? <ChevronUp className="h-3.5 w-3.5 ml-auto text-slate-400"/> : <ChevronDown className="h-3.5 w-3.5 ml-auto text-slate-400"/>}
              </CardTitle>
            </CardHeader>
            {showScan && (
              <CardContent className="px-5 pb-5">
                <InfoRow label="Scan Status" value={kycData.scan_status}/>
                <InfoRow label="Score"       value={kycData.scan_score != null ? `${kycData.scan_score}%` : undefined}/>
                {kycData.last_scan_at && (
                  <InfoRow label="Last Scan"
                    value={formatDistanceToNow(new Date(kycData.last_scan_at as unknown as string), { addSuffix: true })}/>
                )}
                {kycData.verified_by && <InfoRow label="Verified By" value={kycData.verified_by} mono/>}
              </CardContent>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}