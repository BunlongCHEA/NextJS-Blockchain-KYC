"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Search, Filter, Eye, CheckCircle, XCircle, RefreshCw,
  X, User, Mail, Phone, MapPin, Shield, Calendar, Hash,
  Lock, Unlock, Loader2, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import KYCStatusBadge from "@/components/kyc/KYCStatusBadge";
import { KYCData, KYCStatus } from "@/types/kyc";
import api from "@/lib/api";
import { format } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

// ─── Encrypted field helpers ──────────────────────────────────────────────────

/** Bullet mask — used in the drawer while fields are hidden */
const mask = (val?: string) =>
  "●".repeat(Math.min((val ?? "").length || 8, 10));

// ─── Detail Drawer ────────────────────────────────────────────────────────────
//
// HOW DECRYPTION WORKS
// ────────────────────
// ListKYC  → GET /api/v1/kyc/list  → returns records WITHOUT decryption
//            (ReadKYC is never called, so email/phone/id_number = "[ENCRYPTED]")
//
// GetKYC   → GET /api/v1/kyc?customer_id=X  → calls ReadKYC(id, decrypt=true)
//            which runs DecryptSensitiveData → returns plain-text values
//
// Strategy: keep the list fast (no per-row decrypt). On "Reveal", fetch the
// single decrypted record via GET /api/v1/kyc?customer_id=X, store it in
// `decryptedRecord`, and render sensitive fields from there.
// Clicking "Hide" discards `decryptedRecord` and goes back to masked display.

interface KYCDetailDrawerProps {
  record: KYCData | null;
  onClose: () => void;
  onVerify: (id: string) => void;
  onReject: (id: string) => void;
  actionLoading: string | null;
}

function KYCDetailDrawer({
  record,
  onClose,
  onVerify,
  onReject,
  actionLoading,
}: KYCDetailDrawerProps) {
  // decryptedRecord holds the result of GET /api/v1/kyc?customer_id=X
  const [decryptedRecord, setDecryptedRecord] = useState<KYCData | null>(null);
  const [decrypting,      setDecrypting]      = useState(false);
  const [decryptError,    setDecryptError]    = useState<string | null>(null);
  // revealed = user explicitly asked to show sensitive fields
  const [revealed,        setRevealed]        = useState(false);

  // Reset everything when a different record is opened
  useEffect(() => {
    setDecryptedRecord(null);
    setDecrypting(false);
    setDecryptError(null);
    setRevealed(false);
  }, [record?.customer_id]);

  if (!record) return null;

  // ── Fetch decrypted record from GET /api/v1/kyc?customer_id=X ─────────────
  const fetchDecrypted = async () => {
    if (decryptedRecord) {
      // Already fetched — just toggle visibility
      setRevealed(true);
      return;
    }
    setDecrypting(true);
    setDecryptError(null);
    try {
      // This endpoint calls ReadKYC(id, decrypt=true) server-side
      const res = await api.get("/api/v1/kyc", {
        params: { customer_id: record.customer_id },
      });
      // Response shape: { data: { kyc_data: {...}, on_blockchain: bool, ... } }
      const kycData: KYCData =
        res.data?.data?.kyc_data ?? res.data?.data ?? res.data;
      setDecryptedRecord(kycData);
      setRevealed(true);

      // console.log("Decrypted KYC data:", kycData);
    } catch (err: any) {
      setDecryptError(
        err?.response?.data?.error ?? "Failed to decrypt — check your permissions"
      );
    } finally {
      setDecrypting(false);
    }
  };

  const hideFields = () => setRevealed(false);

  // Derive what to show: use decrypted values when revealed, else mask/placeholder
  const sensitiveValues = {
    email:     revealed && decryptedRecord ? decryptedRecord.email     : undefined,
    phone:     revealed && decryptedRecord ? decryptedRecord.phone     : undefined,
    id_number: revealed && decryptedRecord ? decryptedRecord.id_number : undefined,
  };

  const fmtDate = (unix?: number) =>
    unix ? format(new Date(unix * 1000), "MMM d, yyyy HH:mm") : "—";

  // Standard row
  const row = (icon: React.ReactNode, label: string, value: React.ReactNode) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-800/70 last:border-0">
      <div className="mt-0.5 text-gray-600 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <div className="text-sm text-white break-all">{value ?? "—"}</div>
      </div>
    </div>
  );

  // Sensitive row — shows masked/plain depending on `revealed` + `decryptedRecord`
  const sensitiveRow = (
    icon: React.ReactNode,
    label: string,
    field: "email" | "phone" | "id_number",
  ) => {
    const plainValue = sensitiveValues[field];
    return (
      <div className="flex items-start gap-3 py-2.5 border-b border-gray-800/70 last:border-0">
        <div className="mt-0.5 text-gray-600 shrink-0">{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-gray-500 mb-0.5">{label}</p>
          {revealed && plainValue ? (
            // Plain text from decrypted API response
            <span className="text-white text-sm break-all">{plainValue}</span>
          ) : (
            // Masked — waiting for user to reveal
            <span className="font-mono text-gray-500 tracking-widest text-sm select-none">
              {mask(plainValue ?? record[field as keyof KYCData] as string)}
            </span>
          )}
        </div>
      </div>
    );
  };

  const isLoading = actionLoading === record.customer_id;

  return (
    <>
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-gray-950 border-l border-gray-800 z-50 flex flex-col shadow-2xl">
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 bg-gray-900/80 sticky top-0">
          <div>
            <h2 className="text-white font-semibold text-base">
              {record.first_name} {record.last_name}
            </h2>
            <p className="text-gray-500 text-xs font-mono mt-0.5">{record.customer_id}</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Single Reveal / Hide button — triggers GET /api/v1/kyc?customer_id on first use */}
            <button
              onClick={revealed ? hideFields : fetchDecrypted}
              disabled={decrypting}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                revealed
                  ? "border-amber-700/50 bg-amber-900/20 text-amber-400 hover:bg-amber-900/30"
                  : "border-gray-700 bg-gray-800 text-gray-400 hover:text-white hover:border-gray-600"
              }`}
            >
              {decrypting ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Decrypting…
                </>
              ) : revealed ? (
                <>
                  <Lock className="h-3 w-3" />
                  Hide Fields
                </>
              ) : (
                <>
                  <Unlock className="h-3 w-3" />
                  Reveal Fields
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Status + Risk + Actions ── */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-gray-800 bg-gray-900/40">
          <KYCStatusBadge status={record.status} />
          <span
            className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${
              record.risk_level === "high"
                ? "bg-red-900/60 text-red-300 border border-red-800"
                : record.risk_level === "medium"
                ? "bg-amber-900/60 text-amber-300 border border-amber-800"
                : "bg-green-900/60 text-green-300 border border-green-800"
            }`}
          >
            {record.risk_level || "low"} risk
          </span>

          {record.status === "PENDING" && (
            <div className="ml-auto flex gap-2">
              <Button
                size="sm"
                className="h-7 px-3 bg-green-700 hover:bg-green-600 text-white text-xs"
                disabled={isLoading}
                onClick={() => onVerify(record.customer_id)}
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <><CheckCircle className="h-3.5 w-3.5 mr-1" />Verify</>
                )}
              </Button>
              <Button
                size="sm"
                className="h-7 px-3 bg-red-800 hover:bg-red-700 text-white text-xs"
                disabled={isLoading}
                onClick={() => onReject(record.customer_id)}
              >
                <XCircle className="h-3.5 w-3.5 mr-1" />Reject
              </Button>
            </div>
          )}
        </div>

        {/* ── Sensitive data notice / decrypt error ── */}
        {decryptError ? (
          <div className="mx-5 mt-3 flex items-center gap-2 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            <p className="text-xs text-red-400">{decryptError}</p>
          </div>
        ) : (
          <div className="mx-5 mt-3 flex items-center gap-2 bg-amber-950/30 border border-amber-900/40 rounded-lg px-3 py-2">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-500/80">
              {revealed
                ? "Sensitive fields decrypted — hide when done"
                : "Email, phone and ID number are masked. Click \"Reveal Fields\" to decrypt via server."}
            </p>
          </div>
        )}

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">

          {/* Personal */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5" /> Personal Information
            </p>
            <div className="bg-gray-900/50 rounded-xl border border-gray-800/60 px-4 py-1">
              {row(<User className="h-4 w-4" />, "Full Name", `${record.first_name} ${record.last_name}`)}
              {row(<Calendar className="h-4 w-4" />, "Date of Birth", record.date_of_birth)}
              {row(<Shield className="h-4 w-4" />, "Nationality", record.nationality)}
            </div>
          </section>

          {/* Contact — sensitive */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" /> Contact
              <span className="text-amber-600/60 text-xs font-normal ml-1 flex items-center gap-0.5">
                <Lock className="h-2.5 w-2.5" /> Protected
              </span>
            </p>
            <div className="bg-gray-900/50 rounded-xl border border-gray-800/60 px-4 py-1">
              {sensitiveRow(<Mail className="h-4 w-4" />, "Email", "email")}
              {sensitiveRow(<Phone className="h-4 w-4" />, "Phone", "phone")}
            </div>
          </section>

          {/* Identity Document — sensitive */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5" /> Identity Document
              <span className="text-amber-600/60 text-xs font-normal ml-1 flex items-center gap-0.5">
                <Lock className="h-2.5 w-2.5" /> Protected
              </span>
            </p>
            <div className="bg-gray-900/50 rounded-xl border border-gray-800/60 px-4 py-1">
              {row(<Hash className="h-4 w-4" />, "ID Type", record.id_type)}
              {sensitiveRow(<Hash className="h-4 w-4" />, "ID Number", "id_number")}
              {row(<Calendar className="h-4 w-4" />, "ID Expiry", record.id_expiry_date)}
            </div>
          </section>

          {/* Address */}
          {record.address && (
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Address
              </p>
              <div className="bg-gray-900/50 rounded-xl border border-gray-800/60 px-4 py-1">
                {row(
                  <MapPin className="h-4 w-4" />,
                  "Full Address",
                  [record.address.street, record.address.city, record.address.state,
                   record.address.postal_code, record.address.country].filter(Boolean).join(", "),
                )}
              </div>
            </section>
          )}

          {/* Verification */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Shield className="h-3.5 w-3.5" /> Verification
            </p>
            <div className="bg-gray-900/50 rounded-xl border border-gray-800/60 px-4 py-1">
              {row(<Shield className="h-4 w-4" />, "Bank ID", record.bank_id)}
              {row(<Shield className="h-4 w-4" />, "Verified By", record.verified_by)}
              {row(<Calendar className="h-4 w-4" />, "Verification Date", fmtDate(record.verification_date))}
              {row(<Calendar className="h-4 w-4" />, "Created At", fmtDate(record.created_at))}
              {row(<Calendar className="h-4 w-4" />, "Updated At", fmtDate(record.updated_at))}
              {record.scan_score !== undefined &&
                row(<Shield className="h-4 w-4" />, "Scan Score",
                  <span className={`font-semibold ${
                    record.scan_score >= 0.7 ? "text-green-400"
                    : record.scan_score >= 0.4 ? "text-amber-400"
                    : "text-red-400"
                  }`}>
                    {(record.scan_score * 100).toFixed(1)}%
                  </span>
                )}
              {record.document_hash &&
                row(<Hash className="h-4 w-4" />, "Document Hash",
                  <span className="font-mono text-xs text-cyan-400">{record.document_hash}</span>
                )}
            </div>
          </section>

          {/* Periodic Review */}
          {(record.review_count > 0 || record.last_review_date) && (
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <RefreshCw className="h-3.5 w-3.5" /> Periodic Review
              </p>
              <div className="bg-gray-900/50 rounded-xl border border-gray-800/60 px-4 py-1">
                {row(<RefreshCw className="h-4 w-4" />, "Review Count", record.review_count)}
                {row(<Calendar className="h-4 w-4" />, "Last Review", fmtDate(record.last_review_date))}
                {row(<Calendar className="h-4 w-4" />, "Next Review", fmtDate(record.next_review_date))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KYCPage() {
  const { toast } = useToast();
  const [records, setRecords]           = useState<KYCData[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selected, setSelected]         = useState<KYCData | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchKYC = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (statusFilter !== "ALL") params.status = statusFilter;
      const res = await api.get("/api/v1/kyc/list", { params });
      const data = res.data?.data || res.data || [];
      setRecords(Array.isArray(data) ? data : []);
    } catch {
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { fetchKYC(); }, [fetchKYC]);

  const filtered = records.filter(
    (r) =>
      r.first_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.last_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.email?.toLowerCase().includes(search.toLowerCase()) ||
      r.id_number?.toLowerCase().includes(search.toLowerCase())
  );

  const handleVerify = async (customerId: string) => {
    setActionLoading(customerId);
    try {
      await api.post("/api/v1/kyc/verify", { customer_id: customerId });
      toast({ title: "KYC verified — transaction added to pending pool" });
      fetchKYC();
      // Update drawer record status inline
      setSelected((prev) =>
        prev?.customer_id === customerId ? { ...prev, status: "VERIFIED" as KYCStatus } : prev
      );
    } catch (err: any) {
      toast({
        title: err?.response?.data?.error || "Failed to verify KYC",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (customerId: string) => {
    setActionLoading(customerId);
    try {
      await api.post("/api/v1/kyc/reject", { customer_id: customerId, reason: "Rejected by admin" });
      toast({ title: "KYC rejected" });
      fetchKYC();
      setSelected((prev) =>
        prev?.customer_id === customerId ? { ...prev, status: "REJECTED" as KYCStatus } : prev
      );
    } catch (err: any) {
      toast({
        title: err?.response?.data?.error || "Failed to reject KYC",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const counts = {
    total:    records.length,
    pending:  records.filter((r) => r.status === "PENDING").length,
    verified: records.filter((r) => r.status === "VERIFIED").length,
    rejected: records.filter((r) => r.status === "REJECTED").length,
  };

  return (
    <>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">KYC Management</h1>
            <p className="text-gray-400 text-sm mt-1">
              Review and manage customer KYC applications
            </p>
          </div>
          <Button
            onClick={fetchKYC}
            variant="outline"
            size="sm"
            className="border-gray-700 text-gray-300"
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* ── Stat pills ── */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total",    value: counts.total,    color: "text-gray-300",  bg: "bg-gray-800/60 border-gray-700" },
            { label: "Pending",  value: counts.pending,  color: "text-amber-400", bg: "bg-amber-900/20 border-amber-800/50" },
            { label: "Verified", value: counts.verified, color: "text-green-400", bg: "bg-green-900/20 border-green-800/50" },
            { label: "Rejected", value: counts.rejected, color: "text-red-400",   bg: "bg-red-900/20 border-red-800/50" },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.bg}`}>
              <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Table card ── */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                <Input
                  placeholder="Search by name, email or ID..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-[180px] bg-gray-800 border-gray-700 text-white">
                  <Filter className="h-4 w-4 mr-2 text-gray-500" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="VERIFIED">Verified</SelectItem>
                  <SelectItem value="REJECTED">Rejected</SelectItem>
                  <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  <SelectItem value="EXPIRED">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-gray-800 overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-500 font-medium text-xs uppercase">Name</TableHead>
                    <TableHead className="text-gray-500 font-medium text-xs uppercase">
                      <span className="flex items-center gap-1">
                        Email <Lock className="h-3 w-3 text-amber-600/50" />
                      </span>
                    </TableHead>
                    <TableHead className="text-gray-500 font-medium text-xs uppercase">
                      <span className="flex items-center gap-1">
                        ID Number <Lock className="h-3 w-3 text-amber-600/50" />
                      </span>
                    </TableHead>
                    <TableHead className="text-gray-500 font-medium text-xs uppercase">Status</TableHead>
                    <TableHead className="text-gray-500 font-medium text-xs uppercase">Risk</TableHead>
                    <TableHead className="text-gray-500 font-medium text-xs uppercase">Created</TableHead>
                    <TableHead className="text-right text-gray-500 font-medium text-xs uppercase">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i} className="border-gray-800">
                        {[...Array(7)].map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-gray-500 py-12">
                        <div className="flex flex-col items-center gap-2">
                          <Search className="h-8 w-8 text-gray-700" />
                          <p>No KYC records found</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((record) => (
                      <TableRow
                        key={record.customer_id}
                        className="border-gray-800 hover:bg-gray-800/30 transition-colors"
                      >
                        <TableCell className="text-white font-medium">
                          {record.first_name} {record.last_name}
                        </TableCell>
                        {/* Email — always masked in table; reveal via drawer */}
                        <TableCell>
                          <span className="font-mono text-xs text-gray-600 tracking-widest select-none">
                            ●●●●●●●●
                          </span>
                        </TableCell>
                        {/* ID Number — always masked in table; reveal via drawer */}
                        <TableCell>
                          <span className="font-mono text-xs text-gray-600 tracking-widest select-none">
                            ●●●●●●●●
                          </span>
                        </TableCell>
                        <TableCell>
                          <KYCStatusBadge status={record.status} />
                        </TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded-full capitalize font-medium ${
                            record.risk_level === "high"
                              ? "bg-red-900/50 text-red-300"
                              : record.risk_level === "medium"
                              ? "bg-amber-900/50 text-amber-300"
                              : "bg-green-900/50 text-green-300"
                          }`}>
                            {record.risk_level || "low"}
                          </span>
                        </TableCell>
                        <TableCell className="text-gray-400 text-sm">
                          {record.created_at
                            ? format(new Date(record.created_at * 1000), "MMM d, yyyy")
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {record.status === "PENDING" && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-green-400 hover:text-green-300 hover:bg-green-900/20 h-7 px-2 text-xs"
                                  onClick={() => handleVerify(record.customer_id)}
                                  disabled={actionLoading === record.customer_id}
                                >
                                  {actionLoading === record.customer_id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <><CheckCircle className="h-3.5 w-3.5 mr-1" />Verify</>
                                  )}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-7 px-2 text-xs"
                                  onClick={() => handleReject(record.customer_id)}
                                  disabled={actionLoading === record.customer_id}
                                >
                                  <XCircle className="h-3.5 w-3.5 mr-1" />Reject
                                </Button>
                              </>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-cyan-400 hover:text-cyan-300 hover:bg-cyan-900/20 h-7 px-2 text-xs"
                              onClick={() => setSelected(record)}
                            >
                              <Eye className="h-3.5 w-3.5 mr-1" />View
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {!loading && filtered.length > 0 && (
              <p className="text-xs text-gray-600 mt-2 px-1">
                Showing {filtered.length} of {records.length} records
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <KYCDetailDrawer
        record={selected}
        onClose={() => setSelected(null)}
        onVerify={handleVerify}
        onReject={handleReject}
        actionLoading={actionLoading}
      />
    </>
  );
}