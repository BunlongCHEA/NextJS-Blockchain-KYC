"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  Shield, FileCheck, Clock, CheckCircle2, ArrowRight,
  AlertTriangle, XCircle, Hourglass, Star, RefreshCw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { KYCData } from "@/types/kyc";
import api from "@/lib/api";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";

// ─── Safe date ────────────────────────────────────────────────────────────────
function safeDate(unix: number | null | undefined): Date | null {
  if (!unix || unix <= 0) return null;
  try { const d = new Date(unix * 1000); return isNaN(d.getTime()) ? null : d; } catch { return null; }
}

// ─── KYC status config ────────────────────────────────────────────────────────
const STATUS_CFG: Record<string, { label: string; color: string; bg: string; border: string; icon: React.ElementType }> = {
  VERIFIED:  { label: "Verified",  color: "text-emerald-700", bg: "bg-emerald-50",  border: "border-emerald-200", icon: CheckCircle2   },
  PENDING:   { label: "Pending",   color: "text-amber-700",   bg: "bg-amber-50",    border: "border-amber-200",   icon: Hourglass      },
  REJECTED:  { label: "Rejected",  color: "text-red-700",     bg: "bg-red-50",      border: "border-red-200",     icon: XCircle        },
  SUSPENDED: { label: "Suspended", color: "text-orange-700",  bg: "bg-orange-50",   border: "border-orange-200",  icon: AlertTriangle  },
  EXPIRED:   { label: "Expired",   color: "text-gray-700",    bg: "bg-gray-50",     border: "border-gray-200",    icon: Clock          },
};

interface Certificate {
  id: string; certificate_id: string; customer_name: string;
  issued_at: number; expires_at: number; status: string;
  requester_id: string; kyc_summary?: { risk_level?: string };
}

export default function CustomerDashboardPage() {
  const { data: session } = useSession();
  const [kycData,   setKycData]   = useState<KYCData | null>(null);
  const [certs,     setCerts]     = useState<Certificate[]>([]);
  const [kycLoad,   setKycLoad]   = useState(true);
  const [certLoad,  setCertLoad]  = useState(true);

  const fetchAll = async () => {
    setKycLoad(true); setCertLoad(true);

    // ── KYC: try /kyc/me (requires Go route from bank-customer-go-additions.go)
    // Falls back gracefully if the route is not yet deployed — shows "no KYC" state.
    api.get("/api/v1/kyc/me")
      .then(r => {
        // Go GetKYC wraps data as: { kyc_data: {...}, on_blockchain: bool }
        const payload = r.data?.data;
        const kyc = payload?.kyc_data ?? (payload?.customer_id ? payload : null);
        setKycData(kyc ?? null);
      })
      .catch(() => setKycData(null))
      .finally(() => setKycLoad(false));

    // ── Certs: try /certificates/me (requires Go route from bank-customer-go-additions.go)
    // Guard: always normalize to array regardless of response shape.
    api.get("/api/v1/certificates/me")
      .then(r => {
        const payload = r.data?.data;
        // Handle both { certificates: [...] } and flat array
        const arr = Array.isArray(payload?.certificates) ? payload.certificates
          : Array.isArray(payload) ? payload
          : [];
        setCerts(arr);
      })
      .catch(() => setCerts([]))
      .finally(() => setCertLoad(false));
  };

  useEffect(() => { fetchAll(); }, []);

  const cfg         = kycData ? (STATUS_CFG[kycData.status] ?? STATUS_CFG.PENDING) : null;
  const latestCert  = certs[0] ?? null;
  const certExpiry  = safeDate(latestCert?.expires_at);
  const daysLeft    = certExpiry ? differenceInDays(certExpiry, new Date()) : null;
  const certExpired = daysLeft !== null && daysLeft < 0;

  // Certificate availability state
  const certState: "none" | "awaiting" | "active" | "expired" =
    !kycData ? "none"
    : kycData.status !== "VERIFIED" ? "none"
    : !latestCert ? "awaiting"
    : certExpired  ? "expired"
    : "active";

  return (
    <div className="space-y-5">

      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">
            Welcome, {session?.user?.name ?? "Customer"}
          </h1>
          <p className="text-slate-500 text-sm">KYC verification status at a glance</p>
        </div>
        <Button onClick={fetchAll} variant="outline" size="sm" className="text-slate-500 border-slate-200 text-xs">
          <RefreshCw className="h-3.5 w-3.5 mr-1.5"/>Refresh
        </Button>
      </div>

      {/* KYC status hero card */}
      <Card className={`border-2 ${cfg?.border ?? "border-slate-200"} ${cfg?.bg ?? "bg-white"} shadow-sm`}>
        <CardContent className="p-5">
          {kycLoad ? (
            <div className="space-y-2"><Skeleton className="h-6 w-32"/><Skeleton className="h-4 w-48"/></div>
          ) : !kycData ? (
            <div className="flex items-start gap-4">
              <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                <Shield className="h-6 w-6 text-slate-400"/>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-slate-700">KYC Not Submitted</p>
                <p className="text-slate-500 text-sm mt-0.5">You haven't submitted a KYC application yet.</p>
              </div>
            </div>
          ) : (() => {
            const Icon = cfg!.icon;
            return (
              <div className="flex items-start gap-4">
                <div className={`h-12 w-12 rounded-xl ${cfg!.bg} border ${cfg!.border} flex items-center justify-center shrink-0`}>
                  <Icon className={`h-6 w-6 ${cfg!.color}`}/>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-slate-800 text-lg">
                      {kycData.first_name} {kycData.last_name}
                    </p>
                    <Badge className={`text-xs ${cfg!.color} ${cfg!.bg} border ${cfg!.border}`}>
                      {cfg!.label}
                    </Badge>
                    {kycData.risk_level && (
                      <Badge className="text-xs bg-slate-100 text-slate-500 border-slate-200">
                        Risk: {kycData.risk_level}
                      </Badge>
                    )}
                  </div>
                  <p className="text-slate-500 text-sm mt-1">
                    {kycData.status === "VERIFIED" && kycData.verification_date > 0 && (
                      <>Verified {formatDistanceToNow(new Date(kycData.verification_date * 1000), { addSuffix: true })}</>
                    )}
                    {kycData.status === "PENDING" && "Your application is under review"}
                    {kycData.status === "REJECTED" && "Your application was not approved"}
                    {kycData.status === "SUSPENDED" && "Your KYC has been temporarily suspended"}
                  </p>
                </div>
                <Link href="/customer/kyc">
                  <Button variant="outline" size="sm" className="shrink-0 text-xs border-slate-200">
                    View Details<ArrowRight className="h-3 w-3 ml-1"/>
                  </Button>
                </Link>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* Two-column: KYC + Certificate */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

        {/* KYC card */}
        <Card className="border border-slate-200 shadow-sm">
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-9 w-9 rounded-lg bg-blue-50 flex items-center justify-center">
                <Shield className="h-4.5 w-4.5 text-blue-600"/>
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">KYC Details</p>
                <p className="text-slate-400 text-xs">Identity verification information</p>
              </div>
            </div>

            {kycLoad ? (
              <div className="space-y-2">{[...Array(3)].map((_,i)=><Skeleton key={i} className="h-4 w-full"/>)}</div>
            ) : kycData ? (
              <div className="space-y-2 mb-4">
                {[
                  ["ID Type",  kycData.id_type?.replace(/_/g," ")],
                  ["Bank",     kycData.bank_id],
                  ["Submitted",kycData.created_at ? format(new Date(kycData.created_at*1000),"MMM d, yyyy") : "—"],
                ].map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-slate-700 font-medium">{val || "—"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-400 mb-4">No KYC data available</p>
            )}

            <Link href="/customer/kyc">
              <Button variant="outline" size="sm" className="w-full text-xs border-slate-200 text-slate-600">
                Full Details <ArrowRight className="h-3 w-3 ml-1"/>
              </Button>
            </Link>
          </CardContent>
        </Card>

        {/* Certificate card */}
        <Card className={`border shadow-sm ${
          certState === "active"   ? "border-emerald-200" :
          certState === "expired"  ? "border-red-200" :
          certState === "awaiting" ? "border-amber-200" : "border-slate-200"
        }`}>
          <CardContent className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${
                certState === "active"   ? "bg-emerald-50" :
                certState === "expired"  ? "bg-red-50" :
                certState === "awaiting" ? "bg-amber-50" : "bg-slate-50"
              }`}>
                <FileCheck className={`h-4.5 w-4.5 ${
                  certState === "active"   ? "text-emerald-600" :
                  certState === "expired"  ? "text-red-500" :
                  certState === "awaiting" ? "text-amber-600" : "text-slate-400"
                }`}/>
              </div>
              <div>
                <p className="font-semibold text-slate-800 text-sm">Certificate</p>
                <p className="text-slate-400 text-xs">KYC verification certificate</p>
              </div>
            </div>

            {certLoad ? (
              <div className="space-y-2">{[...Array(3)].map((_,i)=><Skeleton key={i} className="h-4 w-full"/>)}</div>
            ) : certState === "active" && latestCert ? (
              <div className="space-y-2 mb-4">
                {[
                  ["Issued",  safeDate(latestCert.issued_at) ? format(safeDate(latestCert.issued_at)!,"MMM d, yyyy") : "—"],
                  ["Expires", certExpiry ? format(certExpiry,"MMM d, yyyy") : "—"],
                  ["Days left", daysLeft !== null ? `${daysLeft} days` : "—"],
                ].map(([label, val]) => (
                  <div key={label} className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">{label}</span>
                    <span className={`font-medium ${label==="Days left" && daysLeft!<30 ? "text-amber-600" : "text-slate-700"}`}>{val}</span>
                  </div>
                ))}
              </div>
            ) : certState === "awaiting" ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 mb-4">
                <p className="text-xs text-amber-700 font-medium">Awaiting Certificate</p>
                <p className="text-xs text-amber-600 mt-0.5">Your KYC is verified. A certificate will be issued by your bank shortly.</p>
              </div>
            ) : certState === "expired" ? (
              <div className="rounded-lg bg-red-50 border border-red-200 p-3 mb-4">
                <p className="text-xs text-red-700 font-medium">Certificate Expired</p>
                <p className="text-xs text-red-600 mt-0.5">Contact your bank to renew your certificate.</p>
              </div>
            ) : (
              <p className="text-sm text-slate-400 mb-4">
                {kycData?.status === "VERIFIED" ? "No certificate issued yet" : "Available after KYC verification"}
              </p>
            )}

            <Link href="/customer/certificate">
              <Button
                variant="outline" size="sm"
                className={`w-full text-xs ${certState==="active" ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50" : "border-slate-200 text-slate-500"}`}
                disabled={certState==="none"}
              >
                {certState === "active"   ? "View Certificate" :
                 certState === "awaiting" ? "Check Status" :
                 certState === "expired"  ? "View Expired Cert" : "Not Available"}
                {certState !== "none" && <ArrowRight className="h-3 w-3 ml-1"/>}
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>

      {/* Next review reminder */}
      {kycData?.status === "VERIFIED" && kycData.next_review_date > 0 && (() => {
        const d = safeDate(kycData.next_review_date);
        if (!d) return null;
        const days = differenceInDays(d, new Date());
        if (days > 60) return null;
        return (
          <div className={`flex items-start gap-3 rounded-xl border p-4 ${days < 14 ? "bg-red-50 border-red-200":"bg-amber-50 border-amber-200"}`}>
            <AlertTriangle className={`h-4 w-4 shrink-0 mt-0.5 ${days < 14 ? "text-red-500":"text-amber-500"}`}/>
            <div>
              <p className={`text-sm font-medium ${days < 14 ? "text-red-700":"text-amber-700"}`}>
                Periodic Review Due {days <= 0 ? "Now" : `in ${days} days`}
              </p>
              <p className={`text-xs mt-0.5 ${days < 14 ? "text-red-600":"text-amber-600"}`}>
                Your KYC periodic review is due {format(d,"MMM d, yyyy")}. Contact your bank to complete it.
              </p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}