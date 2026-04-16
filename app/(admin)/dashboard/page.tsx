"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Users, ShieldCheck, Link as LinkIcon, Building2,
  TrendingUp, Clock, CircleDashed, RefreshCw,
  CheckCircle2, XCircle, AlertTriangle, Activity,
  Database, Cpu, Brain, Server, Blocks,
  FileKey2, UserCheck, UserX, Trash2, Edit3,
  LogIn, RotateCcw, Eye, Hash,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";
import { formatDistanceToNow, format } from "date-fns";
import axios from "axios";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DashboardStats {
  total_customers: number;
  pending_kyc: number;
  verified_kyc: number;
  rejected_kyc: number;
  total_banks: number;
  pending_txs: number;
  total_blocks: number;
}

interface AuditLog {
  id: number;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, unknown>;
  ip_address: string;
  created_at: string; // ISO string
}

type ServiceStatus = "checking" | "online" | "degraded" | "offline";

interface ServiceInfo {
  status: ServiceStatus;
  label: string;
  detail: string;
  latency?: number; // ms
}

interface SystemStatus {
  api:        ServiceInfo;
  blockchain: ServiceInfo;
  database:   ServiceInfo;
  ai_scanner: ServiceInfo;
}

// ─── Action config — icon + colour per audit action ──────────────────────────

const ACTION_CFG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  // KYC
  KYC_CREATED:         { icon: UserCheck,  color: "text-blue-400",    label: "KYC Created"      },
  KYC_VERIFIED:        { icon: ShieldCheck, color: "text-emerald-400", label: "KYC Verified"     },
  KYC_REJECTED:        { icon: UserX,      color: "text-red-400",     label: "KYC Rejected"     },
  KYC_UPDATED:         { icon: Edit3,      color: "text-cyan-400",    label: "KYC Updated"      },
  KYC_DELETED:         { icon: Trash2,     color: "text-gray-400",    label: "KYC Deleted"      },
  KYC_PERIODIC_REVIEW: { icon: RotateCcw,  color: "text-violet-400",  label: "Periodic Review"  },
  // Auth
  PASSWORD_CHANGED:    { icon: UserCheck,  color: "text-amber-400",   label: "Password Changed" },
  USER_CREATED:        { icon: Users,      color: "text-blue-400",    label: "User Created"     },
  USER_UPDATED:        { icon: Edit3,      color: "text-cyan-400",    label: "User Updated"     },
  USER_DELETED:        { icon: Trash2,     color: "text-red-400",     label: "User Deleted"     },
  USER_PASSWORD_RESET: { icon: RotateCcw,  color: "text-amber-400",   label: "Password Reset"   },
  // Certificate
  CERTIFICATE_ISSUED:          { icon: FileKey2,   color: "text-cyan-400",   label: "Certificate Issued" },
  REQUESTER_KEYPAIR_GENERATED: { icon: Hash,       color: "text-violet-400", label: "Key Generated"      },
  REQUESTER_KEY_REVOKED:       { icon: XCircle,    color: "text-red-400",    label: "Key Revoked"        },
  // Blockchain
  BLOCK_MINED: { icon: Blocks, color: "text-emerald-400", label: "Block Mined" },
};

function getActionCfg(action: string) {
  return ACTION_CFG[action] ?? { icon: Activity, color: "text-gray-400", label: action.replace(/_/g, " ") };
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  title, value, icon: Icon, color, loading,
}: {
  title: string; value: number | string;
  icon: React.ElementType; color: string; loading: boolean;
}) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-16 mt-2 bg-gray-800" />
            ) : (
              <p className="text-3xl font-bold text-white mt-1">{value}</p>
            )}
          </div>
          <div className={`p-3 rounded-xl ${color}`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Service status dot + label ───────────────────────────────────────────────

function StatusBadge({ status, detail, latency }: { status: ServiceStatus; detail: string; latency?: number }) {
  const cfg = {
    checking: { dot: "bg-gray-500 animate-pulse", text: "text-gray-400", label: "Checking…" },
    online:   { dot: "bg-emerald-400",            text: "text-emerald-400", label: "Online"   },
    degraded: { dot: "bg-amber-400 animate-pulse", text: "text-amber-400", label: "Degraded" },
    offline:  { dot: "bg-red-400",               text: "text-red-400",    label: "Offline"  },
  }[status];

  return (
    <div className="text-right">
      <span className={`text-sm flex items-center justify-end gap-1.5 ${cfg.text}`}>
        <span className={`w-2 h-2 rounded-full inline-block shrink-0 ${cfg.dot}`} />
        {cfg.label}
        {latency !== undefined && status === "online" && (
          <span className="text-gray-600 text-xs">{latency}ms</span>
        )}
      </span>
      {detail && <p className="text-xs text-gray-600 mt-0.5">{detail}</p>}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [stats,   setStats]   = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  const [logs,       setLogs]       = useState<AuditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);

  const [sysStatus,       setSysStatus]       = useState<SystemStatus>({
    api:        { status: "checking", label: "API Server",    detail: "",          latency: undefined },
    blockchain: { status: "checking", label: "Blockchain",    detail: "",          latency: undefined },
    database:   { status: "checking", label: "Database",      detail: "",          latency: undefined },
    ai_scanner: { status: "checking", label: "AI KYC Scanner", detail: "",         latency: undefined },
  });
  const [statusLoading, setStatusLoading] = useState(true);

  // ── Fetch stats ──────────────────────────────────────────────────────────
  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [kycRes, banksRes, bcRes] = await Promise.all([
        api.get("/api/v1/kyc/stats").catch(() => ({ data: {} })),
        api.get("/api/v1/banks/list").catch(() => ({ data: [] })),
        api.get("/api/v1/blockchain/stats").catch(() => ({ data: {} })),
      ]);

      const kycData   = kycRes.data?.data   || kycRes.data   || {};
      const banksData = banksRes.data?.data || banksRes.data || [];
      const bcData    = bcRes.data?.data    || bcRes.data    || {};

      setStats({
        total_customers: kycData.total    || 0,
        pending_kyc:     kycData.pending  || 0,
        verified_kyc:    kycData.verified || 0,
        rejected_kyc:    kycData.rejected || 0,
        total_banks:     Array.isArray(banksData) ? banksData.length : 0,
        pending_txs:     bcData.pending_txs  || 0,
        total_blocks:    bcData.total_blocks || 0,
      });
    } catch {
      // keep null
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Fetch audit logs (recent activity) ───────────────────────────────────
  // GET /api/v1/audit/logs?limit=10
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await api.get("/api/v1/audit/logs", {
        params: { limit: 10 },
      });
      // Response: { data: { logs: [...], count: N } }
      const data: AuditLog[] = res.data?.data?.logs || res.data?.logs || [];
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  // ── Check system status ───────────────────────────────────────────────────
  const checkStatus = useCallback(async () => {
    setStatusLoading(true);

    const ping = async (
      fn: () => Promise<unknown>
    ): Promise<{ ok: boolean; latency: number; detail: string }> => {
      const t0 = Date.now();
      try {
        const res: any = await fn();
        return { ok: true, latency: Date.now() - t0, detail: "" };
      } catch (err: any) {
        return { ok: false, latency: Date.now() - t0, detail: err?.message ?? "unreachable" };
      }
    };

    // 1. Go /health — gives api + blockchain + database status
    const goHealth = await ping(() => api.get("/health"));
    let goData: any = {};
    try {
      const res: any = await api.get("/health");
      goData = res.data?.data || res.data || {};
    } catch { /* already captured in goHealth */ }

    // 2. Python /health — separate base URL via env var or default
    const pythonBase = process.env.NEXT_PUBLIC_PYTHON_URL ?? "http://localhost:5001";
    const pyHealth = await ping(() =>
      axios.get(`${pythonBase}/health`, { timeout: 5000 })
    );
    let pyData: any = {};
    try {
      const res: any = await axios.get(`${pythonBase}/health`, { timeout: 5000 });
      pyData = res.data || {};
    } catch { /* already captured in pyHealth */ }

    // API Server
    const apiStatus: ServiceInfo = {
      status:  goHealth.ok ? "online" : "offline",
      label:   "API Server",
      detail:  goHealth.ok
        ? `v1.0 · ${goHealth.latency}ms`
        : goHealth.detail,
      latency: goHealth.latency,
    };

    // Blockchain — from Go /health response
    const chainValid  = goData.blockchain === true;
    const chainStatus: ServiceInfo = {
      status:  !goHealth.ok ? "offline"
               : chainValid  ? "online"
               : "degraded",
      label:   "Blockchain",
      detail:  !goHealth.ok ? "Go server offline"
               : chainValid  ? `${goData.total_blocks ?? "—"} blocks · valid`
               : "Chain validation failed",
    };

    // Database — from Go /health response
    const dbOk = goData.database === "healthy";
    const dbStatus: ServiceInfo = {
      status:  !goHealth.ok ? "offline"
               : dbOk        ? "online"
               : "degraded",
      label:   "Database",
      detail:  !goHealth.ok ? "Go server offline"
               : dbOk        ? "PostgreSQL connected"
               : "Unhealthy — check logs",
    };

    // AI Scanner — from Python /health
    const pyOk = pyHealth.ok && pyData.status === "ok";
    const aiStatus: ServiceInfo = {
      status:  pyOk ? "online" : pyHealth.ok ? "degraded" : "offline",
      label:   "AI KYC Scanner",
      detail:  pyOk          ? `${pyData.service ?? "KYC AI"} · ${pyHealth.latency}ms`
               : pyHealth.ok  ? `Running but unhealthy: ${pyData.status ?? "unknown"}`
               : "Python service unreachable",
      latency: pyHealth.latency,
    };

    setSysStatus({
      api:        apiStatus,
      blockchain: chainStatus,
      database:   dbStatus,
      ai_scanner: aiStatus,
    });
    setStatusLoading(false);
  }, []);

  useEffect(() => {
    fetchStats();
    fetchLogs();
    checkStatus();
  }, [fetchStats, fetchLogs, checkStatus]);

  const handleRefresh = () => {
    fetchStats();
    fetchLogs();
    checkStatus();
  };

  // ── Overall system health indicator ──────────────────────────────────────
  const allServices   = Object.values(sysStatus);
  const anyOffline    = allServices.some((s) => s.status === "offline");
  const anyDegraded   = allServices.some((s) => s.status === "degraded");
  const anyChecking   = allServices.some((s) => s.status === "checking");
  const overallHealth = anyChecking  ? "checking"
                      : anyOffline   ? "offline"
                      : anyDegraded  ? "degraded"
                      : "online";

  const overallCfg = {
    checking: { text: "Checking…",    color: "text-gray-400",    bg: "bg-gray-800"            },
    online:   { text: "All Systems Operational", color: "text-emerald-400", bg: "bg-emerald-950/30 border border-emerald-800/40" },
    degraded: { text: "Degraded",     color: "text-amber-400",   bg: "bg-amber-950/30 border border-amber-800/40"  },
    offline:  { text: "Outage Detected", color: "text-red-400",  bg: "bg-red-950/30 border border-red-800/40"      },
  }[overallHealth];

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard</h1>
          <p className="text-gray-400 text-sm mt-1">Overview of the KYC Blockchain system</p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          className="border-gray-700 text-gray-300 hover:text-white"
          disabled={loading || logsLoading || statusLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-1.5 ${(loading || logsLoading || statusLoading) ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* ── Stats grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard title="Total Customers"              value={stats?.total_customers ?? 0} icon={Users}         color="bg-blue-600"   loading={loading} />
        <StatCard title="Pending KYC"                  value={stats?.pending_kyc     ?? 0} icon={Clock}         color="bg-yellow-600" loading={loading} />
        <StatCard title="Verified KYC"                 value={stats?.verified_kyc    ?? 0} icon={ShieldCheck}   color="bg-green-600"  loading={loading} />
        <StatCard title="Rejected KYC"                 value={stats?.rejected_kyc    ?? 0} icon={TrendingUp}    color="bg-red-600"    loading={loading} />
        <StatCard title="Banks"                        value={stats?.total_banks     ?? 0} icon={Building2}     color="bg-purple-600" loading={loading} />
        <StatCard title="Pending Transactions"         value={stats?.pending_txs     ?? 0} icon={CircleDashed}  color="bg-orange-600" loading={loading} />
        <StatCard title="Blockchain Blocks"            value={stats?.total_blocks    ?? 0} icon={LinkIcon}      color="bg-cyan-600"   loading={loading} />
      </div>

      {/* ── Bottom panels ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Recent Activity ── */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-400" />
                Recent Activity
              </CardTitle>
              {!logsLoading && logs.length > 0 && (
                <span className="text-xs text-gray-500">Last 10 events</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-3 px-0">
            {logsLoading ? (
              <div className="space-y-0">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800/60 last:border-0">
                    <Skeleton className="h-8 w-8 rounded-lg bg-gray-800 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-3/4 bg-gray-800 rounded" />
                      <Skeleton className="h-3 w-1/2 bg-gray-800 rounded" />
                    </div>
                    <Skeleton className="h-3 w-16 bg-gray-800 rounded" />
                  </div>
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10">
                <Activity className="h-8 w-8 text-gray-700" />
                <p className="text-gray-500 text-sm">No recent activity</p>
                <p className="text-gray-600 text-xs">Actions like verifying KYC or issuing certificates will appear here</p>
              </div>
            ) : (
              <div>
                {logs.map((log) => {
                  const cfg = getActionCfg(log.action);
                  const Icon = cfg.icon;
                  // Extract useful detail from log.details
                  const detailText = (() => {
                    if (!log.details) return "";
                    const d = log.details;
                    if (d.customer_id)    return `Customer: ${d.customer_id}`;
                    if (d.username)       return `User: ${d.username}`;
                    if (d.certificate_id) return `Cert: ${String(d.certificate_id).slice(0, 16)}…`;
                    if (d.key_name)       return `Key: ${d.key_name}`;
                    return `${log.resource_type} · ${log.resource_id?.slice(0, 12) ?? ""}`;
                  })();

                  const timeAgo = (() => {
                    try {
                      return formatDistanceToNow(new Date(log.created_at), { addSuffix: true });
                    } catch {
                      return "";
                    }
                  })();

                  return (
                    <div
                      key={log.id}
                      className="flex items-start gap-3 px-4 py-3 border-b border-gray-800/60 last:border-0 hover:bg-gray-800/20 transition-colors"
                    >
                      {/* Icon */}
                      <div className={`p-1.5 rounded-lg bg-gray-800 shrink-0 mt-0.5 ${cfg.color}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium leading-snug">{cfg.label}</p>
                        <p className="text-xs text-gray-500 truncate mt-0.5">{detailText}</p>
                        {log.ip_address && (
                          <p className="text-xs text-gray-700 mt-0.5">IP: {log.ip_address}</p>
                        )}
                      </div>
                      {/* Time */}
                      <div className="text-right shrink-0">
                        <p className="text-xs text-gray-500">{timeAgo}</p>
                        <p className="text-xs text-gray-700 mt-0.5 font-mono">
                          {log.user_id?.slice(0, 8)}…
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── System Status ── */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3 border-b border-gray-800">
            <div className="flex items-center justify-between">
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Server className="h-4 w-4 text-cyan-400" />
                System Status
              </CardTitle>
              {!statusLoading && (
                <div className={`text-xs px-2.5 py-1 rounded-full font-medium ${overallCfg.color} ${overallCfg.bg}`}>
                  {overallCfg.text}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 space-y-0">
            {([
              { key: "api",        Icon: Server,   label: "API Server"     },
              { key: "blockchain", Icon: Blocks,   label: "Blockchain Node" },
              { key: "database",   Icon: Database, label: "Database"       },
              { key: "ai_scanner", Icon: Brain,    label: "AI KYC Scanner" },
            ] as { key: keyof SystemStatus; Icon: React.ElementType; label: string }[]).map(({ key, Icon, label }, i, arr) => {
              const svc = sysStatus[key];
              return (
                <div
                  key={key}
                  className={`flex items-center justify-between py-3 ${i < arr.length - 1 ? "border-b border-gray-800" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-1.5 rounded-lg bg-gray-800 ${
                      svc.status === "online"   ? "text-emerald-400"
                      : svc.status === "degraded" ? "text-amber-400"
                      : svc.status === "offline"  ? "text-red-400"
                      : "text-gray-500"
                    }`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <span className="text-gray-300 text-sm">{label}</span>
                  </div>

                  {statusLoading ? (
                    <Skeleton className="h-4 w-20 bg-gray-800 rounded" />
                  ) : (
                    <StatusBadge
                      status={svc.status}
                      detail={svc.detail}
                      latency={svc.latency}
                    />
                  )}
                </div>
              );
            })}

            {/* Blockchain detail row — only when online */}
            {!statusLoading && sysStatus.blockchain.status === "online" && stats && (
              <div className="mt-3 pt-3 border-t border-gray-800 grid grid-cols-3 gap-3">
                {[
                  { label: "Blocks",   value: stats.total_blocks },
                  { label: "Pending",  value: stats.pending_txs  },
                  { label: "Verified", value: stats.verified_kyc },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-gray-800/50 rounded-lg px-3 py-2 text-center">
                    <p className="text-lg font-bold text-white tabular-nums">{value}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Last checked timestamp */}
            {!statusLoading && (
              <p className="text-xs text-gray-700 text-right pt-2">
                Last checked: {format(new Date(), "HH:mm:ss")}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}