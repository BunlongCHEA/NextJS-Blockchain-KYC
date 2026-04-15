"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ShieldCheck,
  RefreshCw,
  Download,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Copy,
  Eye,
  ChevronDown,
  X,
  Loader2,
  FileKey2,
  CalendarClock,
  BadgeCheck,
  Hash,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { format, formatDistanceToNow, isPast, differenceInDays } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Certificate {
  id: string;
  certificate_id?: string;
  customer_id: string;
  customer_name: string;
  issued_at: number;
  expires_at: number;
  hash: string;
  status: string;
  requester_id?: string;
  key_type?: string;
  issuer?: string;
}

interface IssueCertificateForm {
  customer_id: string;
  requester_id: string;
  requester_public_key: string;
  validity_days: number;
}

interface VerifyCertificateForm {
  certificateJson: string;
}

interface CertStats {
  total: number;
  active: number;
  expiringSoon: number;
  expired: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getCertStatus(cert: Certificate): "active" | "expiring" | "expired" | "grace" {
  const now = Date.now();
  const expiresMs = cert.expires_at * 1000;
  const daysLeft = differenceInDays(expiresMs, now);

  if (daysLeft < 0) {
    if (daysLeft >= -7) return "grace"; // 7-day grace period
    return "expired";
  }
  if (daysLeft <= 30) return "expiring";
  return "active";
}

const statusConfig = {
  active: {
    label: "Active",
    color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    icon: CheckCircle2,
    dot: "bg-emerald-400",
  },
  expiring: {
    label: "Expiring Soon",
    color: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    icon: AlertTriangle,
    dot: "bg-amber-400",
  },
  grace: {
    label: "Grace Period",
    color: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    icon: Clock,
    dot: "bg-orange-400",
  },
  expired: {
    label: "Expired",
    color: "bg-red-500/10 text-red-400 border-red-500/20",
    icon: XCircle,
    dot: "bg-red-400",
  },
};

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  accent: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
      <div className={`p-2.5 rounded-lg ${accent}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CertificatesPage() {
  const { toast } = useToast();
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [filteredCerts, setFilteredCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Dialogs
  const [showIssueDialog, setShowIssueDialog] = useState(false);
  const [showVerifyDialog, setShowVerifyDialog] = useState(false);
  const [showDetailDialog, setShowDetailDialog] = useState(false);
  const [selectedCert, setSelectedCert] = useState<Certificate | null>(null);

  // Forms
  const [issueForm, setIssueForm] = useState<IssueCertificateForm>({
    customer_id: "",
    requester_id: "",
    requester_public_key: "",
    validity_days: 365,
  });
  const [verifyForm, setVerifyForm] = useState<VerifyCertificateForm>({
    certificateJson: "",
  });

  // Loading states
  const [issuing, setIssuing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    valid: boolean;
    message: string;
    data?: Record<string, unknown>;
  } | null>(null);

  // ── Stats ──
  const stats: CertStats = {
    total: certs.length,
    active: certs.filter((c) => getCertStatus(c) === "active").length,
    expiringSoon: certs.filter((c) => getCertStatus(c) === "expiring").length,
    expired: certs.filter(
      (c) => getCertStatus(c) === "expired" || getCertStatus(c) === "grace"
    ).length,
  };

  // ── Fetch ──
  const fetchCerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/certificates/list");
      const data = res.data?.data || res.data || [];
      setCerts(Array.isArray(data) ? data : []);
    } catch {
      setCerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCerts();
  }, [fetchCerts]);

  // ── Filter ──
  useEffect(() => {
    let filtered = [...certs];

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.customer_name?.toLowerCase().includes(q) ||
          c.customer_id?.toLowerCase().includes(q) ||
          c.hash?.toLowerCase().includes(q) ||
          c.requester_id?.toLowerCase().includes(q)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((c) => getCertStatus(c) === statusFilter);
    }

    setFilteredCerts(filtered);
  }, [certs, searchQuery, statusFilter]);

  // ── Issue Certificate ──
  const handleIssueCertificate = async () => {
    if (!issueForm.customer_id || !issueForm.requester_id) {
      toast({ title: "Customer ID and Requester ID are required", variant: "destructive" });
      return;
    }

    setIssuing(true);
    try {
      const res = await api.post("/api/v1/certificate/issue", {
        customer_id: issueForm.customer_id,
        requester_id: issueForm.requester_id,
        requester_public_key: issueForm.requester_public_key || undefined,
        validity_days: issueForm.validity_days,
      });

      toast({ title: "Certificate issued successfully" });
      setShowIssueDialog(false);
      setIssueForm({
        customer_id: "",
        requester_id: "",
        requester_public_key: "",
        validity_days: 365,
      });

      // Show issued certificate detail
      if (res.data?.data?.certificate) {
        const cert = res.data.data.certificate;
        setSelectedCert({
          id: cert.certificate_id,
          certificate_id: cert.certificate_id,
          customer_id: cert.customer_id,
          customer_name: cert.customer_id,
          issued_at: cert.issued_at,
          expires_at: cert.expires_at,
          hash: cert.hash || cert.certificate_id,
          status: cert.status || "active",
          requester_id: cert.requester_id,
          key_type: cert.key_type,
          issuer: cert.issuer,
        });
        setShowDetailDialog(true);
      }

      await fetchCerts();
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      toast({
        title: error?.response?.data?.error || "Failed to issue certificate",
        variant: "destructive",
      });
    } finally {
      setIssuing(false);
    }
  };

  // ── Verify Certificate ──
  const handleVerifyCertificate = async () => {
    if (!verifyForm.certificateJson.trim()) {
      toast({ title: "Please paste the certificate JSON", variant: "destructive" });
      return;
    }

    let parsedCert: unknown;
    try {
      parsedCert = JSON.parse(verifyForm.certificateJson);
    } catch {
      toast({ title: "Invalid JSON format", variant: "destructive" });
      return;
    }

    setVerifying(true);
    setVerifyResult(null);

    try {
      const res = await api.post("/api/v1/certificate/verify", {
        certificate: parsedCert,
      });

      const data = res.data?.data;
      setVerifyResult({
        valid: data?.valid === true,
        message: res.data?.message || "Verification complete",
        data,
      });
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } } };
      setVerifyResult({
        valid: false,
        message: error?.response?.data?.error || "Verification failed",
      });
    } finally {
      setVerifying(false);
    }
  };

  // ── Copy hash ──
  const copyToClipboard = (text: string, label = "Copied!") => {
    navigator.clipboard.writeText(text);
    toast({ title: label });
  };

  // ── Download certificate JSON ──
  const downloadCert = (cert: Certificate) => {
    const blob = new Blob([JSON.stringify(cert, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cert-${cert.customer_id}-${cert.id?.slice(0, 8) || "kyc"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                <ShieldCheck className="h-5 w-5 text-cyan-400" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Certificates
              </h1>
            </div>
            <p className="text-gray-500 text-sm mt-1.5 ml-0.5">
              KYC verification certificates — issue, verify, and manage
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowVerifyDialog(true)}
              variant="outline"
              size="sm"
              className="border-gray-700 text-gray-300 hover:text-white hover:border-gray-600"
            >
              <BadgeCheck className="h-4 w-4 mr-1.5" />
              Verify
            </Button>
            <Button
              onClick={() => setShowIssueDialog(true)}
              size="sm"
              className="bg-cyan-600 hover:bg-cyan-500 text-white"
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Issue Certificate
            </Button>
            <Button
              onClick={fetchCerts}
              variant="ghost"
              size="icon"
              className="text-gray-400 hover:text-white"
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            label="Total Certificates"
            value={stats.total}
            icon={FileKey2}
            accent="bg-cyan-500/10 text-cyan-400"
          />
          <StatCard
            label="Active"
            value={stats.active}
            icon={CheckCircle2}
            accent="bg-emerald-500/10 text-emerald-400"
          />
          <StatCard
            label="Expiring Soon"
            value={stats.expiringSoon}
            icon={CalendarClock}
            accent="bg-amber-500/10 text-amber-400"
          />
          <StatCard
            label="Expired / Grace"
            value={stats.expired}
            icon={XCircle}
            accent="bg-red-500/10 text-red-400"
          />
        </div>

        {/* ── Table Card ── */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3 pt-4 px-4 border-b border-gray-800">
            <div className="flex items-center justify-between gap-3">
              {/* Search */}
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                <Input
                  placeholder="Search by customer, hash…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-sm bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 focus-visible:ring-cyan-500/50"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Status Filter */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 border-gray-700 text-gray-300 text-xs gap-1"
                  >
                    {statusFilter === "all"
                      ? "All Status"
                      : statusConfig[statusFilter as keyof typeof statusConfig]
                          ?.label}
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="bg-gray-900 border-gray-800">
                  {["all", "active", "expiring", "grace", "expired"].map(
                    (s) => (
                      <DropdownMenuItem
                        key={s}
                        onClick={() => setStatusFilter(s)}
                        className="text-gray-300 hover:text-white focus:text-white focus:bg-gray-800 text-sm capitalize"
                      >
                        {s === "all"
                          ? "All Status"
                          : statusConfig[s as keyof typeof statusConfig]?.label}
                      </DropdownMenuItem>
                    )
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-500 font-medium text-xs uppercase tracking-wider pl-4">
                      Customer
                    </TableHead>
                    <TableHead className="text-gray-500 font-medium text-xs uppercase tracking-wider">
                      Certificate Hash
                    </TableHead>
                    <TableHead className="text-gray-500 font-medium text-xs uppercase tracking-wider">
                      Issued
                    </TableHead>
                    <TableHead className="text-gray-500 font-medium text-xs uppercase tracking-wider">
                      Expires
                    </TableHead>
                    <TableHead className="text-gray-500 font-medium text-xs uppercase tracking-wider">
                      Status
                    </TableHead>
                    <TableHead className="text-right text-gray-500 font-medium text-xs uppercase tracking-wider pr-4">
                      Actions
                    </TableHead>
                  </TableRow>
                </TableHeader>

                <TableBody>
                  {loading ? (
                    [...Array(5)].map((_, i) => (
                      <TableRow key={i} className="border-gray-800/60">
                        {[...Array(6)].map((_, j) => (
                          <TableCell key={j} className="py-3">
                            <Skeleton className="h-4 w-full bg-gray-800 rounded" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredCerts.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={6}
                        className="text-center py-16"
                      >
                        <div className="flex flex-col items-center gap-3">
                          <div className="p-3 bg-gray-800 rounded-full">
                            <FileKey2 className="h-6 w-6 text-gray-600" />
                          </div>
                          <p className="text-gray-500 text-sm">
                            {searchQuery || statusFilter !== "all"
                              ? "No certificates match your filters"
                              : "No certificates issued yet"}
                          </p>
                          {!searchQuery && statusFilter === "all" && (
                            <Button
                              onClick={() => setShowIssueDialog(true)}
                              size="sm"
                              variant="outline"
                              className="border-gray-700 text-gray-400 hover:text-white mt-1"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1.5" />
                              Issue your first certificate
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCerts.map((cert) => {
                      const certStatus = getCertStatus(cert);
                      const cfg = statusConfig[certStatus];
                      const StatusIcon = cfg.icon;
                      const daysLeft = differenceInDays(
                        cert.expires_at * 1000,
                        Date.now()
                      );

                      return (
                        <TableRow
                          key={cert.id || cert.certificate_id}
                          className="border-gray-800/60 hover:bg-gray-800/30 transition-colors cursor-pointer"
                          onClick={() => {
                            setSelectedCert(cert);
                            setShowDetailDialog(true);
                          }}
                        >
                          {/* Customer */}
                          <TableCell className="pl-4 py-3.5">
                            <div>
                              <p className="text-white font-medium text-sm">
                                {cert.customer_name || cert.customer_id}
                              </p>
                              <p className="text-gray-500 text-xs font-mono mt-0.5">
                                {cert.customer_id}
                              </p>
                            </div>
                          </TableCell>

                          {/* Hash */}
                          <TableCell className="py-3.5">
                            <div className="flex items-center gap-1.5">
                              <Hash className="h-3.5 w-3.5 text-gray-600 flex-shrink-0" />
                              <span className="font-mono text-xs text-cyan-400">
                                {cert.hash
                                  ? cert.hash.substring(0, 18) + "…"
                                  : (cert.id || cert.certificate_id || "—").substring(0, 18) + "…"}
                              </span>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      copyToClipboard(
                                        cert.hash || cert.id || "",
                                        "Hash copied!"
                                      );
                                    }}
                                    className="text-gray-600 hover:text-gray-300 transition-colors"
                                  >
                                    <Copy className="h-3 w-3" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
                                  Copy full hash
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>

                          {/* Issued */}
                          <TableCell className="py-3.5">
                            <p className="text-gray-300 text-sm">
                              {cert.issued_at
                                ? format(new Date(cert.issued_at * 1000), "MMM d, yyyy")
                                : "—"}
                            </p>
                          </TableCell>

                          {/* Expires */}
                          <TableCell className="py-3.5">
                            <div>
                              <p className={`text-sm ${certStatus === "expired" ? "text-red-400" : certStatus === "expiring" ? "text-amber-400" : "text-gray-300"}`}>
                                {cert.expires_at
                                  ? format(new Date(cert.expires_at * 1000), "MMM d, yyyy")
                                  : "—"}
                              </p>
                              {cert.expires_at && (
                                <p className="text-xs text-gray-600 mt-0.5">
                                  {daysLeft < 0
                                    ? `${Math.abs(daysLeft)}d ago`
                                    : `in ${daysLeft}d`}
                                </p>
                              )}
                            </div>
                          </TableCell>

                          {/* Status */}
                          <TableCell className="py-3.5">
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border ${cfg.color}`}
                            >
                              <StatusIcon className="h-3 w-3" />
                              {cfg.label}
                            </span>
                          </TableCell>

                          {/* Actions */}
                          <TableCell
                            className="text-right pr-4 py-3.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-gray-500 hover:text-white"
                                    onClick={() => {
                                      setSelectedCert(cert);
                                      setShowDetailDialog(true);
                                    }}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
                                  View details
                                </TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 text-gray-500 hover:text-white"
                                    onClick={() => downloadCert(cert)}
                                  >
                                    <Download className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
                                  Download JSON
                                </TooltipContent>
                              </Tooltip>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Footer count */}
            {!loading && filteredCerts.length > 0 && (
              <div className="px-4 py-2.5 border-t border-gray-800 flex items-center justify-between">
                <p className="text-xs text-gray-600">
                  Showing {filteredCerts.length} of {certs.length} certificates
                </p>
                {(searchQuery || statusFilter !== "all") && (
                  <button
                    onClick={() => {
                      setSearchQuery("");
                      setStatusFilter("all");
                    }}
                    className="text-xs text-cyan-500 hover:text-cyan-400"
                  >
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Issue Certificate Dialog ── */}
      <Dialog open={showIssueDialog} onOpenChange={setShowIssueDialog}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <ShieldCheck className="h-5 w-5 text-cyan-400" />
              Issue Verification Certificate
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Issue a signed KYC certificate for a verified customer. The
              customer must have a verified KYC status on the blockchain.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">
                Customer ID <span className="text-red-400">*</span>
              </Label>
              <Input
                placeholder="e.g. CUST-ABC123"
                value={issueForm.customer_id}
                onChange={(e) =>
                  setIssueForm((f) => ({ ...f, customer_id: e.target.value }))
                }
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 focus-visible:ring-cyan-500/50"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">
                Requester ID <span className="text-red-400">*</span>
              </Label>
              <Input
                placeholder="e.g. bank-service-001"
                value={issueForm.requester_id}
                onChange={(e) =>
                  setIssueForm((f) => ({ ...f, requester_id: e.target.value }))
                }
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 focus-visible:ring-cyan-500/50"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">
                Requester Public Key{" "}
                <span className="text-gray-600">(optional)</span>
              </Label>
              <Textarea
                placeholder="Paste PEM public key (RSA or ECDSA)..."
                value={issueForm.requester_public_key}
                onChange={(e) =>
                  setIssueForm((f) => ({
                    ...f,
                    requester_public_key: e.target.value,
                  }))
                }
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 focus-visible:ring-cyan-500/50 font-mono text-xs h-24 resize-none"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">
                Validity (days)
              </Label>
              <div className="flex gap-2">
                {[30, 90, 180, 365].map((d) => (
                  <button
                    key={d}
                    onClick={() =>
                      setIssueForm((f) => ({ ...f, validity_days: d }))
                    }
                    className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${
                      issueForm.validity_days === d
                        ? "bg-cyan-600 border-cyan-600 text-white"
                        : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-600">
                Actual validity may be shortened based on ID expiry or review
                cycle.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setShowIssueDialog(false)}
                className="border-gray-700 text-gray-300"
                disabled={issuing}
              >
                Cancel
              </Button>
              <Button
                onClick={handleIssueCertificate}
                className="bg-cyan-600 hover:bg-cyan-500 text-white"
                disabled={issuing}
              >
                {issuing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Issuing…
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4 mr-1.5" />
                    Issue Certificate
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Verify Certificate Dialog ── */}
      <Dialog
        open={showVerifyDialog}
        onOpenChange={(open) => {
          setShowVerifyDialog(open);
          if (!open) {
            setVerifyResult(null);
            setVerifyForm({ certificateJson: "" });
          }
        }}
      >
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <BadgeCheck className="h-5 w-5 text-emerald-400" />
              Verify Certificate
            </DialogTitle>
            <DialogDescription className="text-gray-500">
              Paste a certificate JSON to verify its cryptographic signature and
              validity status.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Certificate JSON</Label>
              <Textarea
                placeholder='{"certificate_id": "...", "customer_id": "...", ...}'
                value={verifyForm.certificateJson}
                onChange={(e) =>
                  setVerifyForm({ certificateJson: e.target.value })
                }
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 focus-visible:ring-cyan-500/50 font-mono text-xs h-40 resize-none"
              />
            </div>

            {/* Verify Result */}
            {verifyResult && (
              <div
                className={`rounded-lg border p-3.5 ${
                  verifyResult.valid
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : "bg-red-500/5 border-red-500/20"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  {verifyResult.valid ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="space-y-1 flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        verifyResult.valid ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {verifyResult.valid
                        ? "Certificate is Valid"
                        : "Certificate is Invalid"}
                    </p>
                    <p className="text-xs text-gray-400">{verifyResult.message}</p>

                    {verifyResult.data && (
                      <div className="mt-2 space-y-1">
                        {Boolean(verifyResult.data.customer_id) && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Customer ID</span>
                            <span className="text-gray-300 font-mono">
                              {String(verifyResult.data.customer_id)}
                            </span>
                          </div>
                        )}
                        {Boolean(verifyResult.data.expires_at_human) && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Expires</span>
                            <span className="text-gray-300">
                              {String(verifyResult.data.expires_at_human)}
                            </span>
                          </div>
                        )}
                        {Boolean(verifyResult.data.key_type) && (
                          <div className="flex justify-between text-xs">
                            <span className="text-gray-500">Key Type</span>
                            <span className="text-gray-300">
                              {String(verifyResult.data.key_type)}
                            </span>
                          </div>
                        )}
                        {Boolean(verifyResult.data.grace_period) && (
                          <div className="flex items-center gap-1.5 mt-1.5 bg-orange-500/10 border border-orange-500/20 rounded px-2 py-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-orange-400 flex-shrink-0" />
                            <p className="text-xs text-orange-300">
                              Certificate is in grace period — renewal required
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="outline"
                onClick={() => setShowVerifyDialog(false)}
                className="border-gray-700 text-gray-300"
              >
                Close
              </Button>
              <Button
                onClick={handleVerifyCertificate}
                className="bg-emerald-700 hover:bg-emerald-600 text-white"
                disabled={verifying || !verifyForm.certificateJson.trim()}
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Verifying…
                  </>
                ) : (
                  <>
                    <BadgeCheck className="h-4 w-4 mr-1.5" />
                    Verify
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Certificate Detail Dialog ── */}
      <Dialog open={showDetailDialog} onOpenChange={setShowDetailDialog}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-white">
              <FileKey2 className="h-5 w-5 text-cyan-400" />
              Certificate Details
            </DialogTitle>
          </DialogHeader>

          {selectedCert && (
            <div className="space-y-4 mt-1">
              {/* Status banner */}
              {(() => {
                const s = getCertStatus(selectedCert);
                const cfg = statusConfig[s];
                const Icon = cfg.icon;
                return (
                  <div
                    className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 ${cfg.color}`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{cfg.label}</p>
                      {selectedCert.expires_at && (
                        <p className="text-xs opacity-70 mt-0.5">
                          {isPast(selectedCert.expires_at * 1000)
                            ? `Expired ${formatDistanceToNow(selectedCert.expires_at * 1000)} ago`
                            : `Expires ${formatDistanceToNow(selectedCert.expires_at * 1000, { addSuffix: true })}`}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* Fields */}
              <div className="space-y-3 bg-gray-800/50 rounded-lg border border-gray-700/50 p-3.5">
                {(
                  [
                    {
                      label: "Certificate ID",
                      value: selectedCert.id || selectedCert.certificate_id || "",
                      mono: true,
                      copy: true,
                    },
                    {
                      label: "Customer ID",
                      value: selectedCert.customer_id,
                      mono: true,
                    },
                    {
                      label: "Customer Name",
                      value: selectedCert.customer_name || "—",
                    },
                    {
                      label: "Requester ID",
                      value: selectedCert.requester_id || "—",
                      mono: true,
                    },
                    {
                      label: "Key Type",
                      value: selectedCert.key_type || "—",
                    },
                    {
                      label: "Issued At",
                      value: selectedCert.issued_at
                        ? format(
                            new Date(selectedCert.issued_at * 1000),
                            "MMM d, yyyy HH:mm:ss"
                          )
                        : "—",
                    },
                    {
                      label: "Expires At",
                      value: selectedCert.expires_at
                        ? format(
                            new Date(selectedCert.expires_at * 1000),
                            "MMM d, yyyy HH:mm:ss"
                          )
                        : "—",
                    },
                    {
                      label: "Hash / Signature",
                      value: selectedCert.hash || "—",
                      mono: true,
                      copy: true,
                      truncate: true,
                    },
                    {
                      label: "Issuer",
                      value: selectedCert.issuer || "KYC-BLOCKCHAIN-SYSTEM",
                    },
                  ] as { label: string; value: string; mono?: boolean; copy?: boolean; truncate?: boolean }[]
                )
                  .filter((f) => f.value && f.value !== "—")
                  .map((field) => (
                    <div key={field.label} className="flex justify-between items-start gap-3">
                      <span className="text-xs text-gray-500 flex-shrink-0 pt-0.5 w-32">
                        {field.label}
                      </span>
                      <div className="flex items-start gap-1.5 min-w-0 flex-1 justify-end">
                        <span
                          className={`text-xs text-right break-all ${
                            field.mono ? "font-mono text-cyan-400" : "text-gray-200"
                          } ${field.truncate ? "line-clamp-1" : ""}`}
                        >
                          {field.value}
                        </span>
                        {field.copy && field.value && field.value !== "—" && (
                          <button
                            onClick={() =>
                              copyToClipboard(field.value, `${field.label} copied!`)
                            }
                            className="text-gray-600 hover:text-gray-300 transition-colors flex-shrink-0 mt-0.5"
                          >
                            <Copy className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
              </div>

              {/* Actions */}
              <div className="flex justify-between items-center pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => downloadCert(selectedCert)}
                  className="border-gray-700 text-gray-300 hover:text-white"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download JSON
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setVerifyForm({
                        certificateJson: JSON.stringify(selectedCert, null, 2),
                      });
                      setShowDetailDialog(false);
                      setShowVerifyDialog(true);
                    }}
                    className="border-gray-700 text-gray-300 hover:text-white"
                  >
                    <BadgeCheck className="h-3.5 w-3.5 mr-1.5" />
                    Verify
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setShowDetailDialog(false)}
                    className="bg-gray-700 hover:bg-gray-600 text-white"
                  >
                    Close
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}