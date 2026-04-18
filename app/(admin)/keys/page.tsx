"use client";

/**
 * Keys Management — /app/(admin)/keys/page.tsx
 * ─────────────────────────────────────────────
 * Integration API Keys  (Next.js middleware layer)
 *
 * Storage: PostgreSQL via /api/integration/sync
 * Every mutation calls apiSyncKeys() → POST /api/integration/sync → DB upsert.
 * Page load calls apiLoadKeys()     → GET  /api/integration/sync → DB read.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Plus, RefreshCw, Eye, EyeOff, ShieldCheck,
  Copy, Loader2, AlertCircle, CheckCircle2, Search,
  MoreHorizontal, Clock, Trash2, Zap, Settings,
  FileText, Database, Blocks, BarChart3,
  ToggleLeft, ToggleRight, Activity, Info, Lock,
  User, Link2, AlertTriangle, CircleCheck, CircleX,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button }   from "@/components/ui/button";
import { Input }    from "@/components/ui/input";
import { Label }    from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { format, formatDistanceToNow } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

type Scope =
  | "kyc:read"    | "kyc:write"   | "kyc:verify"
  | "users:read"  | "users:write"
  | "blockchain:read" | "blockchain:mine"
  | "banks:read"  | "banks:write"
  | "certificates:issue" | "certificates:verify"
  | "audit:read";

interface ScopeDef {
  id:    Scope;
  label: string;
  icon:  React.ElementType;
  group: string;
  color: string;
}

const SCOPE_DEFS: ScopeDef[] = [
  { id: "kyc:read",            label: "KYC Read",           icon: FileText,     group: "KYC",          color: "text-blue-400"    },
  { id: "kyc:write",           label: "KYC Write",          icon: FileText,     group: "KYC",          color: "text-blue-400"    },
  { id: "kyc:verify",          label: "KYC Verify",         icon: ShieldCheck,  group: "KYC",          color: "text-blue-400"    },
  { id: "users:read",          label: "Users Read",         icon: Database,     group: "Users",        color: "text-purple-400"  },
  { id: "users:write",         label: "Users Write",        icon: Database,     group: "Users",        color: "text-purple-400"  },
  { id: "blockchain:read",     label: "Blockchain Read",    icon: Blocks,       group: "Blockchain",   color: "text-cyan-400"    },
  { id: "blockchain:mine",     label: "Blockchain Mine",    icon: Blocks,       group: "Blockchain",   color: "text-cyan-400"    },
  { id: "banks:read",          label: "Banks Read",         icon: Database,     group: "Banks",        color: "text-emerald-400" },
  { id: "banks:write",         label: "Banks Write",        icon: Database,     group: "Banks",        color: "text-emerald-400" },
  { id: "certificates:issue",  label: "Issue Certificate",  icon: Lock,         group: "Certificates", color: "text-amber-400"   },
  { id: "certificates:verify", label: "Verify Certificate", icon: CheckCircle2, group: "Certificates", color: "text-amber-400"   },
  { id: "audit:read",          label: "Audit Logs",         icon: BarChart3,    group: "Audit",        color: "text-gray-400"    },
];

const SCOPE_TO_NEXTJS_ROUTES: Record<Scope, string[]> = {
  "kyc:read":            ["POST /api/integration/kyc  {action:list|get|stats|history}"],
  "kyc:write":           ["POST /api/integration/kyc  {action:create|update}"],
  "kyc:verify":          ["POST /api/integration/kyc  {action:verify|reject}"],
  "users:read":          ["POST /api/integration/users  {action:list}"],
  "users:write":         ["POST /api/integration/users  {action:create|update|reset_password}"],
  "blockchain:read":     ["POST /api/integration/blockchain  {action:stats|blocks|block|pending|validate}"],
  "blockchain:mine":     ["POST /api/integration/blockchain  {action:mine}"],
  "banks:read":          ["POST /api/integration/banks  {action:list|get}"],
  "banks:write":         ["POST /api/integration/banks  {action:create}"],
  "certificates:issue":  ["POST /api/integration/certificates  {action:issue}"],
  "certificates:verify": ["POST /api/integration/certificates  {action:verify|list}"],
  "audit:read":          ["POST /api/integration/audit  {action:logs|alerts}"],
};

const GO_ROLE_SCOPES: Record<string, Scope[]> = {
  integration_service: [
    "kyc:read","kyc:write","kyc:verify",
    "users:read","users:write",
    "blockchain:read","blockchain:mine",
    "banks:read","banks:write",
    "certificates:issue","certificates:verify",
    "audit:read",
  ],
  admin: [
    "kyc:read","kyc:write","kyc:verify",
    "users:read","users:write",
    "blockchain:read","blockchain:mine",
    "banks:read","banks:write",
    "certificates:issue","certificates:verify",
    "audit:read",
  ],
  bank_admin: [
    "kyc:read","kyc:write","kyc:verify",
    "users:read","users:write",
    "blockchain:read",
    "banks:read",
    "certificates:issue","certificates:verify",
    "audit:read",
  ],
  bank_officer: [
    "kyc:read","kyc:write","kyc:verify",
    "blockchain:read",
    "banks:read",
  ],
  auditor: [
    "kyc:read",
    "users:read",
    "blockchain:read",
    "banks:read",
    "audit:read",
  ],
};

const GROUP_COLORS: Record<string, string> = {
  KYC:          "bg-blue-900/20 border-blue-800/40 text-blue-300",
  Users:        "bg-purple-900/20 border-purple-800/40 text-purple-300",
  Blockchain:   "bg-cyan-900/20 border-cyan-800/40 text-cyan-300",
  Banks:        "bg-emerald-900/20 border-emerald-800/40 text-emerald-300",
  Certificates: "bg-amber-900/20 border-amber-800/40 text-amber-300",
  Audit:        "bg-gray-800/60 border-gray-700 text-gray-300",
};

interface IntegrationKey {
  id:                  string;
  name:                string;
  description:         string;
  organization:        string;
  key_prefix:          string;
  key_hash:            string;
  is_active:           boolean;
  is_deleted:          boolean;
  scopes:              Scope[];
  created_at:          number;
  expires_at:          number;
  last_used_at:        number;
  request_count:       number;
  request_count_today: number;
  scope_counts:        Partial<Record<Scope, number>>;
  scope_counts_today:  Partial<Record<Scope, number>>;
}

// ─── API helpers — Postgres via /api/integration/sync ────────────────────────

async function apiLoadKeys(): Promise<IntegrationKey[]> {
  try {
    const res = await fetch("/api/integration/sync");
    if (!res.ok) return [];
    const data = await res.json();
    return (data.keys ?? []) as IntegrationKey[];
  } catch { return []; }
}

async function apiSyncKeys(keys: IntegrationKey[]): Promise<void> {
  await fetch("/api/integration/sync", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ keys }),
  });
}

// ─── Crypto ───────────────────────────────────────────────────────────────────

function genRawKey(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return "kyk_" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Service Account Coverage ─────────────────────────────────────────────────

interface SvcAccountStatus {
  username:      string;
  role:          string;
  configured:    boolean;
  coveredScopes: Scope[];
  missingScopes: Scope[];
  allCovered:    boolean;
}

function checkServiceAccountCoverage(keyScopes: Scope[]): SvcAccountStatus {
  const username   = process.env.NEXT_PUBLIC_SVC_USER ?? "nextjs-integration-svc";
  const role       = "integration_service";
  const roleScopes = GO_ROLE_SCOPES[role] ?? [];
  const covered    = keyScopes.filter((s) => roleScopes.includes(s));
  const missing    = keyScopes.filter((s) => !roleScopes.includes(s));
  return {
    username,
    role,
    configured:    true,
    coveredScopes: covered,
    missingScopes: missing,
    allCovered:    missing.length === 0,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${accent}`}>
      <p className="text-2xl font-bold tabular-nums text-white">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function ScopeBadge({ scope }: { scope: Scope }) {
  const def = SCOPE_DEFS.find((s) => s.id === scope);
  if (!def) return null;
  const Icon = def.icon;
  return (
    <span className="inline-flex items-center gap-1 text-xs bg-gray-800 border border-gray-700 text-gray-400 px-1.5 py-0.5 rounded">
      <Icon className={`h-2.5 w-2.5 ${def.color}`} />{def.label}
    </span>
  );
}

// ─── Scope Picker ─────────────────────────────────────────────────────────────

function ScopePicker({ value, onChange }: { value: Scope[]; onChange: (s: Scope[]) => void }) {
  const toggle = (s: Scope) =>
    onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);

  const groups = SCOPE_DEFS.reduce<Record<string, ScopeDef[]>>((acc, d) => {
    (acc[d.group] ??= []).push(d);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {Object.entries(groups).map(([group, defs]) => (
        <div key={group}>
          <p className="text-xs text-gray-600 uppercase tracking-wider mb-1.5">{group}</p>
          <div className="flex flex-wrap gap-2">
            {defs.map((d) => {
              const Icon   = d.icon;
              const active = value.includes(d.id);
              return (
                <button key={d.id} type="button" onClick={() => toggle(d.id)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                    active
                      ? "bg-emerald-900/40 border-emerald-700 text-emerald-300"
                      : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                  }`}>
                  <Icon className={`h-3 w-3 ${active ? "text-emerald-400" : d.color}`} />
                  {d.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Service Account Dialog ───────────────────────────────────────────────────

function ServiceAccountDialog({
  integrationKey, onClose,
}: {
  integrationKey: IntegrationKey;
  onClose: () => void;
}) {
  const svc    = checkServiceAccountCoverage(integrationKey.scopes);
  const groups = SCOPE_DEFS.reduce<Record<string, ScopeDef[]>>((acc, d) => {
    (acc[d.group] ??= []).push(d);
    return acc;
  }, {});

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-4 w-4 text-cyan-400" />
            Service Account — <span className="text-cyan-400 font-mono">{integrationKey.name}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            Which Go service account powers this key, scope coverage, and sample requests.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-1">

          {/* Service Account Info */}
          <div className={`rounded-lg border px-4 py-3 ${svc.allCovered ? "bg-emerald-950/30 border-emerald-800/40" : "bg-amber-950/30 border-amber-800/40"}`}>
            <div className="flex items-center gap-2 mb-2">
              {svc.allCovered
                ? <CircleCheck  className="h-4 w-4 text-emerald-400" />
                : <AlertTriangle className="h-4 w-4 text-amber-400" />}
              <p className="text-sm font-semibold text-white">
                {svc.allCovered ? "Service account covers all scopes" : "Service account missing some scopes"}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs mt-2">
              <div className="flex justify-between">
                <span className="text-gray-500">Username</span>
                <code className="text-cyan-400">{svc.username}</code>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Go Role</span>
                <code className="text-cyan-400">{svc.role}</code>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Scopes covered</span>
                <span className="text-emerald-400">{svc.coveredScopes.length} / {integrationKey.scopes.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Env var</span>
                <code className="text-gray-400">INTEGRATION_SERVICE_USER</code>
              </div>
            </div>
            {svc.missingScopes.length > 0 && (
              <div className="mt-2 pt-2 border-t border-amber-800/30">
                <p className="text-xs text-amber-400 mb-1">⚠ Missing scopes — Go role lacks permission:</p>
                <div className="flex flex-wrap gap-1">
                  {svc.missingScopes.map((s) => (
                    <span key={s} className="text-xs bg-amber-950/50 border border-amber-800/50 text-amber-300 px-1.5 py-0.5 rounded font-mono">{s}</span>
                  ))}
                </div>
                <p className="text-xs text-amber-500/70 mt-1.5">
                  Fix: change service account role to <code className="text-amber-400">integration_service</code> or <code className="text-amber-400">admin</code>
                </p>
              </div>
            )}
          </div>

          {/* Coverage table by group */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Scope Coverage by Feature</p>
            <div className="space-y-2">
              {Object.entries(groups).map(([group, defs]) => {
                const keyHas = defs.filter((d) => integrationKey.scopes.includes(d.id));
                if (keyHas.length === 0) return null;
                const colorCls = GROUP_COLORS[group] ?? "bg-gray-800/60 border-gray-700 text-gray-300";
                return (
                  <div key={group} className={`rounded-lg border px-3 py-2 ${colorCls}`}>
                    <p className="text-xs font-semibold mb-1.5">{group}</p>
                    <div className="space-y-1">
                      {keyHas.map((d) => {
                        const covered = svc.coveredScopes.includes(d.id);
                        const routes  = SCOPE_TO_NEXTJS_ROUTES[d.id] ?? [];
                        return (
                          <div key={d.id}>
                            <div className="flex items-center gap-1.5">
                              {covered
                                ? <CircleCheck className="h-3 w-3 text-emerald-400 shrink-0" />
                                : <CircleX     className="h-3 w-3 text-red-400 shrink-0" />}
                              <span className="text-xs">{d.label}</span>
                            </div>
                            {routes.map((r) => (
                              <div key={r} className="ml-5 mt-0.5">
                                <code className="text-xs text-gray-500 font-mono">{r}</code>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Postman samples */}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Sample Requests</p>
            <div className="space-y-2">
              {integrationKey.scopes.slice(0, 4).map((scope) => {
                const [feature, action] = scope.split(":");
                const sampleAction =
                  action === "read"   ? "list"   :
                  action === "write"  ? "create" :
                  action === "verify" ? "verify" :
                  action === "mine"   ? "mine"   :
                  action === "issue"  ? "issue"  : "list";
                const feat = ["kyc","users","blockchain","banks","audit"].includes(feature)
                  ? feature : "certificates";
                return (
                  <div key={scope} className="bg-gray-950 rounded-lg border border-gray-800 p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs bg-cyan-900/40 border border-cyan-800/40 text-cyan-400 px-1.5 py-0.5 rounded">POST</span>
                      <code className="text-xs text-gray-300">/api/integration/{feat}</code>
                      <span className="ml-auto text-xs text-gray-600">{scope}</span>
                    </div>
                    <pre className="text-xs text-emerald-400 font-mono whitespace-pre">{JSON.stringify({
                      action: sampleAction,
                      ...(sampleAction === "list"   ? { params: { page: "1", per_page: "10" } } : {}),
                      ...(["verify","create"].includes(sampleAction) ? { data: { customer_id: "CUST-abc123" } } : {}),
                    }, null, 2)}</pre>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Header: <code className="text-gray-500">Authorization: Bearer kyk_…</code>
            </p>
          </div>
        </div>

        <Button onClick={onClose} className="w-full mt-2 bg-gray-800 hover:bg-gray-700 text-white">Close</Button>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Integration Key Dialog ───────────────────────────────────────────────

function NewIntegrationKeyDialog({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (key: IntegrationKey) => void;
}) {
  const { toast } = useToast();
  const [form, setForm]         = useState({ name: "", description: "", organization: "", expires_days: "365" });
  const [scopes, setScopes]     = useState<Scope[]>(["kyc:read", "certificates:verify"]);
  const [creating, setCreating] = useState(false);
  const [result, setResult]     = useState<{ key: IntegrationKey; fullKey: string } | null>(null);
  const [copied, setCopied]     = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ name: "", description: "", organization: "", expires_days: "365" });
      setScopes(["kyc:read", "certificates:verify"]);
      setResult(null); setCopied(false);
    }
  }, [open]);

  const svcPreview = checkServiceAccountCoverage(scopes);

  const handleCreate = async () => {
    if (!form.name.trim()) { toast({ title: "Name is required", variant: "destructive" }); return; }
    if (!scopes.length)    { toast({ title: "Select at least one permission", variant: "destructive" }); return; }
    setCreating(true);
    try {
      const fullKey = genRawKey();
      const hash    = await sha256hex(fullKey);
      const now     = Date.now();
      const expDays = parseInt(form.expires_days) || 365;

      const entry: IntegrationKey = {
        id:                  crypto.randomUUID(),
        name:                form.name.trim(),
        description:         form.description.trim(),
        organization:        form.organization.trim(),
        key_prefix:          fullKey.slice(0, 12),
        key_hash:            hash,
        is_active:           true,
        is_deleted:          false,
        scopes,
        created_at:          now,
        expires_at:          expDays > 0 ? now + expDays * 86_400_000 : 0,
        last_used_at:        0,
        request_count:       0,
        request_count_today: 0,
        scope_counts:        {},
        scope_counts_today:  {},
      };

      await apiSyncKeys([entry]);
      setResult({ key: entry, fullKey });
      onCreated(entry);
      toast({ title: "API key created — copy it now!" });
    } catch {
      toast({ title: "Failed to create key", variant: "destructive" });
    } finally { setCreating(false); }
  };

  const copyKey = () => {
    if (!result) return;
    navigator.clipboard.writeText(result.fullKey);
    setCopied(true); setTimeout(() => setCopied(false), 3000);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-[52rem] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-emerald-400" />New Integration API Key
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            External systems call <code className="text-cyan-400">/api/integration/&lt;feature&gt;</code> with this key.
            Next.js validates and proxies to Go — Go never sees the raw key.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 mt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-gray-300 text-sm">Key Name <span className="text-red-400">*</span></Label>
                <Input placeholder="loan-service-prod" value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-gray-300 text-sm">Organization</Label>
                <Input placeholder="ABA Bank Ltd." value={form.organization}
                  onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-gray-300 text-sm">Description</Label>
                <Input placeholder="Loan approval workflow integration" value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600" />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-gray-300 text-sm">Expiry</Label>
                <Select value={form.expires_days} onValueChange={(v) => setForm((f) => ({ ...f, expires_days: v }))}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-300"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-800">
                    {[["30","30 days"],["90","90 days"],["180","180 days"],["365","1 year"],["730","2 years"],["0","Never"]].map(([v,l]) => (
                      <SelectItem key={v} value={v} className="text-gray-300">{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300 text-sm">Permissions <span className="text-red-400">*</span></Label>
              <ScopePicker value={scopes} onChange={setScopes} />
            </div>

            {scopes.length > 0 && (
              <div className={`rounded-lg border px-3.5 py-3 text-xs ${svcPreview.allCovered ? "bg-emerald-950/20 border-emerald-800/30" : "bg-amber-950/20 border-amber-800/30"}`}>
                <div className="flex items-center gap-2 mb-1">
                  {svcPreview.allCovered
                    ? <CircleCheck   className="h-3.5 w-3.5 text-emerald-400" />
                    : <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />}
                  <span className={svcPreview.allCovered ? "text-emerald-300" : "text-amber-300"}>
                    Service account <code className="font-mono">{svcPreview.username}</code> ({svcPreview.role})
                    {svcPreview.allCovered ? " covers all selected scopes ✓" : " missing: " + svcPreview.missingScopes.join(", ")}
                  </span>
                </div>
                {!svcPreview.allCovered && (
                  <p className="text-amber-500/70 ml-5">
                    Requests using missing scopes will return 403 from Go.
                    Fix: reassign service account to <code className="text-amber-400">integration_service</code> role.
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={creating} className="border-gray-700 text-gray-300">Cancel</Button>
              <Button onClick={handleCreate} disabled={creating} className="bg-emerald-700 hover:bg-emerald-600 text-white">
                {creating
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Creating…</>
                  : <><Zap className="h-4 w-4 mr-1.5" />Generate Key</>}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 mt-1">
            <div className="flex items-start gap-2.5 bg-amber-950/40 border border-amber-800/50 rounded-lg p-3.5">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300">Copy your key NOW</p>
                <p className="text-xs text-amber-400/80 mt-0.5">Shown only once. Stored as SHA-256 hash — cannot be recovered.</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">API Key</p>
              <div className="bg-gray-950 rounded-lg border border-gray-800 p-3 flex items-center gap-2">
                <code className="font-mono text-sm text-emerald-400 break-all flex-1">{result.fullKey}</code>
                <button onClick={copyKey} className={`shrink-0 ${copied ? "text-green-400" : "text-gray-500 hover:text-gray-300"}`}>
                  {copied ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 px-4 py-3 space-y-1.5 text-xs">
              {[
                { label: "Key ID",      value: result.key.id.slice(0, 20) + "…"           },
                { label: "Prefix",      value: result.key.key_prefix + "…"                },
                { label: "Permissions", value: `${result.key.scopes.length} granted`       },
                { label: "Svc Account", value: svcPreview.username                        },
                { label: "Expires",     value: result.key.expires_at > 0 ? format(new Date(result.key.expires_at), "MMM d, yyyy") : "Never" },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-mono text-gray-300">{value}</span>
                </div>
              ))}
            </div>
            <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg px-3.5 py-3 text-xs text-gray-400">
              <p className="text-gray-300 font-medium mb-1">Usage</p>
              <code className="block bg-gray-900 rounded px-2 py-1.5 text-cyan-400">
                Authorization: Bearer {result.fullKey}
              </code>
            </div>
            <Button onClick={onClose} className="w-full bg-gray-700 hover:bg-gray-600 text-white">
              Done — I have saved my key
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Scopes Dialog ───────────────────────────────────────────────────────

function EditScopesDialog({
  editKey, onClose, onSaved,
}: {
  editKey: IntegrationKey | null;
  onClose: () => void;
  onSaved: (k: IntegrationKey) => void;
}) {
  const { toast }           = useToast();
  const [scopes, setScopes] = useState<Scope[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (editKey) setScopes([...editKey.scopes]); }, [editKey]);

  const handleSave = async () => {
    if (!editKey) return;
    if (!scopes.length) { toast({ title: "Select at least one permission", variant: "destructive" }); return; }
    setSaving(true);
    try {
      await apiSyncKeys([{ ...editKey, scopes }]);
      onSaved({ ...editKey, scopes });
      toast({ title: "Permissions updated" });
      onClose();
    } catch { toast({ title: "Failed to save", variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={!!editKey} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-cyan-400" />Edit Permissions
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">{editKey?.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <ScopePicker value={scopes} onChange={setScopes} />
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={saving} className="border-gray-700 text-gray-300">Cancel</Button>
            <Button onClick={handleSave} disabled={saving} className="bg-cyan-700 hover:bg-cyan-600 text-white">
              {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : "Save Permissions"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Request Summary Panel ────────────────────────────────────────────────────

function ApiSummaryPanel({ keys }: { keys: IntegrationKey[] }) {
  const live = keys.filter((k) => !k.is_deleted);

  const totals = SCOPE_DEFS.reduce<Record<Scope, { lifetime: number; today: number }>>((acc, d) => {
    acc[d.id] = {
      lifetime: live.reduce((s, k) => s + (k.scope_counts?.[d.id] ?? 0), 0),
      today:    live.reduce((s, k) => s + (k.scope_counts_today?.[d.id] ?? 0), 0),
    };
    return acc;
  }, {} as Record<Scope, { lifetime: number; today: number }>);

  const groups = SCOPE_DEFS.reduce<Record<string, ScopeDef[]>>((acc, d) => {
    (acc[d.group] ??= []).push(d);
    return acc;
  }, {});

  const grandTotal      = live.reduce((s, k) => s + k.request_count, 0);
  const grandTotalToday = live.reduce((s, k) => s + k.request_count_today, 0);

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="px-4 pt-4 pb-3 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-cyan-400" />
            <h2 className="text-sm font-semibold text-white">Request Summary</h2>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span><span className="text-white font-semibold tabular-nums">{grandTotal.toLocaleString()}</span> lifetime</span>
            <span><span className="text-cyan-400 font-semibold tabular-nums">{grandTotalToday.toLocaleString()}</span> today</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {Object.entries(groups).map(([group, defs]) => {
            const groupLifetime = defs.reduce((s, d) => s + totals[d.id].lifetime, 0);
            const groupToday    = defs.reduce((s, d) => s + totals[d.id].today, 0);
            const colorCls      = GROUP_COLORS[group] ?? "bg-gray-800/60 border-gray-700 text-gray-300";
            return (
              <div key={group} className={`rounded-lg border px-3 py-2.5 ${colorCls}`}>
                <p className="text-xs font-semibold mb-2">{group}</p>
                <p className="text-xl font-bold tabular-nums text-white">{groupLifetime.toLocaleString()}</p>
                <p className="text-xs opacity-70 mt-0.5">{groupToday.toLocaleString()} today</p>
                <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
                  {defs.map((d) => (
                    <div key={d.id} className="flex justify-between items-center text-xs">
                      <span className="opacity-60 truncate">{d.label.replace(group + " ", "")}</span>
                      <span className="tabular-nums font-medium text-white ml-1">{totals[d.id].lifetime.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Refresh options ──────────────────────────────────────────────────────────

const REFRESH_OPTIONS = [
  { label: "Off", ms: 0      },
  { label: "10s", ms: 10000  },
  { label: "30s", ms: 30000  },
  { label: "60s", ms: 60000  },
];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function KeysPage() {
  const { toast } = useToast();

  const [intKeys,     setIntKeys]     = useState<IntegrationKey[]>([]);
  const [intLoading,  setIntLoading]  = useState(true);
  const [showNew,     setShowNew]     = useState(false);
  const [editKey,     setEditKey]     = useState<IntegrationKey | null>(null);
  const [svcKey,      setSvcKey]      = useState<IntegrationKey | null>(null);
  const [intSearch,   setIntSearch]   = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [visiblePfx,  setVisiblePfx]  = useState<Set<string>>(new Set());
  const [refreshMs,   setRefreshMs]   = useState(0);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load from Postgres ────────────────────────────────────────────────────
  const fetchIntKeys = useCallback(async () => {
    setIntLoading(true);
    try {
      const keys = await apiLoadKeys();
      setIntKeys(keys);
    } catch { setIntKeys([]); }
    finally { setIntLoading(false); }
  }, []);

  useEffect(() => { fetchIntKeys(); }, [fetchIntKeys]);

  // ── Auto-refresh timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshMs > 0) {
      timerRef.current = setInterval(() => {
        fetchIntKeys();
        setLastRefresh(new Date());
      }, refreshMs);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshMs, fetchIntKeys]);

  const handleRefresh = () => { fetchIntKeys(); setLastRefresh(new Date()); };

  // ── Mutations — optimistic update + Postgres persist ─────────────────────
  const mutateIntKey = async (id: string, patch: Partial<IntegrationKey>) => {
    const updated = intKeys.map((k) => k.id === id ? { ...k, ...patch } : k);
    setIntKeys(updated);
    await apiSyncKeys(updated);
  };

  const toggleActive = async (k: IntegrationKey) => {
    await mutateIntKey(k.id, { is_active: !k.is_active });
    toast({ title: k.is_active ? `"${k.name}" disabled` : `"${k.name}" enabled` });
  };

  const softDelete = async (k: IntegrationKey) => {
    await mutateIntKey(k.id, { is_deleted: true, is_active: false });
    toast({ title: `"${k.name}" deleted (soft)` });
  };

  const restoreKey = async (k: IntegrationKey) => {
    await mutateIntKey(k.id, { is_deleted: false });
    toast({ title: `"${k.name}" restored` });
  };

  // ── Derived state ─────────────────────────────────────────────────────────
  const filtered = intKeys.filter((k) => {
    if (!showDeleted && k.is_deleted) return false;
    const q = intSearch.toLowerCase();
    return !q || k.name.toLowerCase().includes(q) || k.organization.toLowerCase().includes(q) || k.key_prefix.toLowerCase().includes(q);
  });

  const live = intKeys.filter((k) => !k.is_deleted);
  const stats = {
    total:     live.length,
    active:    live.filter((k) => k.is_active).length,
    disabled:  live.filter((k) => !k.is_active).length,
    deleted:   intKeys.filter((k) => k.is_deleted).length,
    totalReqs: live.reduce((s, k) => s + k.request_count, 0),
    todayReqs: live.reduce((s, k) => s + k.request_count_today, 0),
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Zap className="h-6 w-6 text-emerald-400" />Integration API Keys
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Proxy keys for external systems — scoped, togglable, and tracked per feature
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Select value={String(refreshMs)} onValueChange={(v) => setRefreshMs(Number(v))}>
              <SelectTrigger className="w-[90px] h-8 text-xs bg-gray-800 border-gray-700 text-gray-300">
                <Clock className="h-3 w-3 mr-1 shrink-0" /><SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800">
                {REFRESH_OPTIONS.map((o) => (
                  <SelectItem key={o.ms} value={String(o.ms)} className="text-xs text-gray-300">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleRefresh} variant="outline" size="sm" className="h-8 border-gray-700 text-gray-300">
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
            </Button>
            {refreshMs > 0 && (
              <span className="text-xs text-gray-600 hidden sm:block">{format(lastRefresh, "HH:mm:ss")}</span>
            )}
            <Button onClick={() => setShowNew(true)} size="sm" className="h-8 bg-emerald-700 hover:bg-emerald-600 text-white">
              <Plus className="h-4 w-4 mr-1.5" />New Key
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatPill label="Total Keys"     value={stats.total}     accent="bg-gray-800/60 border-gray-700"          />
          <StatPill label="Active"         value={stats.active}    accent="bg-emerald-900/20 border-emerald-800/40"  />
          <StatPill label="Disabled"       value={stats.disabled}  accent="bg-gray-800/40 border-gray-700"           />
          <StatPill label="Deleted"        value={stats.deleted}   accent="bg-red-900/20 border-red-800/40"          />
          <StatPill label="Total Requests" value={stats.totalReqs} accent="bg-cyan-900/20 border-cyan-800/40"        />
          <StatPill label="Today"          value={stats.todayReqs} accent="bg-blue-900/20 border-blue-800/40"        />
        </div>

        <ApiSummaryPanel keys={intKeys} />

        {/* Table */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3 border-b border-gray-800 pt-4 px-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                <Input placeholder="Search name, org, prefix…" value={intSearch}
                  onChange={(e) => setIntSearch(e.target.value)}
                  className="pl-8 h-8 text-sm bg-gray-800 border-gray-700 text-white placeholder:text-gray-600" />
              </div>
              <button onClick={() => setShowDeleted((p) => !p)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  showDeleted
                    ? "bg-red-900/20 border-red-800/40 text-red-400"
                    : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                }`}>
                <Trash2 className="h-3 w-3" />{showDeleted ? "Hide Deleted" : "Show Deleted"}
              </button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800 hover:bg-transparent">
                  <TableHead className="text-gray-500 text-xs uppercase pl-4">Name / Org</TableHead>
                  <TableHead className="text-gray-500 text-xs uppercase">Key Prefix</TableHead>
                  <TableHead className="text-gray-500 text-xs uppercase hidden lg:table-cell">Permissions</TableHead>
                  <TableHead className="text-gray-500 text-xs uppercase">Svc Account</TableHead>
                  <TableHead className="text-gray-500 text-xs uppercase">Requests</TableHead>
                  <TableHead className="text-gray-500 text-xs uppercase">Last Used</TableHead>
                  <TableHead className="text-gray-500 text-xs uppercase">On/Off</TableHead>
                  <TableHead className="text-gray-500 text-xs uppercase hidden sm:table-cell">Expires</TableHead>
                  <TableHead className="text-right text-gray-500 text-xs uppercase pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {intLoading ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i} className="border-gray-800">
                      {[...Array(9)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Zap className="h-8 w-8 text-gray-700" />
                        <p className="text-gray-500 text-sm">
                          {intSearch ? "No keys match your search"
                           : showDeleted ? "No keys (including deleted)"
                           : "No integration API keys yet"}
                        </p>
                        {!intSearch && (
                          <Button onClick={() => setShowNew(true)} size="sm" variant="outline"
                            className="border-gray-700 text-gray-400 hover:text-white mt-1">
                            <Plus className="h-3.5 w-3.5 mr-1.5" />Create first key
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((k) => {
                    const isExpired  = k.expires_at > 0 && k.expires_at < Date.now();
                    const daysLeft   = k.expires_at > 0 ? Math.floor((k.expires_at - Date.now()) / 86_400_000) : null;
                    const pfxVisible = visiblePfx.has(k.id);
                    const togglePfx  = () => setVisiblePfx((p) => {
                      const n = new Set(p); n.has(k.id) ? n.delete(k.id) : n.add(k.id); return n;
                    });
                    const svc = checkServiceAccountCoverage(k.scopes);

                    return (
                      <TableRow key={k.id}
                        className={`border-gray-800 hover:bg-gray-800/30 ${k.is_deleted ? "opacity-40" : ""}`}>

                        {/* Name */}
                        <TableCell className="pl-4 py-3.5">
                          <p className="text-sm font-medium text-white flex items-center gap-1.5">
                            {k.name}
                            {k.is_deleted && <span className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 px-1.5 py-0.5 rounded">deleted</span>}
                            {isExpired && !k.is_deleted && <span className="text-xs text-amber-400 bg-amber-950/40 border border-amber-900/50 px-1.5 py-0.5 rounded">expired</span>}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{k.organization || "—"}</p>
                          {k.description && <p className="text-xs text-gray-600 mt-0.5 truncate max-w-[180px]">{k.description}</p>}
                        </TableCell>

                        {/* Key prefix */}
                        <TableCell className="py-3.5">
                          <div className="flex items-center gap-1.5">
                            <code className="font-mono text-xs text-cyan-400">
                              {pfxVisible ? k.key_prefix + "…" : k.key_prefix.slice(0, 4) + "••••••••"}
                            </code>
                            <button onClick={togglePfx} className="text-gray-600 hover:text-gray-300">
                              {pfxVisible ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            </button>
                          </div>
                        </TableCell>

                        {/* Permissions */}
                        <TableCell className="py-3.5 hidden lg:table-cell">
                          <div className="flex flex-wrap gap-1 max-w-[200px]">
                            {k.scopes.slice(0, 3).map((s) => <ScopeBadge key={s} scope={s} />)}
                            {k.scopes.length > 3 && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <span className="text-xs text-gray-600 cursor-default">+{k.scopes.length - 3} more</span>
                                </TooltipTrigger>
                                <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
                                  <div className="space-y-1">{k.scopes.slice(3).map((s) => <p key={s}>{s}</p>)}</div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </TableCell>

                        {/* Service Account */}
                        <TableCell className="py-3.5">
                          <button onClick={() => setSvcKey(k)}
                            className="flex items-center gap-1.5 group hover:opacity-80 transition-opacity">
                            {svc.allCovered
                              ? <CircleCheck  className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              : <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                            <div className="text-left">
                              <p className="text-xs text-gray-300 font-mono">{svc.username}</p>
                              <p className="text-xs text-gray-600">{svc.role}</p>
                            </div>
                            <Link2 className="h-3 w-3 text-gray-700 group-hover:text-gray-400 ml-1" />
                          </button>
                        </TableCell>

                        {/* Requests */}
                        <TableCell className="py-3.5">
                          <p className="text-sm text-white tabular-nums">{k.request_count.toLocaleString()}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{k.request_count_today} today</p>
                        </TableCell>

                        {/* Last used */}
                        <TableCell className="py-3.5">
                          <p className="text-xs text-gray-400">
                            {k.last_used_at > 0
                              ? formatDistanceToNow(k.last_used_at, { addSuffix: true })
                              : <span className="text-gray-600">Never</span>}
                          </p>
                        </TableCell>

                        {/* Toggle */}
                        <TableCell className="py-3.5">
                          {k.is_deleted ? (
                            <span className="text-xs text-red-400/60">—</span>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button onClick={() => toggleActive(k)} className="flex items-center gap-1.5 group">
                                  {k.is_active
                                    ? <><ToggleRight className="h-6 w-6 text-emerald-400 group-hover:text-emerald-300" /><span className="text-xs text-emerald-400">On</span></>
                                    : <><ToggleLeft  className="h-6 w-6 text-gray-600  group-hover:text-gray-400"    /><span className="text-xs text-gray-500">Off</span></>}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
                                {k.is_active ? "Click to disable" : "Click to enable"}
                              </TooltipContent>
                            </Tooltip>
                          )}
                        </TableCell>

                        {/* Expires */}
                        <TableCell className="py-3.5 hidden sm:table-cell">
                          {daysLeft === null ? (
                            <span className="text-xs text-gray-500">Never</span>
                          ) : (
                            <>
                              <p className={`text-sm ${isExpired ? "text-red-400" : daysLeft <= 30 ? "text-amber-400" : "text-gray-300"}`}>
                                {format(new Date(k.expires_at), "MMM d, yyyy")}
                              </p>
                              <p className="text-xs text-gray-600 mt-0.5">
                                {isExpired ? `${Math.abs(daysLeft)}d ago` : `in ${daysLeft}d`}
                              </p>
                            </>
                          )}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="pr-4 py-3.5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-white">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent className="bg-gray-900 border-gray-800" align="end">
                              {!k.is_deleted && (
                                <>
                                  <DropdownMenuItem
                                    className="text-gray-300 hover:text-white focus:text-white focus:bg-gray-800 cursor-pointer text-sm"
                                    onClick={() => setSvcKey(k)}>
                                    <User className="h-3.5 w-3.5 mr-2" />Service Account
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-gray-300 hover:text-white focus:text-white focus:bg-gray-800 cursor-pointer text-sm"
                                    onClick={() => setEditKey(k)}>
                                    <Settings className="h-3.5 w-3.5 mr-2" />Edit Permissions
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-gray-300 hover:text-white focus:text-white focus:bg-gray-800 cursor-pointer text-sm"
                                    onClick={() => toggleActive(k)}>
                                    {k.is_active
                                      ? <><ToggleLeft  className="h-3.5 w-3.5 mr-2" />Disable Key</>
                                      : <><ToggleRight className="h-3.5 w-3.5 mr-2" />Enable Key</>}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="bg-gray-800" />
                                  <DropdownMenuItem
                                    className="text-red-400 hover:text-red-300 focus:text-red-300 focus:bg-red-900/20 cursor-pointer text-sm"
                                    onClick={() => softDelete(k)}>
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />Delete Key
                                  </DropdownMenuItem>
                                </>
                              )}
                              {k.is_deleted && (
                                <DropdownMenuItem
                                  className="text-emerald-400 hover:text-emerald-300 focus:bg-emerald-900/20 cursor-pointer text-sm"
                                  onClick={() => restoreKey(k)}>
                                  <RefreshCw className="h-3.5 w-3.5 mr-2" />Restore Key
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            {!intLoading && filtered.length > 0 && (
              <div className="px-4 py-2.5 border-t border-gray-800 flex items-center justify-between">
                <p className="text-xs text-gray-600">
                  {filtered.filter((k) => !k.is_deleted).length} active
                  {showDeleted && ` · ${filtered.filter((k) => k.is_deleted).length} deleted`}
                </p>
                <p className="text-xs text-gray-700">Stored in PostgreSQL · synced via /api/integration/sync</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Architecture note */}
        <div className="flex items-start gap-3 bg-gray-900/40 border border-gray-800 rounded-xl p-4">
          <Info className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
          <div className="text-xs text-gray-500 space-y-1.5">
            <p className="text-gray-300 font-medium">How Integration API Keys work</p>
            <p>
              External systems send <code className="text-cyan-400">Authorization: Bearer &lt;key&gt;</code> to{" "}
              <code className="text-cyan-400">POST /api/integration/&lt;feature&gt;</code> on this Next.js server.
            </p>
            <p>
              Next.js validates the SHA-256 hash, checks scopes, increments counters, then proxies to Go using the{" "}
              <code className="text-cyan-400">integration_service</code> account JWT — auto-refreshed on expiry.
              Click <strong className="text-white">Service Account</strong> on any key row to see coverage and sample requests.
            </p>
          </div>
        </div>
      </div>

      {/* Dialogs */}
      <NewIntegrationKeyDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(k) => setIntKeys((prev) => [k, ...prev])}
      />
      <EditScopesDialog
        editKey={editKey}
        onClose={() => setEditKey(null)}
        onSaved={(updated) => setIntKeys((prev) => prev.map((k) => k.id === updated.id ? updated : k))}
      />
      {svcKey && (
        <ServiceAccountDialog
          integrationKey={svcKey}
          onClose={() => setSvcKey(null)}
        />
      )}
    </TooltipProvider>
  );
}