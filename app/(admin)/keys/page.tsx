"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Key, RefreshCw, Eye, EyeOff, ShieldOff, Search,
  Copy, ChevronDown, ChevronUp, AlertTriangle,
  CheckCircle2, XCircle, Clock, Hash, Building2,
  Mail, Calendar, Fingerprint, Loader2, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import api from "@/lib/api";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RequesterKey {
  id: string;
  key_name: string;
  key_type: string;
  key_size: number;
  public_key_pem: string;
  fingerprint: string;
  organization: string;
  email: string;
  description: string;
  is_active: boolean;
  created_at: number;   // Unix seconds
  expires_at: number;   // Unix seconds
  created_by: string;
  last_used_at?: number;
  revoked_at?: number;
  revoked_by?: string;
}

// ─── Key Detail Dialog ────────────────────────────────────────────────────────

function KeyDetailDialog({
  keyInfo,
  onClose,
  onRevoke,
  revoking,
}: {
  keyInfo: RequesterKey | null;
  onClose: () => void;
  onRevoke: (id: string, reason: string) => void;
  revoking: boolean;
}) {
  const { toast } = useToast();
  const [showPem,      setShowPem]      = useState(false);
  const [revokeReason, setRevokeReason] = useState("");
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  useEffect(() => {
    if (keyInfo) { setShowPem(false); setRevokeReason(""); setConfirmRevoke(false); }
  }, [keyInfo?.id]);

  if (!keyInfo) return null;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  const daysUntilExpiry = differenceInDays(keyInfo.expires_at * 1000, Date.now());
  const isExpired       = daysUntilExpiry < 0;
  const isExpiringSoon  = !isExpired && daysUntilExpiry <= 30;

  const Field = ({ label, value, mono = false, copyable = false }: {
    label: string; value?: string | number | null; mono?: boolean; copyable?: boolean;
  }) => {
    if (!value && value !== 0) return null;
    return (
      <div className="flex justify-between items-start gap-4 py-2 border-b border-gray-800/60 last:border-0">
        <span className="text-xs text-gray-500 shrink-0 w-32">{label}</span>
        <div className="flex items-start gap-1.5 min-w-0 flex-1 justify-end">
          <span className={`text-xs text-right break-all ${mono ? "font-mono text-cyan-400" : "text-gray-200"}`}>
            {String(value)}
          </span>
          {copyable && (
            <button onClick={() => copy(String(value), label)} className="text-gray-600 hover:text-gray-300 shrink-0 mt-0.5">
              <Copy className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog open={Boolean(keyInfo)} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Key className="h-5 w-5 text-violet-400" />
            Key Details
          </DialogTitle>
        </DialogHeader>

        {/* Status banner */}
        <div className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 ${
          !keyInfo.is_active   ? "bg-red-500/5 border-red-500/20 text-red-400"
          : isExpired          ? "bg-red-500/5 border-red-500/20 text-red-400"
          : isExpiringSoon     ? "bg-amber-500/5 border-amber-500/20 text-amber-400"
          : "bg-emerald-500/5 border-emerald-500/20 text-emerald-400"
        }`}>
          {!keyInfo.is_active || isExpired
            ? <XCircle className="h-4 w-4 shrink-0" />
            : isExpiringSoon
            ? <AlertTriangle className="h-4 w-4 shrink-0" />
            : <CheckCircle2 className="h-4 w-4 shrink-0" />}
          <div>
            <p className="text-sm font-medium">
              {!keyInfo.is_active ? "Revoked" : isExpired ? "Expired" : isExpiringSoon ? "Expiring Soon" : "Active"}
            </p>
            <p className="text-xs opacity-70 mt-0.5">
              {keyInfo.revoked_at
                ? `Revoked ${formatDistanceToNow(keyInfo.revoked_at * 1000)} ago`
                : isExpired
                ? `Expired ${Math.abs(daysUntilExpiry)}d ago`
                : `Expires ${formatDistanceToNow(keyInfo.expires_at * 1000, { addSuffix: true })}`}
            </p>
          </div>
        </div>

        {/* Fields */}
        <div className="bg-gray-800/40 rounded-lg border border-gray-700/50 px-4 py-2">
          <Field label="Key ID"       value={keyInfo.id}           mono copyable />
          <Field label="Key Name"     value={keyInfo.key_name}     mono copyable />
          <Field label="Organization" value={keyInfo.organization} />
          <Field label="Email"        value={keyInfo.email} />
          <Field label="Description"  value={keyInfo.description} />
          <Field label="Type / Size"  value={`${keyInfo.key_type}-${keyInfo.key_size}`} />
          <Field label="Fingerprint"  value={keyInfo.fingerprint} mono copyable />
          <Field label="Created By"   value={keyInfo.created_by} mono />
          <Field label="Created"      value={keyInfo.created_at ? format(new Date(keyInfo.created_at * 1000), "MMM d, yyyy HH:mm") : undefined} />
          <Field label="Expires"      value={keyInfo.expires_at ? format(new Date(keyInfo.expires_at * 1000), "MMM d, yyyy HH:mm") : undefined} />
          <Field label="Last Used"    value={keyInfo.last_used_at ? format(new Date(keyInfo.last_used_at * 1000), "MMM d, yyyy HH:mm") : "Never"} />
          {keyInfo.revoked_by && <Field label="Revoked By" value={keyInfo.revoked_by} mono />}
        </div>

        {/* Public key PEM */}
        {keyInfo.public_key_pem && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-gray-500 uppercase tracking-wider">Public Key (PEM)</p>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setShowPem((v) => !v)}
                  className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
                >
                  {showPem ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showPem ? "Hide" : "Show"}
                </button>
                <button
                  onClick={() => copy(keyInfo.public_key_pem, "Public key")}
                  className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1"
                >
                  <Copy className="h-3 w-3" />Copy
                </button>
              </div>
            </div>
            {showPem ? (
              <pre className="bg-gray-950 rounded-lg border border-gray-800 p-3 font-mono text-xs text-cyan-400 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                {keyInfo.public_key_pem}
              </pre>
            ) : (
              <div className="bg-gray-950 rounded-lg border border-gray-800 px-3 py-2">
                <p className="font-mono text-xs text-gray-600 tracking-widest">
                  ●●●●●●●●●●●●●●●●●●●●●●●●●●●●●●
                </p>
              </div>
            )}
          </div>
        )}

        {/* Revoke section — only for active keys */}
        {keyInfo.is_active && !isExpired && (
          <div className="border border-red-900/40 rounded-lg p-3.5 space-y-3 bg-red-950/10">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-400">Revoke Key</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Revoking disables this key immediately. All certificates issued with it remain valid — only new issuance is blocked.
                </p>
              </div>
            </div>
            {!confirmRevoke ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setConfirmRevoke(true)}
                className="border-red-800 text-red-400 hover:bg-red-900/20 w-full"
              >
                <ShieldOff className="h-3.5 w-3.5 mr-1.5" />Revoke This Key
              </Button>
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="Reason for revocation (optional)"
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 text-sm h-8"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setConfirmRevoke(false)}
                    className="flex-1 border-gray-700 text-gray-400"
                    disabled={revoking}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => onRevoke(keyInfo.id, revokeReason)}
                    disabled={revoking}
                    className="flex-1 bg-red-800 hover:bg-red-700 text-white"
                  >
                    {revoking
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Revoking…</>
                      : <><ShieldOff className="h-3.5 w-3.5 mr-1.5" />Confirm Revoke</>}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-1">
          <Button size="sm" onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white">Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KeysPage() {
  const { toast } = useToast();
  const [keys,    setKeys]    = useState<RequesterKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [search,  setSearch]  = useState("");
  const [filter,  setFilter]  = useState<"all" | "active" | "revoked" | "expiring">("all");
  const [selected, setSelected] = useState<RequesterKey | null>(null);
  const [revoking, setRevoking] = useState(false);

  // ── Fetch all keys ─────────────────────────────────────────────────────────
  // GET /api/v1/keys  (admin only)
  const fetchKeys = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/keys");
      const data = res.data?.data?.keys || res.data?.keys || [];
      setKeys(Array.isArray(data) ? data : []);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchKeys(); }, [fetchKeys]);

  // ── Revoke ─────────────────────────────────────────────────────────────────
  // POST /api/v1/keys/revoke  (admin only)
  const handleRevoke = async (keyId: string, reason: string) => {
    setRevoking(true);
    try {
      await api.post("/api/v1/keys/revoke", { key_id: keyId, reason: reason || "Revoked by admin" });
      toast({ title: "Key revoked successfully" });
      setSelected(null);
      await fetchKeys();
    } catch (err: any) {
      toast({ title: err?.response?.data?.error || "Failed to revoke key", variant: "destructive" });
    } finally {
      setRevoking(false);
    }
  };

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = keys.filter((k) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      k.key_name?.toLowerCase().includes(q) ||
      k.organization?.toLowerCase().includes(q) ||
      k.email?.toLowerCase().includes(q) ||
      k.fingerprint?.toLowerCase().includes(q);

    const daysLeft = differenceInDays(k.expires_at * 1000, Date.now());
    const matchFilter =
      filter === "all"      ? true
      : filter === "active"   ? k.is_active && daysLeft >= 0
      : filter === "revoked"  ? !k.is_active || daysLeft < 0
      : filter === "expiring" ? k.is_active && daysLeft >= 0 && daysLeft <= 30
      : true;

    return matchSearch && matchFilter;
  });

  const counts = {
    total:    keys.length,
    active:   keys.filter((k) => k.is_active && differenceInDays(k.expires_at * 1000, Date.now()) >= 0).length,
    revoked:  keys.filter((k) => !k.is_active).length,
    expiring: keys.filter((k) => {
      const d = differenceInDays(k.expires_at * 1000, Date.now());
      return k.is_active && d >= 0 && d <= 30;
    }).length,
  };

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Key className="h-6 w-6 text-violet-400" />
            Requester Keys
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            RSA/ECDSA key pairs for certificate issuance — manage via Go API
          </p>
        </div>
        <Button
          onClick={fetchKeys}
          variant="outline"
          size="sm"
          className="border-gray-700 text-gray-300"
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-4 gap-3">
        {([
          { label: "Total",         value: counts.total,    filter: "all",      color: "text-gray-300",  bg: "bg-gray-800/60 border-gray-700" },
          { label: "Active",        value: counts.active,   filter: "active",   color: "text-emerald-400", bg: "bg-emerald-900/20 border-emerald-800/50" },
          { label: "Expiring ≤30d", value: counts.expiring, filter: "expiring", color: "text-amber-400", bg: "bg-amber-900/20 border-amber-800/50" },
          { label: "Revoked",       value: counts.revoked,  filter: "revoked",  color: "text-red-400",   bg: "bg-red-900/20 border-red-800/50" },
        ] as const).map((s) => (
          <button
            key={s.filter}
            onClick={() => setFilter(s.filter)}
            className={`rounded-xl border px-4 py-3 text-left transition-all ${s.bg} ${filter === s.filter ? "ring-1 ring-offset-0 ring-current" : ""}`}
          >
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* ── Table ── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3 border-b border-gray-800 px-4 pt-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
            <Input
              placeholder="Search key name, org, fingerprint…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="border-gray-800 hover:bg-transparent">
                <TableHead className="text-gray-500 text-xs uppercase pl-4">Key Name</TableHead>
                <TableHead className="text-gray-500 text-xs uppercase">Organization</TableHead>
                <TableHead className="text-gray-500 text-xs uppercase">Type</TableHead>
                <TableHead className="text-gray-500 text-xs uppercase">Fingerprint</TableHead>
                <TableHead className="text-gray-500 text-xs uppercase">Expires</TableHead>
                <TableHead className="text-gray-500 text-xs uppercase">Status</TableHead>
                <TableHead className="text-right text-gray-500 text-xs uppercase pr-4">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                [...Array(4)].map((_, i) => (
                  <TableRow key={i} className="border-gray-800">
                    {[...Array(7)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800 rounded" /></TableCell>)}
                  </TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12">
                    <div className="flex flex-col items-center gap-2">
                      <Key className="h-8 w-8 text-gray-700" />
                      <p className="text-gray-500 text-sm">No requester keys found</p>
                      <p className="text-gray-600 text-xs">Generate keys from the Certificates page</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((k) => {
                  const daysLeft  = differenceInDays(k.expires_at * 1000, Date.now());
                  const isExpired = daysLeft < 0;
                  const expiringSoon = !isExpired && daysLeft <= 30;
                  return (
                    <TableRow
                      key={k.id}
                      className="border-gray-800 hover:bg-gray-800/30 cursor-pointer transition-colors"
                      onClick={() => setSelected(k)}
                    >
                      <TableCell className="pl-4 py-3.5">
                        <p className="text-white font-medium text-sm">{k.key_name}</p>
                        <p className="text-gray-600 text-xs font-mono mt-0.5">{k.id?.slice(0, 20)}…</p>
                      </TableCell>
                      <TableCell className="py-3.5">
                        <p className="text-gray-300 text-sm">{k.organization}</p>
                        <p className="text-gray-600 text-xs">{k.email}</p>
                      </TableCell>
                      <TableCell className="py-3.5">
                        <span className="font-mono text-xs text-cyan-400">{k.key_type}-{k.key_size}</span>
                      </TableCell>
                      <TableCell className="py-3.5">
                        <span className="font-mono text-xs text-gray-500">{k.fingerprint}</span>
                      </TableCell>
                      <TableCell className="py-3.5">
                        <p className={`text-sm ${isExpired ? "text-red-400" : expiringSoon ? "text-amber-400" : "text-gray-300"}`}>
                          {k.expires_at ? format(new Date(k.expires_at * 1000), "MMM d, yyyy") : "—"}
                        </p>
                        <p className="text-xs text-gray-600 mt-0.5">
                          {isExpired ? `${Math.abs(daysLeft)}d ago` : `in ${daysLeft}d`}
                        </p>
                      </TableCell>
                      <TableCell className="py-3.5">
                        {!k.is_active ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full border bg-red-500/10 text-red-400 border-red-500/20">
                            <XCircle className="h-3 w-3" />Revoked
                          </span>
                        ) : isExpired ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full border bg-gray-500/10 text-gray-400 border-gray-500/20">
                            <Clock className="h-3 w-3" />Expired
                          </span>
                        ) : expiringSoon ? (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full border bg-amber-500/10 text-amber-400 border-amber-500/20">
                            <AlertTriangle className="h-3 w-3" />Expiring
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" />Active
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="pr-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-gray-400 hover:text-white text-xs"
                            onClick={() => setSelected(k)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />View
                          </Button>
                          {k.is_active && !isExpired && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-red-400 hover:text-red-300 hover:bg-red-900/20 text-xs"
                              onClick={() => { setSelected(k); }}
                            >
                              <ShieldOff className="h-3.5 w-3.5 mr-1" />Revoke
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
          {!loading && filtered.length > 0 && (
            <div className="px-4 py-2.5 border-t border-gray-800">
              <p className="text-xs text-gray-600">{filtered.length} of {keys.length} keys</p>
            </div>
          )}
        </CardContent>
      </Card>

      <KeyDetailDialog
        keyInfo={selected}
        onClose={() => setSelected(null)}
        onRevoke={handleRevoke}
        revoking={revoking}
      />
    </div>
  );
}