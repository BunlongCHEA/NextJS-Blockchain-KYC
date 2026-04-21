"use client";

/**
 * app/(admin)/security/page.tsx — Real-data Security Dashboard
 *
 * Connects to:
 *   GET /api/v1/security/alerts          — anomaly alerts from MonitoringService
 *   POST /api/v1/security/alerts/review  — mark alert reviewed
 *
 * Shows:
 *   - Live alert counts by risk level
 *   - Recent HIGH + CRITICAL events feed (replaces hardcoded static list)
 *   - Password policy display (static, editable in future)
 *   - Quick actions (wired placeholders — expand as your API grows)
 */

import { useEffect, useState, useCallback } from "react";
import {
  Shield, Lock, RefreshCw, AlertTriangle, CheckCircle2,
  Clock, User, Globe, Loader2, Eye, Activity,
  ShieldAlert, ShieldOff, Info, Zap,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { formatDistanceToNow, format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface SecurityAlert {
  id:           string;
  user_id:      string;
  type:         string;
  risk_level:   RiskLevel;
  description:  string;
  details:      Record<string, any>;
  ip_address:   string;
  timestamp:    string;  // RFC3339 from monitoring service
  is_reviewed:  boolean;
  reviewed_by?: string;
  action_taken?: string;
}

interface AlertSummary {
  total:    number;
  low:      number;
  medium:   number;
  high:     number;
  critical: number;
}

// ─── Safe date helpers ────────────────────────────────────────────────────────

function safeAgo(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (isNaN(d.getTime()) || d.getFullYear() < 2000) return "—";
    return formatDistanceToNow(d, { addSuffix: true });
  } catch { return "—"; }
}
function safeFmt(v: string | null | undefined): string {
  if (!v) return "—";
  try {
    const d = new Date(v);
    if (isNaN(d.getTime())) return "—";
    return format(d, "MMM d, HH:mm");
  } catch { return "—"; }
}

// ─── Risk level config ────────────────────────────────────────────────────────

const RISK_CFG: Record<RiskLevel, { color: string; dot: string; bg: string; border: string }> = {
  CRITICAL: { color: "text-red-400",    dot: "bg-red-400 animate-pulse", bg: "bg-red-950/30",    border: "border-red-900/50"    },
  HIGH:     { color: "text-orange-400", dot: "bg-orange-400",            bg: "bg-orange-950/20", border: "border-orange-900/40" },
  MEDIUM:   { color: "text-amber-400",  dot: "bg-amber-400",             bg: "bg-amber-950/10",  border: "border-amber-900/30"  },
  LOW:      { color: "text-blue-400",   dot: "bg-blue-400",              bg: "bg-gray-800/40",   border: "border-gray-700"      },
};

// ─── Alert type → readable label ─────────────────────────────────────────────

const ALERT_TYPE_LABELS: Record<string, string> = {
  HIGH_FREQUENCY_ACCESS:   "High Frequency Access",
  UNUSUAL_ACCESS_TIME:     "Unusual Access Time",
  MULTIPLE_FAILED_AUTH:    "Multiple Failed Logins",
  BULK_DATA_ACCESS:        "Bulk Data Access",
  SUSPICIOUS_PATTERN:      "Suspicious Activity Pattern",
  GEO_LOCATION_CHANGE:     "Multiple IP Addresses",
  UNAUTHORIZED_ACCESS:     "Unauthorized Access Attempt",
};

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label, value, color, loading, pulse
}: { label: string; value: number; color: string; loading: boolean; pulse?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${
      pulse && value > 0 ? "border-red-900/60 bg-red-950/20" : "border-gray-800 bg-gray-900"
    }`}>
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      {loading
        ? <Skeleton className="h-7 w-10 bg-gray-800" />
        : <p className={`text-2xl font-bold tabular-nums ${color}`}>{value}</p>}
    </div>
  );
}

// ─── Alert row ────────────────────────────────────────────────────────────────

function AlertRow({
  alert, onReview
}: { alert: SecurityAlert; onReview: (a: SecurityAlert) => void }) {
  const cfg = RISK_CFG[alert.risk_level] ?? RISK_CFG.LOW;
  return (
    <div className={`flex items-start gap-3 px-4 py-3 border-b border-gray-800/50 last:border-0 ${
      alert.is_reviewed ? "opacity-40" : ""
    } ${cfg.bg}`}>
      <div className={`h-2 w-2 rounded-full mt-1.5 shrink-0 ${cfg.dot}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs font-semibold ${cfg.color}`}>{alert.risk_level}</span>
          <span className="text-xs text-gray-400">
            {ALERT_TYPE_LABELS[alert.type] ?? alert.type}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{alert.description}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-xs text-gray-600 font-mono">{alert.user_id?.slice(0,16)}</span>
          {alert.ip_address && (
            <span className="flex items-center gap-1 text-xs text-gray-600">
              <Globe className="h-2.5 w-2.5" />{alert.ip_address}
            </span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs text-gray-600">{safeAgo(alert.timestamp)}</p>
        {!alert.is_reviewed && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 text-xs text-gray-500 hover:text-white mt-1 px-2"
            onClick={() => onReview(alert)}
          >
            Review
          </Button>
        )}
        {alert.is_reviewed && (
          <span className="text-xs text-emerald-600">✓ reviewed</span>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SecurityPage() {
  const [alerts,   setAlerts]   = useState<SecurityAlert[]>([]);
  const [summary,  setSummary]  = useState<AlertSummary>({ total: 0, low: 0, medium: 0, high: 0, critical: 0 });
  const [loading,  setLoading]  = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/security/alerts");
      const data = res.data?.data;
      setAlerts(Array.isArray(data?.alerts) ? data.alerts : []);
      if (data?.summary) setSummary(data.summary);
    } catch { setAlerts([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  const handleReview = async (alert: SecurityAlert) => {
    setReviewing(alert.id);
    try {
      await api.post("/api/v1/security/alerts/review", {
        alert_id: alert.id,
        action:   "acknowledged",
      });
      setAlerts((prev) => prev.map((a) =>
        a.id === alert.id ? { ...a, is_reviewed: true } : a
      ));
    } catch { /* toast in real app */ }
    finally { setReviewing(null); }
  };

  // Sort by risk priority: CRITICAL first
  const riskOrder: Record<RiskLevel, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  const sortedAlerts = [...alerts].sort((a, b) =>
    (riskOrder[a.risk_level] ?? 3) - (riskOrder[b.risk_level] ?? 3)
  );
  const unreviewedAlerts = sortedAlerts.filter((a) => !a.is_reviewed);
  const recentAlerts     = sortedAlerts.slice(0, 20);

  // Derived stats
  const failedLogins = alerts.filter((a) => a.type === "MULTIPLE_FAILED_AUTH").length;

  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-400" />Security
            </h1>
            <p className="text-gray-400 text-sm mt-1">Live anomaly alerts and system security status</p>
          </div>
          <Button onClick={fetchAlerts} variant="outline" size="sm"
            className="border-gray-700 text-gray-300 hover:bg-gray-800">
            <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
          </Button>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatCard label="Total Alerts"  value={summary.total}    color="text-white"        loading={loading} />
          <StatCard label="Critical"      value={summary.critical} color="text-red-400"      loading={loading} pulse />
          <StatCard label="High"          value={summary.high}     color="text-orange-400"   loading={loading} />
          <StatCard label="Medium"        value={summary.medium}   color="text-amber-400"    loading={loading} />
          <StatCard label="Low"           value={summary.low}      color="text-blue-400"     loading={loading} />
        </div>

        {/* Critical/High banner */}
        {!loading && (summary.critical + summary.high) > 0 && (
          <div className="flex items-center gap-3 bg-red-950/30 border border-red-900/50 rounded-xl px-4 py-3">
            <ShieldAlert className="h-5 w-5 text-red-400 shrink-0" />
            <div className="flex-1">
              <p className="text-sm text-red-300 font-medium">
                {summary.critical + summary.high} unresolved high-priority alerts require attention
              </p>
              <p className="text-xs text-red-500 mt-0.5">
                Review these in the Alerts page or use the quick-review buttons below
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="border-red-800 text-red-300 hover:bg-red-950 text-xs shrink-0"
              onClick={() => window.location.href = "/alerts"}
            >
              View Alerts →
            </Button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Recent Security Events (left, 2/3 width) ── */}
          <div className="lg:col-span-2 space-y-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2 pt-4 px-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4 text-rose-400" />
                    Recent Security Events
                    {unreviewedAlerts.length > 0 && (
                      <span className="text-xs bg-red-900/50 border border-red-800 text-red-300 px-1.5 py-0.5 rounded-full">
                        {unreviewedAlerts.length} unreviewed
                      </span>
                    )}
                  </CardTitle>
                  <span className="text-xs text-gray-600">
                    {recentAlerts.length} of {alerts.length}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="p-4 space-y-3">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full bg-gray-800 rounded-lg" />
                    ))}
                  </div>
                ) : recentAlerts.length === 0 ? (
                  <div className="py-12 text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto mb-2 opacity-60" />
                    <p className="text-gray-500 text-sm">No security events detected</p>
                  </div>
                ) : (
                  <div>
                    {recentAlerts.map((alert) => (
                      <AlertRow
                        key={alert.id}
                        alert={alert}
                        onReview={handleReview}
                      />
                    ))}
                  </div>
                )}
                {!loading && alerts.length > 20 && (
                  <div className="px-4 py-2.5 border-t border-gray-800 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs text-gray-500 hover:text-gray-300"
                      onClick={() => window.location.href = "/alerts"}
                    >
                      View all {alerts.length} alerts in Alerts page
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── Right panel ── */}
          <div className="space-y-4">

            {/* Security Status */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-400" />System Status
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2.5">
                {[
                  { label: "JWT Auth",           status: "Active",      ok: true  },
                  { label: "TLS/HTTPS",          status: "Active",      ok: true  },
                  { label: "Rate Limiting",       status: "100 req/min", ok: true  },
                  { label: "Audit Logging",       status: "Enabled",     ok: true  },
                  { label: "Anomaly Detection",   status: "Running",     ok: true  },
                  { label: "Failed Logins (all)", status: String(failedLogins), ok: failedLogins === 0 },
                  { label: "Unreviewed Alerts",   status: String(unreviewedAlerts.length), ok: unreviewedAlerts.length === 0 },
                ].map((item) => (
                  <div key={item.label} className="flex items-center justify-between py-0.5">
                    <span className="text-gray-400 text-xs">{item.label}</span>
                    <Badge className={
                      item.ok
                        ? "bg-emerald-900/40 border border-emerald-800/50 text-emerald-400 text-xs"
                        : "bg-red-900/40 border border-red-800/50 text-red-400 text-xs"
                    }>
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Password Policy */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Lock className="h-4 w-4 text-amber-400" />Password Policy
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <div className="space-y-1.5 text-xs text-gray-400">
                  {[
                    "Minimum 15 characters",
                    "At least 1 uppercase letter",
                    "At least 1 number",
                    "At least 1 special character",
                  ].map((rule) => (
                    <div key={rule} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                      {rule}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Zap className="h-4 w-4 text-yellow-400" />Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start border-gray-700 text-gray-300 hover:bg-gray-800 text-xs"
                      onClick={() => window.location.href = "/alerts"}
                    >
                      <Eye className="h-3.5 w-3.5 mr-2" />
                      Review All Alerts
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
                    Opens full alerts management page
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start border-gray-700 text-gray-300 hover:bg-gray-800 text-xs"
                      onClick={() => window.location.href = "/audit"}
                    >
                      <Activity className="h-3.5 w-3.5 mr-2" />
                      View Audit Logs
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
                    Opens full audit log viewer
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="w-full justify-start border-gray-700 text-gray-500 text-xs"
                    >
                      <ShieldOff className="h-3.5 w-3.5 mr-2 opacity-40" />
                      Force Password Reset (all)
                      <span className="ml-auto text-gray-700 text-xs">API TBD</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
                    Requires POST /api/v1/users/reset-all — not yet implemented
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="w-full justify-start border-red-900/40 text-red-500/60 text-xs"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 mr-2 opacity-40" />
                      Emergency Lock
                      <span className="ml-auto text-gray-700 text-xs">API TBD</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
                    Requires a dedicated lockdown endpoint — not yet implemented
                  </TooltipContent>
                </Tooltip>

                <div className="flex items-start gap-2 mt-2 p-2.5 rounded-lg bg-gray-800/50 border border-gray-700">
                  <Info className="h-3.5 w-3.5 text-gray-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-gray-600">
                    Disabled actions need additional Go API endpoints.
                    Check the routes file to add them.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}