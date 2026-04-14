"use client";

import { useEffect, useState } from "react";
import { Search, Filter, Eye, CheckCircle, XCircle, RefreshCw,
  X, User, Mail, Phone, MapPin, Shield, Calendar, Hash, } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import KYCStatusBadge from "@/components/kyc/KYCStatusBadge";
import { KYCData, KYCStatus } from "@/types/kyc";
import api from "@/lib/api";
import { format } from "date-fns";

// ─── Detail Drawer ────────────────────────────────────────────────────────────

function KYCDetailDrawer({
  record,
  onClose,
}: {
  record: KYCData | null;
  onClose: () => void;
}) {
  if (!record) return null;

  const row = (icon: React.ReactNode, label: string, value: React.ReactNode) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-800 last:border-0">
      <div className="mt-0.5 text-gray-500 shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-gray-500 mb-0.5">{label}</p>
        <p className="text-sm text-white break-all">{value ?? "—"}</p>
      </div>
    </div>
  );

  const fmtDate = (unix?: number) =>
    unix ? format(new Date(unix * 1000), "MMM d, yyyy HH:mm") : "—";

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-md bg-gray-900 border-l border-gray-800 z-50 flex flex-col shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 sticky top-0 bg-gray-900">
          <div>
            <h2 className="text-white font-semibold text-base">
              {record.first_name} {record.last_name}
            </h2>
            <p className="text-gray-500 text-xs font-mono mt-0.5">{record.customer_id}</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status + Risk */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-800">
          <KYCStatusBadge status={record.status} />
          <span
            className={`text-xs px-2 py-0.5 rounded-full capitalize ${
              record.risk_level === "high"
                ? "bg-red-900 text-red-300"
                : record.risk_level === "medium"
                ? "bg-yellow-900 text-yellow-300"
                : "bg-green-900 text-green-300"
            }`}
          >
            {record.risk_level || "low"} risk
          </span>
        </div>

        {/* Body */}
        <div className="px-5 py-3 space-y-5 flex-1">

          {/* Personal Info */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Personal Information
            </p>
            {row(<User className="h-4 w-4" />, "Full Name", `${record.first_name} ${record.last_name}`)}
            {row(<Calendar className="h-4 w-4" />, "Date of Birth", record.date_of_birth)}
            {row(<Shield className="h-4 w-4" />, "Nationality", record.nationality)}
          </section>

          {/* Contact */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Contact
            </p>
            {row(<Mail className="h-4 w-4" />, "Email", record.email)}
            {row(<Phone className="h-4 w-4" />, "Phone", record.phone)}
          </section>

          {/* Identity Document */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Identity Document
            </p>
            {row(<Hash className="h-4 w-4" />, "ID Type", record.id_type)}
            {row(<Hash className="h-4 w-4" />, "ID Number", record.id_number)}
            {row(<Calendar className="h-4 w-4" />, "ID Expiry", record.id_expiry_date)}
          </section>

          {/* Address */}
          {record.address && (
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Address
              </p>
              {row(
                <MapPin className="h-4 w-4" />,
                "Address",
                [
                  record.address.street,
                  record.address.city,
                  record.address.state,
                  record.address.postal_code,
                  record.address.country,
                ]
                  .filter(Boolean)
                  .join(", "),
              )}
            </section>
          )}

          {/* Verification */}
          <section>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
              Verification
            </p>
            {row(<Shield className="h-4 w-4" />, "Bank ID", record.bank_id)}
            {row(<Shield className="h-4 w-4" />, "Verified By", record.verified_by)}
            {row(<Calendar className="h-4 w-4" />, "Verification Date", fmtDate(record.verification_date))}
            {row(<Calendar className="h-4 w-4" />, "Created At", fmtDate(record.created_at))}
            {row(<Calendar className="h-4 w-4" />, "Updated At", fmtDate(record.updated_at))}
            {record.scan_score !== undefined &&
              row(<Shield className="h-4 w-4" />, "Scan Score", `${(record.scan_score * 100).toFixed(1)}%`)}
            {record.document_hash &&
              row(
                <Hash className="h-4 w-4" />,
                "Document Hash",
                <span className="font-mono text-xs">{record.document_hash}</span>,
              )}
          </section>

          {/* Review */}
          {(record.review_count > 0 || record.last_review_date) && (
            <section>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Periodic Review
              </p>
              {row(<RefreshCw className="h-4 w-4" />, "Review Count", record.review_count)}
              {row(<Calendar className="h-4 w-4" />, "Last Review", fmtDate(record.last_review_date))}
              {row(<Calendar className="h-4 w-4" />, "Next Review", fmtDate(record.next_review_date))}
            </section>
          )}
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KYCPage() {
  const [records, setRecords] = useState<KYCData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [selected, setSelected] = useState<KYCData | null>(null);

  const fetchKYC = async () => {
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
  };

  useEffect(() => {
    fetchKYC();
  }, [statusFilter]);

  const filtered = records.filter(
    (r) =>
      r.first_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.last_name?.toLowerCase().includes(search.toLowerCase()) ||
      r.email?.toLowerCase().includes(search.toLowerCase()) ||
      r.id_number?.toLowerCase().includes(search.toLowerCase())
  );

  const handleVerify = async (customerId: string) => {
    try {
      await api.post(`/api/v1/kyc/${customerId}/verify`);
      fetchKYC();
    } catch {}
  };

  const handleReject = async (customerId: string) => {
    try {
      await api.post(`/api/v1/kyc/${customerId}/reject`);
      fetchKYC();
    } catch {}
  };

  return (
    <>
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">KYC Management</h1>
          <p className="text-gray-400 text-sm mt-1">Review and manage customer KYC applications</p>
        </div>
        <Button onClick={fetchKYC} variant="outline" size="sm" className="border-gray-700 text-gray-300">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

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
                <Filter className="h-4 w-4 mr-2" />
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
          <div className="rounded-md border border-gray-800">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800 hover:bg-gray-800/50">
                  <TableHead className="text-gray-400">Name</TableHead>
                  <TableHead className="text-gray-400">Email</TableHead>
                  <TableHead className="text-gray-400">ID Number</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400">Risk Level</TableHead>
                  <TableHead className="text-gray-400">Created</TableHead>
                  <TableHead className="text-right text-gray-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i} className="border-gray-800">
                      {[...Array(7)].map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full bg-gray-800" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                      No KYC records found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((record) => (
                    <TableRow
                      key={record.customer_id}
                      className="border-gray-800 hover:bg-gray-800/50"
                    >
                      <TableCell className="text-white font-medium">
                        {record.first_name} {record.last_name}
                      </TableCell>
                      <TableCell className="text-gray-400">{record.email}</TableCell>
                      <TableCell className="text-gray-400 font-mono text-sm">
                        {record.id_number}
                      </TableCell>
                      <TableCell>
                        <KYCStatusBadge status={record.status} />
                      </TableCell>
                      <TableCell>
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                            record.risk_level === "high"
                              ? "bg-red-900 text-red-300"
                              : record.risk_level === "medium"
                              ? "bg-yellow-900 text-yellow-300"
                              : "bg-green-900 text-green-300"
                          }`}
                        >
                          {record.risk_level || "low"}
                        </span>
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {record.created_at
                          ? format(new Date(record.created_at * 1000), "MMM d, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {record.status === "PENDING" && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-green-400 hover:text-green-300 hover:bg-green-900/20 h-7 px-2"
                                onClick={() => handleVerify(record.customer_id)}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Verify
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-400 hover:text-red-300 hover:bg-red-900/20 h-7 px-2"
                                onClick={() => handleReject(record.customer_id)}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </>
                          )}
                          <Button
                              size="sm"
                              variant="ghost"
                              className="text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 h-7 px-2"
                              onClick={() => setSelected(record)}
                            >
                              <Eye className="h-4 w-4 mr-1" />
                              View
                            </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>

    {/* Detail Drawer */}
    <KYCDetailDrawer record={selected} onClose={() => setSelected(null)} />
    </>
  );
}
