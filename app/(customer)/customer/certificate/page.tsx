"use client";

import { useEffect, useState } from "react";
import {
  FileCheck, Download, Share2, Shield, Calendar, Hash,
  CheckCircle2, Clock, AlertTriangle, RefreshCw, Copy, ExternalLink,
  ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { format, differenceInDays, formatDistanceToNow } from "date-fns";

function safeDate(unix: number | null | undefined): Date | null {
  if (!unix || unix <= 0) return null;
  try { const d = new Date(unix * 1000); return isNaN(d.getTime()) ? null : d; } catch { return null; }
}

interface Certificate {
  id:              string;
  certificate_id:  string;
  customer_id:     string;
  customer_name:   string;
  issued_at:       number;
  expires_at:      number;
  status:          string;
  requester_id:    string;
  issuer_id:       string;
  key_type:        string;
  signature:       string;
  kyc_summary?:    { first_name?: string; last_name?: string; risk_level?: string; id_type?: string; bank_id?: string };
  is_active:       boolean;
}

function CertCard({ cert, expanded, onToggle }: {
  cert: Certificate; expanded: boolean; onToggle: () => void;
}) {
  const issued   = safeDate(cert.issued_at ?? cert.id ? undefined : undefined) ?? safeDate(cert.issued_at);
  const expires  = safeDate(cert.expires_at);
  const daysLeft = expires ? differenceInDays(expires, new Date()) : null;
  const expired  = daysLeft !== null && daysLeft < 0;
  const expiring = !expired && daysLeft !== null && daysLeft <= 30;

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); } catch {}
  };

  return (
    <div className={`rounded-2xl border-2 overflow-hidden shadow-sm ${
      expired  ? "border-red-200 bg-red-50/30" :
      expiring ? "border-amber-200 bg-amber-50/30" :
      cert.is_active ? "border-emerald-200 bg-emerald-50/20" : "border-slate-200 bg-slate-50/30"
    }`}>
      {/* Certificate header — styled like a real document */}
      <div className={`px-6 py-5 relative overflow-hidden ${
        expired ? "bg-red-50" : expiring ? "bg-amber-50" : "bg-gradient-to-br from-blue-600 to-blue-700"
      }`}>
        {/* Decorative circles */}
        {!expired && !expiring && (
          <>
            <div className="absolute top-0 right-0 h-32 w-32 rounded-full bg-white/5 -translate-y-8 translate-x-8"/>
            <div className="absolute bottom-0 left-0 h-20 w-20 rounded-full bg-white/5 translate-y-10 -translate-x-10"/>
          </>
        )}

        <div className="relative flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${expired||expiring?"bg-white/80":"bg-white/20"}`}>
              <Shield className={`h-5 w-5 ${expired?"text-red-500":expiring?"text-amber-600":"text-white"}`}/>
            </div>
            <div>
              <p className={`text-xs font-semibold uppercase tracking-wider ${expired||expiring?"text-slate-500":"text-blue-100"}`}>
                KYC Blockchain System
              </p>
              <p className={`font-bold ${expired||expiring?"text-slate-700":"text-white"} text-base`}>
                Verification Certificate
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5">
            {expired ? (
              <Badge className="bg-red-100 text-red-700 border-red-200 text-xs">Expired</Badge>
            ) : expiring ? (
              <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Expiring Soon</Badge>
            ) : (
              <Badge className="bg-white/20 text-white border-white/30 text-xs">Active</Badge>
            )}
            {!cert.is_active && (
              <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs">Superseded</Badge>
            )}
          </div>
        </div>
      </div>

      {/* Certificate body */}
      <div className="px-6 py-5 bg-white">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3 mb-5">
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Issued To</p>
            <p className="text-slate-800 font-semibold">
              {cert.customer_name || `${cert.kyc_summary?.first_name??""} ${cert.kyc_summary?.last_name??""}`.trim() || cert.customer_id}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Requester</p>
            <p className="text-slate-700 text-sm font-mono">{cert.requester_id}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Issued On</p>
            <p className="text-slate-700 text-sm">{issued ? format(issued,"MMMM d, yyyy") : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-slate-400 mb-0.5">Valid Until</p>
            <p className={`text-sm font-medium ${expired?"text-red-600":expiring?"text-amber-600":"text-slate-700"}`}>
              {expires ? format(expires,"MMMM d, yyyy") : "—"}
              {daysLeft !== null && !expired && (
                <span className="text-xs font-normal text-slate-400 ml-1.5">({daysLeft}d remaining)</span>
              )}
              {expired && expires && (
                <span className="text-xs font-normal ml-1.5">
                  ({Math.abs(daysLeft!)}d ago)
                </span>
              )}
            </p>
          </div>
        </div>

        {/* Certificate ID */}
        <div className="bg-slate-50 rounded-xl p-3 mb-5 flex items-start gap-2">
          <Hash className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0"/>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-slate-400 mb-0.5">Certificate ID</p>
            <p className="font-mono text-xs text-slate-700 break-all">{cert.certificate_id ?? cert.id}</p>
          </div>
          <button onClick={()=>copyToClipboard(cert.certificate_id??cert.id)}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded transition-colors shrink-0">
            <Copy className="h-3.5 w-3.5"/>
          </button>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-sm"
            onClick={()=>window.print()}
          >
            <Download className="h-4 w-4 mr-1.5"/>Download
          </Button>
          <Button variant="outline" size="sm"
            className="border-slate-200 text-slate-600 hover:bg-slate-50"
            onClick={()=>copyToClipboard(cert.certificate_id??cert.id)}
          >
            <Copy className="h-4 w-4"/>
          </Button>
        </div>

        {/* Expandable signature */}
        <button onClick={onToggle}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 mt-4 w-full transition-colors">
          <Shield className="h-3 w-3"/>
          Cryptographic signature
          {expanded ? <ChevronUp className="h-3 w-3 ml-auto"/> : <ChevronDown className="h-3 w-3 ml-auto"/>}
        </button>
        {expanded && (
          <div className="mt-2 bg-slate-50 rounded-lg p-3 text-xs font-mono text-slate-500 break-all">
            {cert.signature}
          </div>
        )}
      </div>
    </div>
  );
}

export default function CustomerCertificatePage() {
  const [certs,     setCerts]     = useState<Certificate[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [expandedId, setExpanded] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<string | null>(null);

  const fetchAll = async () => {
    setLoading(true);

    // KYC status — for waiting state display
    // /kyc/me requires Go route from bank-customer-go-additions.go
    api.get("/api/v1/kyc/me")
      .then(r => {
        const payload = r.data?.data;
        const kyc = payload?.kyc_data ?? (payload?.customer_id ? payload : null);
        setKycStatus(kyc?.status ?? null);
      })
      .catch(() => {});

    // Certificates — guard: normalize to array regardless of response shape
    // TypeError "certs.filter is not a function" caused by r.data.data being
    // a plain object (e.g. { count: 0 }) when the response has no certificates key.
    api.get("/api/v1/certificates/me")
      .then(r => {
        const payload = r.data?.data;
        const arr = Array.isArray(payload?.certificates) ? payload.certificates
          : Array.isArray(payload) ? payload
          : [];
        setCerts(arr);
      })
      .catch(() => setCerts([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAll(); }, []);

  // Guard: ensure certs is always an array before filtering
  // (setCerts normalizes to [] on any error, but be defensive)
  const certList    = Array.isArray(certs) ? certs : [];
  const activeCerts = certList.filter(c => c.is_active !== false);
  const oldCerts    = certList.filter(c => c.is_active === false);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-800">My Certificate</h1>
          <p className="text-slate-400 text-sm">Cryptographically signed KYC verification</p>
        </div>
        <Button onClick={fetchAll} variant="outline" size="sm" className="border-slate-200 text-slate-500 text-xs h-8">
          <RefreshCw className="h-3.5 w-3.5"/>
        </Button>
      </div>

      {loading ? (
        <div className="space-y-4">{[...Array(2)].map((_,i)=><Skeleton key={i} className="h-64 w-full rounded-2xl"/>)}</div>
      ) : activeCerts.length === 0 ? (
        // ── No certificate state ──────────────────────────────────────────────
        <div className="text-center py-16 space-y-4">
          <div className="h-20 w-20 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto">
            <FileCheck className="h-10 w-10 text-slate-300"/>
          </div>
          {kycStatus === "VERIFIED" ? (
            <>
              <div>
                <h2 className="text-lg font-bold text-slate-700">Certificate Not Yet Issued</h2>
                <p className="text-slate-400 text-sm mt-1 max-w-sm mx-auto">
                  Your KYC is verified. Your bank is processing your certificate — it will appear here once issued.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-amber-700 text-sm">
                <Clock className="h-4 w-4"/>
                Awaiting issuance from your bank
              </div>
            </>
          ) : kycStatus === "PENDING" ? (
            <>
              <h2 className="text-lg font-bold text-slate-700">KYC Under Review</h2>
              <p className="text-slate-400 text-sm">A certificate will be issued after your KYC is verified.</p>
              <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 text-blue-700 text-sm">
                <Clock className="h-4 w-4"/>
                KYC verification pending
              </div>
            </>
          ) : (
            <>
              <h2 className="text-lg font-bold text-slate-700">No Certificate Available</h2>
              <p className="text-slate-400 text-sm">Complete KYC verification to receive your certificate.</p>
            </>
          )}
        </div>
      ) : (
        // ── Active certificate(s) ─────────────────────────────────────────────
        <div className="space-y-4">
          {activeCerts.map(cert => (
            <CertCard
              key={cert.certificate_id ?? cert.id}
              cert={cert}
              expanded={expandedId === (cert.certificate_id ?? cert.id)}
              onToggle={()=>setExpanded(p => p===(cert.certificate_id??cert.id) ? null : (cert.certificate_id??cert.id))}
            />
          ))}

          {/* Info footer */}
          <Card className="border border-slate-100 bg-slate-50">
            <CardContent className="p-4 text-center">
              <p className="text-slate-500 text-sm">
                This certificate is cryptographically secured on the blockchain.
                <br className="hidden sm:block"/>
                Anyone can verify its authenticity using the certificate ID above.
              </p>
            </CardContent>
          </Card>

          {/* Historical certs */}
          {oldCerts.length > 0 && (
            <div>
              <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wide">Previous Certificates</p>
              <div className="space-y-3">
                {oldCerts.map(cert => (
                  <CertCard
                    key={cert.certificate_id??cert.id}
                    cert={cert}
                    expanded={expandedId===(cert.certificate_id??cert.id)}
                    onToggle={()=>setExpanded(p=>p===(cert.certificate_id??cert.id)?null:(cert.certificate_id??cert.id))}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}