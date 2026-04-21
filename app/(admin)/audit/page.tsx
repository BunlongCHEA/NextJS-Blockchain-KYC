"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  RefreshCw, Search, AlertCircle, ChevronDown, ChevronRight,
  Shield, Eye, EyeOff, Filter, Download, Settings2,
  FileText, FileSpreadsheet, Hash, Radio,
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
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import api from "@/lib/api";
import { format, formatDistanceToNow, parseISO } from "date-fns";

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
  created_at:    string; // ISO timestamp from DB TIMESTAMP column
}

// ─── Safe date helpers ────────────────────────────────────────────────────────

function safeDate(v: string | number | null | undefined): Date | null {
  if (!v) return null;
  try {
    const d = typeof v === "number" ? new Date(v * 1000) : new Date(v);
    if (isNaN(d.getTime()) || d.getFullYear() < 2000) return null;
    return d;
  } catch { return null; }
}

// Show the actual timestamp from DB (created_at), not relative time
function safeTs(v: string | number | null | undefined): string {
  const d = safeDate(v);
  if (!d) return "—";
  try { return format(d, "yyyy-MM-dd HH:mm:ss"); } catch { return "—"; }
}

function safeAgo(v: string | number | null | undefined): string {
  const d = safeDate(v);
  if (!d) return "—";
  try { return formatDistanceToNow(d, { addSuffix: true }); } catch { return "—"; }
}

// ─── Action config ────────────────────────────────────────────────────────────

interface ActionCfg { color: string; priority: number }
const ACTION_CFG: Record<string, ActionCfg> = {
  LOGIN:                        { color: "bg-emerald-900/60 text-emerald-300 border-emerald-800",  priority: 1 },
  LOGIN_FAILED:                 { color: "bg-red-900/60 text-red-300 border-red-800",              priority: 0 },
  LOGOUT:                       { color: "bg-gray-800 text-gray-400 border-gray-700",              priority: 3 },
  REGISTER:                     { color: "bg-blue-900/60 text-blue-300 border-blue-800",           priority: 1 },
  PASSWORD_CHANGED:             { color: "bg-cyan-900/60 text-cyan-300 border-cyan-800",           priority: 1 },
  USER_PASSWORD_RESET:          { color: "bg-orange-900/60 text-orange-300 border-orange-800",     priority: 1 },
  KYC_CREATED:                  { color: "bg-violet-900/60 text-violet-300 border-violet-800",     priority: 2 },
  KYC_VERIFIED:                 { color: "bg-emerald-900/60 text-emerald-300 border-emerald-800",  priority: 1 },
  KYC_REJECTED:                 { color: "bg-red-900/60 text-red-300 border-red-800",              priority: 1 },
  KYC_DELETED:                  { color: "bg-red-900/80 text-red-200 border-red-700",              priority: 0 },
  KYC_AI_SCAN:                  { color: "bg-indigo-900/60 text-indigo-300 border-indigo-800",     priority: 2 },
  KYC_READ:                     { color: "bg-gray-800 text-gray-400 border-gray-700",              priority: 3 },
  KYC_LIST:                     { color: "bg-gray-800 text-gray-400 border-gray-700",              priority: 4 },
  KYC_PERIODIC_REVIEW:          { color: "bg-amber-900/60 text-amber-300 border-amber-800",        priority: 1 },
  CERTIFICATE_ISSUED:           { color: "bg-purple-900/60 text-purple-300 border-purple-800",     priority: 1 },
  CERTIFICATE_VERIFIED:         { color: "bg-teal-900/60 text-teal-300 border-teal-800",           priority: 2 },
  CERTIFICATE_LIST:             { color: "bg-gray-800 text-gray-400 border-gray-700",              priority: 4 },
  REQUESTER_KEYPAIR_GENERATED:  { color: "bg-green-900/60 text-green-300 border-green-800",        priority: 1 },
  REQUESTER_KEY_REVOKED:        { color: "bg-red-900/60 text-red-300 border-red-800",              priority: 0 },
  REQUESTER_KEY_READ:           { color: "bg-gray-800 text-gray-400 border-gray-700",              priority: 4 },
  BLOCK_MINED:                  { color: "bg-yellow-900/60 text-yellow-300 border-yellow-800",     priority: 2 },
  ANOMALY_DETECTED:             { color: "bg-rose-900/80 text-rose-200 border-rose-700",           priority: 0 },
  SECURITY_ALERT_REVIEWED:      { color: "bg-blue-900/60 text-blue-300 border-blue-800",           priority: 1 },
  USER_CREATED:                 { color: "bg-sky-900/60 text-sky-300 border-sky-800",              priority: 1 },
  USER_UPDATED:                 { color: "bg-sky-900/40 text-sky-400 border-sky-800",              priority: 2 },
  USER_DELETED:                 { color: "bg-red-900/60 text-red-300 border-red-800",              priority: 0 },
  AUDIT_LOG_READ:               { color: "bg-gray-800 text-gray-500 border-gray-700",              priority: 4 },
};
function getActionCfg(action: string): ActionCfg {
  return ACTION_CFG[action] ?? { color: "bg-gray-800 text-gray-400 border-gray-700", priority: 3 };
}

// ─── Syslog config (persisted to localStorage) ───────────────────────────────

interface SyslogConfig {
  enabled:  boolean;
  protocol: "UDP" | "TCP";
  host:     string;
  port:     string;
  facility: string;
}
const SYSLOG_KEY = "kyc_syslog_config";
function loadSyslogConfig(): SyslogConfig {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(SYSLOG_KEY) : null;
    if (raw) return { ...defaultSyslog(), ...JSON.parse(raw) };
  } catch {}
  return defaultSyslog();
}
function defaultSyslog(): SyslogConfig {
  return { enabled: false, protocol: "UDP", host: "", port: "514", facility: "local0" };
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function exportCSV(rows: AuditLog[]) {
  const headers = ["ID","Action","User","Resource Type","Resource ID","IP Address","Timestamp","Details"];
  const lines = [
    headers.join(","),
    ...rows.map((l) => [
      l.id,
      `"${l.action}"`,
      `"${l.user_id}"`,
      `"${l.resource_type}"`,
      `"${l.resource_id}"`,
      `"${l.ip_address}"`,
      `"${safeTs(l.created_at)}"`,
      `"${JSON.stringify(l.details ?? {}).replace(/"/g,'""')}"`,
    ].join(","))
  ];
  download(lines.join("\n"), "audit-logs.csv", "text/csv");
}

function exportTXT(rows: AuditLog[]) {
  const lines = rows.map((l) =>
    `[${safeTs(l.created_at)}] [${l.action}] user=${l.user_id} resource=${l.resource_type}/${l.resource_id} ip=${l.ip_address}`
  );
  download(lines.join("\n"), "audit-logs.txt", "text/plain");
}

function exportExcel(rows: AuditLog[]) {
  // TSV works as a basic Excel-compatible format
  const headers = ["ID","Action","User","Resource Type","Resource ID","IP Address","Timestamp"];
  const lines = [
    headers.join("\t"),
    ...rows.map((l) => [l.id, l.action, l.user_id, l.resource_type, l.resource_id, l.ip_address, safeTs(l.created_at)].join("\t"))
  ];
  download(lines.join("\n"), "audit-logs.xls", "application/vnd.ms-excel");
}

function download(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── UserIdBadge ──────────────────────────────────────────────────────────────

function UserIdBadge({ uid }: { uid: string }) {
  const isAnon   = uid === "anonymous" || uid === "system";
  const isPublic = uid.startsWith("auth:") || uid.startsWith("public:");
  if (isAnon)   return <Tooltip><TooltipTrigger><span className="text-gray-600 text-xs font-mono italic">{uid}</span></TooltipTrigger><TooltipContent className="bg-gray-800 border-gray-700 text-xs">Unauthenticated or system action</TooltipContent></Tooltip>;
  if (isPublic) return <Tooltip><TooltipTrigger><span className="text-amber-600 text-xs font-mono">{uid}</span></TooltipTrigger><TooltipContent className="bg-gray-800 border-gray-700 text-xs">Public route — no auth required</TooltipContent></Tooltip>;
  return <span className="text-xs font-mono text-cyan-400">{uid.length > 18 ? uid.slice(0,18)+"…" : uid}</span>;
}

// ─── DetailRow ────────────────────────────────────────────────────────────────

function DetailRow({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false);
  const cfg        = getActionCfg(log.action);
  const isAnomaly  = log.action === "ANOMALY_DETECTED";
  const riskLevel  = log.details?.risk_level as string | undefined;

  return (
    <>
      <TableRow
        className={`border-gray-800/60 hover:bg-gray-800/20 cursor-pointer ${
          isAnomaly && riskLevel === "CRITICAL" ? "bg-rose-950/20"
          : isAnomaly && riskLevel === "HIGH"   ? "bg-orange-950/10" : ""
        }`}
        onClick={() => setOpen(p => !p)}
      >
        <TableCell className="w-6 py-2">
          {open ? <ChevronDown className="h-3 w-3 text-gray-500"/> : <ChevronRight className="h-3 w-3 text-gray-600"/>}
        </TableCell>
        <TableCell className="py-2">
          <Badge className={`text-xs border font-mono ${cfg.color}`}>{log.action}</Badge>
          {isAnomaly && riskLevel && (
            <span className={`ml-1.5 text-xs font-medium ${riskLevel==="CRITICAL"?"text-red-400":riskLevel==="HIGH"?"text-orange-400":"text-gray-500"}`}>
              {riskLevel}
            </span>
          )}
        </TableCell>
        <TableCell className="py-2"><UserIdBadge uid={log.user_id}/></TableCell>
        <TableCell className="py-2">
          <span className="text-gray-500 text-xs">{log.resource_type}</span>
          {log.resource_id && <span className="text-gray-600 text-xs ml-1 font-mono">/{log.resource_id.slice(0,14)}{log.resource_id.length>14?"…":""}</span>}
        </TableCell>
        <TableCell className="py-2 font-mono text-xs text-gray-500">{log.ip_address||"—"}</TableCell>
        {/* ── TIMESTAMP: show actual created_at from DB, not relative ── */}
        <TableCell className="py-2 text-xs text-gray-500 whitespace-nowrap font-mono">
          <Tooltip>
            <TooltipTrigger className="cursor-default">{safeTs(log.created_at)}</TooltipTrigger>
            <TooltipContent className="bg-gray-800 border-gray-700 text-xs">{safeAgo(log.created_at)}</TooltipContent>
          </Tooltip>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow className="border-gray-800/30 bg-gray-900/60">
          <TableCell colSpan={6} className="py-3 px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {log.details && Object.keys(log.details).length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-1.5 font-medium uppercase tracking-wide">Details</p>
                  <div className="rounded-lg bg-gray-800/60 border border-gray-700 p-3 text-xs font-mono overflow-x-auto">
                    {Object.entries(log.details).map(([k,v]) => (
                      <div key={k} className="flex gap-2 leading-relaxed">
                        <span className="text-gray-500 shrink-0">{k}:</span>
                        <span className="text-cyan-300 break-all">{typeof v==="object"?JSON.stringify(v):String(v??"")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-gray-500 mb-1 font-medium uppercase tracking-wide">Timestamp (DB created_at)</p>
                  <p className="text-xs text-gray-300 font-mono">{safeTs(log.created_at)}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{safeAgo(log.created_at)}</p>
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

// ─── Syslog Config Dialog ─────────────────────────────────────────────────────

function SyslogDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cfg, setCfg] = useState<SyslogConfig>(defaultSyslog);
  useEffect(() => { if (open) setCfg(loadSyslogConfig()); }, [open]);

  const save = () => {
    localStorage.setItem(SYSLOG_KEY, JSON.stringify(cfg));
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Radio className="h-4 w-4 text-cyan-400"/>Syslog Export Config
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <div className="flex items-center justify-between rounded-lg border border-gray-800 px-3 py-2.5">
            <span className="text-sm text-gray-300">Enable Syslog forwarding</span>
            <button
              onClick={() => setCfg(p => ({...p, enabled: !p.enabled}))}
              className={`text-xs px-3 py-1 rounded-lg border ${cfg.enabled?"bg-cyan-900/40 border-cyan-700 text-cyan-300":"bg-gray-800 border-gray-700 text-gray-500"}`}
            >{cfg.enabled ? "On" : "Off"}</button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs">Protocol</Label>
              <Select value={cfg.protocol} onValueChange={v => setCfg(p=>({...p,protocol:v as "UDP"|"TCP"}))}>
                <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-700 text-gray-300">
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="UDP" className="text-xs">UDP</SelectItem>
                  <SelectItem value="TCP" className="text-xs">TCP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs">Port</Label>
              <Input value={cfg.port} onChange={e=>setCfg(p=>({...p,port:e.target.value}))} placeholder="514" className="h-8 text-xs bg-gray-800 border-gray-700 text-white"/>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-gray-400 text-xs">Syslog Server IP / Hostname</Label>
            <Input value={cfg.host} onChange={e=>setCfg(p=>({...p,host:e.target.value}))} placeholder="192.168.1.100" className="h-8 text-xs bg-gray-800 border-gray-700 text-white"/>
          </div>
          <div className="space-y-1">
            <Label className="text-gray-400 text-xs">Facility</Label>
            <Select value={cfg.facility} onValueChange={v=>setCfg(p=>({...p,facility:v}))}>
              <SelectTrigger className="h-8 text-xs bg-gray-800 border-gray-700 text-gray-300"><SelectValue/></SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                {["local0","local1","local2","local3","local4","local5","local6","local7","auth","daemon","kern"].map(f=>(
                  <SelectItem key={f} value={f} className="text-xs">{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-gray-600">
            Config saved to browser localStorage. Your Go backend can read these settings via the admin API if you wire a config endpoint.
          </p>
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={onClose} className="border-gray-700 text-gray-300 text-xs">Cancel</Button>
            <Button size="sm" onClick={save} className="bg-cyan-700 hover:bg-cyan-600 text-white text-xs">Save</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const PAGE_SIZES = [50, 100, 200] as const;
type PageSize = typeof PAGE_SIZES[number];

export default function AuditPage() {
  // All 1000 rows fetched once
  const [allLogs,       setAllLogs]       = useState<AuditLog[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);

  // Filters
  const [search,        setSearch]        = useState("");
  const [actionFilter,  setActionFilter]  = useState("all");
  const [resourceFilter,setResourceFilter]= useState("all");
  const [showNoise,     setShowNoise]     = useState(false);
  const [showAnomaly,   setShowAnomaly]   = useState(true);
  const [dateFrom,      setDateFrom]      = useState("");
  const [dateTo,        setDateTo]        = useState("");

  // Pagination
  const [pageSize,      setPageSize]      = useState<PageSize>(100);
  const [page,          setPage]          = useState(1);

  // Dialogs
  const [syslogOpen,    setSyslogOpen]    = useState(false);

  const fetchLogs = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      // Always fetch max 1000 — pagination is client-side
      const res = await api.get("/api/v1/audit/logs", { params: { limit: 1000 } });
      const payload = res.data?.data;
      const arr = payload?.logs ?? payload ?? [];
      setAllLogs(Array.isArray(arr) ? arr : []);
      setPage(1);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.message ?? "Failed to load audit logs");
      setAllLogs([]);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  // Filter options (derived from full dataset)
  const actions   = Array.from(new Set(allLogs.map(l => l.action))).sort();
  const resources = Array.from(new Set(allLogs.map(l => l.resource_type).filter(Boolean))).sort();

  // Apply all filters
  const filtered = allLogs.filter(l => {
    const cfg = getActionCfg(l.action);
    if (!showNoise   && cfg.priority >= 4) return false;
    if (!showAnomaly && l.action === "ANOMALY_DETECTED") return false;
    if (actionFilter   !== "all" && l.action         !== actionFilter)   return false;
    if (resourceFilter !== "all" && l.resource_type  !== resourceFilter) return false;
    // Date range (created_at is ISO string from DB)
    if (dateFrom) {
      const d = safeDate(l.created_at);
      if (!d || d < new Date(dateFrom)) return false;
    }
    if (dateTo) {
      const d = safeDate(l.created_at);
      if (!d || d > new Date(dateTo + "T23:59:59")) return false;
    }
    if (search) {
      const q = search.toLowerCase();
      return (
        l.action?.toLowerCase().includes(q)        ||
        l.user_id?.toLowerCase().includes(q)       ||
        l.resource_type?.toLowerCase().includes(q) ||
        l.resource_id?.toLowerCase().includes(q)   ||
        l.ip_address?.toLowerCase().includes(q)    ||
        JSON.stringify(l.details ?? {}).toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paginated  = filtered.slice((page - 1) * pageSize, page * pageSize);

  const resetPage = () => setPage(1);

  // Stats
  const critical = allLogs.filter(l => l.action==="ANOMALY_DETECTED" && l.details?.risk_level==="CRITICAL").length;
  const high     = allLogs.filter(l => l.action==="ANOMALY_DETECTED" && l.details?.risk_level==="HIGH").length;
  const failures = allLogs.filter(l => l.action==="LOGIN_FAILED").length;
  const deletes  = allLogs.filter(l => l.action.includes("DELETE")||l.action.includes("REVOKE")).length;

  return (
    <TooltipProvider>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
            <p className="text-gray-400 text-sm mt-1">
              {allLogs.length.toLocaleString()} loaded · {filtered.length.toLocaleString()} matched · {paginated.length} shown
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setSyslogOpen(true)} variant="outline" size="sm" className="border-gray-700 text-gray-400 hover:text-gray-200 text-xs">
              <Radio className="h-3.5 w-3.5 mr-1.5"/>Syslog
            </Button>
            <Button onClick={fetchLogs} variant="outline" size="sm" className="border-gray-700 text-gray-300">
              <RefreshCw className="h-4 w-4 mr-1.5"/>Refresh
            </Button>
          </div>
        </div>

        {/* Alert chips */}
        <div className="flex gap-2 flex-wrap">
          {critical>0&&<div className="flex items-center gap-1.5 bg-red-950/40 border border-red-900/50 rounded-lg px-3 py-1.5"><span className="h-2 w-2 rounded-full bg-red-400 animate-pulse"/><span className="text-red-300 text-sm font-medium">{critical} Critical</span></div>}
          {high>0&&<div className="flex items-center gap-1.5 bg-orange-950/40 border border-orange-900/50 rounded-lg px-3 py-1.5"><span className="h-2 w-2 rounded-full bg-orange-400"/><span className="text-orange-300 text-sm">{high} High</span></div>}
          {failures>0&&<div className="flex items-center gap-1.5 bg-amber-950/40 border border-amber-900/50 rounded-lg px-3 py-1.5"><span className="text-amber-400 text-sm">{failures} Failed Logins</span></div>}
          {deletes>0&&<div className="flex items-center gap-1.5 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5"><span className="text-gray-400 text-sm">{deletes} Destructive Actions</span></div>}
        </div>

        {error && <div className="flex items-center gap-2 p-4 rounded-lg bg-red-950/60 border border-red-800 text-red-300"><AlertCircle className="h-4 w-4 shrink-0"/><span className="text-sm">{error}</span></div>}

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-gray-600 shrink-0"/>

              {/* Search */}
              <div className="relative min-w-[160px] flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500"/>
                <Input value={search} onChange={e=>{setSearch(e.target.value);resetPage();}} placeholder="Search…"
                  className="pl-8 h-8 text-xs bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"/>
              </div>

              {/* Action */}
              <Select value={actionFilter} onValueChange={v=>{setActionFilter(v);resetPage();}}>
                <SelectTrigger className="h-8 text-xs w-44 bg-gray-800 border-gray-700 text-gray-300"><SelectValue placeholder="All actions"/></SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-gray-300 max-h-64 overflow-y-auto">
                  <SelectItem value="all" className="text-xs">All Actions</SelectItem>
                  {actions.map(a=><SelectItem key={a} value={a} className="text-xs font-mono">{a}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Resource */}
              <Select value={resourceFilter} onValueChange={v=>{setResourceFilter(v);resetPage();}}>
                <SelectTrigger className="h-8 text-xs w-36 bg-gray-800 border-gray-700 text-gray-300"><SelectValue placeholder="All resources"/></SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-gray-300">
                  <SelectItem value="all" className="text-xs">All Resources</SelectItem>
                  {resources.map(r=><SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
                </SelectContent>
              </Select>

              {/* Date range */}
              <Input type="date" value={dateFrom} onChange={e=>{setDateFrom(e.target.value);resetPage();}}
                className="h-8 text-xs bg-gray-800 border-gray-700 text-gray-300 w-36"/>
              <span className="text-gray-600 text-xs">to</span>
              <Input type="date" value={dateTo} onChange={e=>{setDateTo(e.target.value);resetPage();}}
                className="h-8 text-xs bg-gray-800 border-gray-700 text-gray-300 w-36"/>

              <div className="flex-1"/>

              {/* Toggles */}
              <button onClick={()=>{setShowAnomaly(p=>!p);resetPage();}}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${showAnomaly?"bg-rose-950/40 border-rose-800/60 text-rose-300":"bg-gray-800 border-gray-700 text-gray-500"}`}>
                <Shield className="h-3 w-3"/>{showAnomaly?"Anomalies On":"Anomalies Off"}
              </button>
              <button onClick={()=>{setShowNoise(p=>!p);resetPage();}}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${showNoise?"bg-gray-700 border-gray-600 text-gray-300":"bg-gray-800 border-gray-700 text-gray-500"}`}>
                {showNoise?<Eye className="h-3 w-3"/>:<EyeOff className="h-3 w-3"/>}
                {showNoise?"All Entries":"Hide Noise"}
              </button>

              {/* Export */}
              <div className="flex gap-1">
                <Tooltip><TooltipTrigger asChild>
                  <Button onClick={()=>exportCSV(filtered)} variant="outline" size="sm" className="h-8 border-gray-700 text-gray-400 hover:text-white text-xs px-2">
                    <FileText className="h-3.5 w-3.5"/>
                  </Button>
                </TooltipTrigger><TooltipContent className="bg-gray-800 border-gray-700 text-xs">Export CSV</TooltipContent></Tooltip>

                <Tooltip><TooltipTrigger asChild>
                  <Button onClick={()=>exportExcel(filtered)} variant="outline" size="sm" className="h-8 border-gray-700 text-gray-400 hover:text-white text-xs px-2">
                    <FileSpreadsheet className="h-3.5 w-3.5"/>
                  </Button>
                </TooltipTrigger><TooltipContent className="bg-gray-800 border-gray-700 text-xs">Export Excel</TooltipContent></Tooltip>

                <Tooltip><TooltipTrigger asChild>
                  <Button onClick={()=>exportTXT(filtered)} variant="outline" size="sm" className="h-8 border-gray-700 text-gray-400 hover:text-white text-xs px-2">
                    <Hash className="h-3.5 w-3.5"/>
                  </Button>
                </TooltipTrigger><TooltipContent className="bg-gray-800 border-gray-700 text-xs">Export TXT</TooltipContent></Tooltip>
              </div>

              {/* Page size */}
              <Select value={String(pageSize)} onValueChange={v=>{setPageSize(Number(v) as PageSize);resetPage();}}>
                <SelectTrigger className="h-8 text-xs w-20 bg-gray-800 border-gray-700 text-gray-300"><SelectValue/></SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {PAGE_SIZES.map(s=><SelectItem key={s} value={String(s)} className="text-xs">{s} rows</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <div className="border-t border-gray-800 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800">
                    <TableHead className="w-6"/>
                    <TableHead className="text-gray-400 text-xs">Action</TableHead>
                    <TableHead className="text-gray-400 text-xs">User</TableHead>
                    <TableHead className="text-gray-400 text-xs">Resource</TableHead>
                    <TableHead className="text-gray-400 text-xs">IP</TableHead>
                    <TableHead className="text-gray-400 text-xs">Timestamp (UTC)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    [...Array(8)].map((_,i) => (
                      <TableRow key={i} className="border-gray-800">
                        {[...Array(6)].map((_,j) => <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800 rounded"/></TableCell>)}
                      </TableRow>
                    ))
                  ) : paginated.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-gray-500 py-16">
                        {search||actionFilter!=="all"||resourceFilter!=="all"||dateFrom||dateTo
                          ? "No logs match your filters" : "No audit logs found"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    paginated.map((log, idx) => <DetailRow key={`${log.id}-${idx}`} log={log}/>)
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination footer */}
            {!loading && filtered.length > 0 && (
              <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-800">
                <p className="text-xs text-gray-600">
                  {((page-1)*pageSize)+1}–{Math.min(page*pageSize, filtered.length)} of {filtered.length}
                  {!showNoise && <span className="ml-1 text-gray-700">· {allLogs.length-filtered.length} noise hidden</span>}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1}
                    className="h-7 text-xs border-gray-700 text-gray-400">‹ Prev</Button>
                  <span className="text-xs text-gray-500">Page {page} / {totalPages}</span>
                  <Button variant="outline" size="sm" onClick={()=>setPage(p=>Math.min(totalPages,p+1))} disabled={page===totalPages}
                    className="h-7 text-xs border-gray-700 text-gray-400">Next ›</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <SyslogDialog open={syslogOpen} onClose={()=>setSyslogOpen(false)}/>
      </div>
    </TooltipProvider>
  );
}