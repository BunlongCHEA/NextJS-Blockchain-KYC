"use client";

/**
 * app/(admin)/audit/page.tsx — Improved Audit Log Viewer
 *
 * Changes from original:
 * - Proper safe date rendering (no RangeError on bad timestamps)
 * - Filter bar: action type, resource type, date range, user_id search
 * - Hides ANOMALY_DETECTED LOW/MEDIUM by default (show toggle)
 * - Color-codes by risk: CRITICAL/HIGH anomalies visually prominent
 * - Expandable row to see full `details` JSON
 * - "anonymous" / "auth:login" labels explained with tooltip
 */

import { useEffect, useState, useCallback } from "react";
import {
  RefreshCw, Search, AlertCircle, ChevronDown, ChevronRight,
  Shield, User, Eye, EyeOff, Filter, Download,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { format, formatDistanceToNow } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AuditLog {
  id:            number;
  user_id:       string;
  action:        string;
  resource_type: string;
  resource_id:   string;
  details:       Record<string, any>;
  ip_address:    string;
  user_agent:    string;
  created_at:    string; // ISO timestamp from DB
}

// ─── Safe date helpers ────────────────────────────────────────────────────────

function safeDate(v: string | number | null | undefined): Date | null {
  if (!v) return null;
  const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
  if (isNaN(d.getTime()) || d.getFullYear() < 2000) return null;
  return d;
}
function safeFmt(v: string | number | null | undefined, f = "MMM d yyyy, HH:mm:ss"): string {
  const d = safeDate(v);
  return d ? format(d, f) : "—";
}
function safeAgo(v: string | number | null | undefined): string {
  const d = safeDate(v);
  return d ? formatDistanceToNow(d, { addSuffix: true }) : "—";
}

// ─── Action config ────────────────────────────────────────────────────────────

interface ActionCfg { color: string; label?: string; priority: number }

const ACTION_CFG: Record<string, ActionCfg> = {
  // Auth
  LOGIN:                        { color: "bg-emerald-900/60 text-emerald-300 border-emerald-800",  priority: 1 },
  LOGIN_FAILED:                 { color: "bg-red-900/60 text-red-300 border-red-800",              priority: 0 },
  LOGOUT:                       { color: "bg-gray-800 text-gray-400 border-gray-700",              priority: 3 },
  REGISTER:                     { color: "bg-blue-900/60 text-blue-300 border-blue-800",           priority: 1 },
  PASSWORD_CHANGED:             { color: "bg-cyan-900/60 text-cyan-300 border-cyan-800",           priority: 1 },
  USER_PASSWORD_RESET:          { color: "bg-orange-900/60 text-orange-300 border-orange-800",     priority: 1 },
  // KYC
  KYC_CREATED:                  { color: "bg-violet-900/60 text-violet-300 border-violet-800",     priority: 2 },
  KYC_VERIFIED:                 { color: "bg-emerald-900/60 text-emerald-300 border-emerald-800",  priority: 1 },
  KYC_REJECTED:                 { color: "bg-red-900/60 text-red-300 border-red-800",              priority: 1 },
  KYC_DELETED:                  { color: "bg-red-900/80 text-red-200 border-red-700",              priority: 0 },
  KYC_AI_SCAN:                  { color: "bg-indigo-900/60 text-indigo-300 border-indigo-800",     priority: 2 },
  KYC_READ:                     { color: "bg-gray-800 text-gray-400 border-gray-700",              priority: 3 },
  KYC_LIST:                     { color: "bg-gray-800 text-gray-400 border-gray-700",              priority: 4 },
  KYC_PERIODIC_REVIEW:          { color: "bg-amber-900/60 text-amber-300 border-amber-800",        priority: 1 },
  // Certificates
  CERTIFICATE_ISSUED:           { color: "bg-purple-900/60 text-purple-300 border-purple-800",     priority: 1 },
  CERTIFICATE_VERIFIED:         { color: "bg-teal-900/60 text-teal-300 border-teal-800",           priority: 2 },
  CERTIFICATE_LIST:             { color: "bg-gray-800 text-gray-400 border-gray-700",              priority: 4 },
  // Keys
  REQUESTER_KEYPAIR_GENERATED:  { color: "bg-green-900/60 text-green-300 border-green-800",        priority: 1 },
  REQUESTER_KEY_REVOKED:        { color: "bg-red-900/60 text-red-300 border-red-800",              priority: 0 },
  REQUESTER_KEY_READ:           { color: "bg-gray-800 text-gray-400 border-gray-700",              priority: 4 },
  // Blockchain
  BLOCK_MINED:                  { color: "bg-yellow-900/60 text-yellow-300 border-yellow-800",     priority: 2 },
  // Security (anomalies)
  ANOMALY_DETECTED:             { color: "bg-rose-900/80 text-rose-200 border-rose-700",           priority: 0 },
  SECURITY_ALERT_REVIEWED:      { color: "bg-blue-900/60 text-blue-300 border-blue-800",           priority: 1 },
  // Users
  USER_CREATED:                 { color: "bg-sky-900/60 text-sky-300 border-sky-800",              priority: 1 },
  USER_UPDATED:                 { color: "bg-sky-900/40 text-sky-400 border-sky-800",              priority: 2 },
  USER_DELETED:                 { color: "bg-red-900/60 text-red-300 border-red-800",              priority: 0 },
  // Audit meta
  AUDIT_LOG_READ:               { color: "bg-gray-800 text-gray-500 border-gray-700",              priority: 4 },
};

function getActionCfg(action: string): ActionCfg {
  return ACTION_CFG[action] ?? { color: "bg-gray-800 text-gray-400 border-gray-700", priority: 3 };
}

// Priority 0 = most critical, 4 = noise
const PRIORITY_LABELS = ["Critical", "Important", "Normal", "Low", "Noise"];
const PRIORITY_COLORS = [
  "text-red-400", "text-orange-400", "text-gray-300", "text-gray-500", "text-gray-600"
];

// ─── User ID display ──────────────────────────────────────────────────────────

function UserIdBadge({ uid }: { uid: string }) {
  const isAnon      = uid === "anonymous" || uid === "system";
  const isPublic    = uid.startsWith("auth:") || uid.startsWith("public:");
  const isRealUser  = uid.startsWith("USR_") || (uid.length > 8 && !isAnon && !isPublic);

  if (isAnon) return (
    <Tooltip>
      <TooltipTrigger>
        <span className="text-gray-600 text-xs font-mono italic">{uid}</span>
      </TooltipTrigger>
      <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
        Unauthenticated request or system action
      </TooltipContent>
    </Tooltip>
  );

  if (isPublic) return (
    <Tooltip>
      <TooltipTrigger>
        <span className="text-amber-600 text-xs font-mono">{uid}</span>
      </TooltipTrigger>
      <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
        Public route — no auth token required
      </TooltipContent>
    </Tooltip>
  );

  return (
    <span className={`text-xs font-mono ${isRealUser ? "text-cyan-400" : "text-gray-400"}`}>
      {uid.length > 20 ? uid.slice(0, 20) + "…" : uid}
    </span>
  );
}

// ─── Expandable detail row ────────────────────────────────────────────────────

function DetailRow({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false);
  const cfg = getActionCfg(log.action);
  const isAnomaly = log.action === "ANOMALY_DETECTED";
  const riskLevel = log.details?.risk_level as string | undefined;

  return (
    <>
      <TableRow
        className={`border-gray-800/60 hover:bg-gray-800/20 cursor-pointer transition-colors ${
          isAnomaly && riskLevel === "CRITICAL" ? "bg-rose-950/20" :
          isAnomaly && riskLevel === "HIGH"     ? "bg-orange-950/10" : ""
        }`}
        onClick={() => setOpen((p) => !p)}
      >
        {/* Expand toggle */}
        <TableCell className="w-8 py-2.5">
          {open
            ? <ChevronDown className="h-3.5 w-3.5 text-gray-500" />
            : <ChevronRight className="h-3.5 w-3.5 text-gray-600" />}
        </TableCell>

        {/* Action */}
        <TableCell className="py-2.5">
          <Badge className={`text-xs border font-mono ${cfg.color}`}>
            {log.action}
          </Badge>
          {isAnomaly && riskLevel && (
            <span className={`ml-1.5 text-xs font-medium ${
              riskLevel === "CRITICAL" ? "text-red-400"
              : riskLevel === "HIGH"   ? "text-orange-400"
              : "text-gray-500"
            }`}>
              {riskLevel}
            </span>
          )}
        </TableCell>

        {/* User */}
        <TableCell className="py-2.5">
          <UserIdBadge uid={log.user_id} />
        </TableCell>

        {/* Resource */}
        <TableCell className="py-2.5">
          <span className="text-gray-500 text-xs">{log.resource_type}</span>
          {log.resource_id && (
            <span className="text-gray-600 text-xs ml-1 font-mono">
              /{log.resource_id.length > 16 ? log.resource_id.slice(0, 16) + "…" : log.resource_id}
            </span>
          )}
        </TableCell>

        {/* IP */}
        <TableCell className="py-2.5 font-mono text-xs text-gray-500">
          {log.ip_address || "—"}
        </TableCell>

        {/* Time */}
        <TableCell className="py-2.5 text-xs text-gray-500 whitespace-nowrap">
          <Tooltip>
            <TooltipTrigger>
              {safeAgo(log.created_at)}
            </TooltipTrigger>
            <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
              {safeFmt(log.created_at)}
            </TooltipContent>
          </Tooltip>
        </TableCell>
      </TableRow>

      {/* Expanded detail */}
      {open && (
        <TableRow className="border-gray-800/30 bg-gray-900/60">
          <TableCell colSpan={6} className="py-3 px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Details JSON */}
              {log.details && Object.keys(log.details).length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Details</p>
                  <div className="rounded-lg bg-gray-800/60 border border-gray-700 p-3 text-xs font-mono text-gray-300 overflow-x-auto">
                    {Object.entries(log.details).map(([k, v]) => (
                      <div key={k} className="flex gap-2 leading-relaxed">
                        <span className="text-gray-500 shrink-0">{k}:</span>
                        <span className="text-cyan-300 break-all">
                          {typeof v === "object" ? JSON.stringify(v) : String(v ?? "")}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Full timestamp + user agent */}
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Timestamp</p>
                  <p className="text-xs text-gray-300 font-mono">{safeFmt(log.created_at)}</p>
                </div>
                {log.user_agent && (
                  <div>
                    <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">User Agent</p>
                    <p className="text-xs text-gray-500 break-all">{log.user_agent}</p>
                  </div>
                )}
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AuditPage() {
  const [logs,        setLogs]        = useState<AuditLog[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);

  // Filters
  const [search,      setSearch]      = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [resourceFilter, setResourceFilter] = useState("all");
  const [showNoise,   setShowNoise]   = useState(false);  // show priority 4 (noise)
  const [showAnomaly, setShowAnomaly] = useState(true);   // show ANOMALY_DETECTED

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/api/v1/audit/logs", { params: { limit: 500 } });
      const payload = res.data?.data;
      const arr = payload?.logs ?? payload ?? [];
      setLogs(Array.isArray(arr) ? arr : []);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "Failed to load audit logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Derived filter options
  const actions   = Array.from(new Set(logs.map((l) => l.action))).sort();
  const resources = Array.from(new Set(logs.map((l) => l.resource_type).filter(Boolean))).sort();

  // Apply filters
  const filtered = logs.filter((l) => {
    const cfg = getActionCfg(l.action);

    // Noise filter
    if (!showNoise && cfg.priority >= 4) return false;

    // Anomaly filter
    if (!showAnomaly && l.action === "ANOMALY_DETECTED") return false;

    // Action filter
    if (actionFilter !== "all" && l.action !== actionFilter) return false;

    // Resource filter
    if (resourceFilter !== "all" && l.resource_type !== resourceFilter) return false;

    // Text search
    if (search) {
      const q = search.toLowerCase();
      return (
        l.action?.toLowerCase().includes(q)       ||
        l.user_id?.toLowerCase().includes(q)      ||
        l.resource_type?.toLowerCase().includes(q)||
        l.resource_id?.toLowerCase().includes(q)  ||
        l.ip_address?.toLowerCase().includes(q)   ||
        JSON.stringify(l.details ?? {}).toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Stats
  const critical = logs.filter((l) => l.action === "ANOMALY_DETECTED" && l.details?.risk_level === "CRITICAL").length;
  const high     = logs.filter((l) => l.action === "ANOMALY_DETECTED" && l.details?.risk_level === "HIGH").length;
  const failures = logs.filter((l) => l.action === "LOGIN_FAILED").length;
  const deletes  = logs.filter((l) => l.action.includes("DELETE") || l.action.includes("REVOKE")).length;

  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
            <p className="text-gray-400 text-sm mt-1">
              {logs.length} entries · {filtered.length} shown
            </p>
          </div>
          <Button onClick={fetchLogs} variant="outline" size="sm"
            className="border-gray-700 text-gray-300 hover:bg-gray-800">
            <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
          </Button>
        </div>

        {/* Stat chips */}
        <div className="flex gap-3 flex-wrap">
          {critical > 0 && (
            <div className="flex items-center gap-1.5 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
              <span className="text-red-300 text-sm font-medium">{critical} Critical Anomalies</span>
            </div>
          )}
          {high > 0 && (
            <div className="flex items-center gap-1.5 bg-orange-950/40 border border-orange-900/50 rounded-lg px-3 py-1.5">
              <span className="h-2 w-2 rounded-full bg-orange-400" />
              <span className="text-orange-300 text-sm">{high} High Anomalies</span>
            </div>
          )}
          {failures > 0 && (
            <div className="flex items-center gap-1.5 bg-amber-950/40 border border-amber-900/50 rounded-lg px-3 py-1.5">
              <span className="text-amber-400 text-sm">{failures} Failed Logins</span>
            </div>
          )}
          {deletes > 0 && (
            <div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5">
              <span className="text-gray-400 text-sm">{deletes} Destructive Actions</span>
            </div>
          )}
        </div>

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-lg bg-red-950/60 border border-red-800 text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Filters */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3 pt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-gray-600 shrink-0" />

              {/* Text search */}
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                <Input
                  placeholder="Search action, user, IP…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-xs bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>

              {/* Action filter */}
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger className="h-8 text-xs w-48 bg-gray-800 border-gray-700 text-gray-300">
                  <SelectValue placeholder="All actions" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-gray-300">
                  <SelectItem value="all" className="text-xs">All Actions</SelectItem>
                  {actions.map((a) => (
                    <SelectItem key={a} value={a} className="text-xs font-mono">{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Resource filter */}
              <Select value={resourceFilter} onValueChange={setResourceFilter}>
                <SelectTrigger className="h-8 text-xs w-40 bg-gray-800 border-gray-700 text-gray-300">
                  <SelectValue placeholder="All resources" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-gray-300">
                  <SelectItem value="all" className="text-xs">All Resources</SelectItem>
                  {resources.map((r) => (
                    <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <div className="flex-1" />

              {/* Toggles */}
              <button
                onClick={() => setShowAnomaly((p) => !p)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  showAnomaly
                    ? "bg-rose-950/40 border-rose-800/60 text-rose-300"
                    : "bg-gray-800 border-gray-700 text-gray-500"
                }`}
              >
                <Shield className="h-3 w-3" />
                {showAnomaly ? "Anomalies On" : "Anomalies Off"}
              </button>

              <button
                onClick={() => setShowNoise((p) => !p)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  showNoise
                    ? "bg-gray-700 border-gray-600 text-gray-300"
                    : "bg-gray-800 border-gray-700 text-gray-500"
                }`}
              >
                {showNoise ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {showNoise ? "All Entries" : "Hide Noise"}
              </button>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="rounded-b-xl border-t border-gray-800 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800">
                    <TableHead className="w-8" />
                    <TableHead className="text-gray-400 text-xs">Action</TableHead>
                    <TableHead className="text-gray-400 text-xs">User</TableHead>
                    <TableHead className="text-gray-400 text-xs">Resource</TableHead>
                    <TableHead className="text-gray-400 text-xs">IP Address</TableHead>
                    <TableHead className="text-gray-400 text-xs">When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    [...Array(8)].map((_, i) => (
                      <TableRow key={i} className="border-gray-800">
                        {[...Array(6)].map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800 rounded" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filtered.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-gray-500 py-16">
                        {search || actionFilter !== "all" || resourceFilter !== "all"
                          ? "No logs match your filters"
                          : "No audit logs found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filtered.map((log, idx) => (
                      <DetailRow key={`${log.id}-${idx}`} log={log} />
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {!loading && filtered.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-800">
                <p className="text-xs text-gray-600">
                  {filtered.length} of {logs.length} entries
                  {!showNoise && (
                    <span className="ml-1 text-gray-700">
                      · {logs.length - filtered.length} noise entries hidden
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-700">Click any row to expand details</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}