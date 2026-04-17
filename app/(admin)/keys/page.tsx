"use client";

/**
 * Keys Management — /app/(admin)/keys/page.tsx
 * ─────────────────────────────────────────────
 * Integration API Keys  (Next.js middleware layer)
 *   Storage : localStorage (browser KV — no Go backend needed)
 *   Purpose : External systems call POST /api/integration/<feature> on
 *             the Next.js server. Next.js validates the hashed key +
 *             permission scope, records the request count, then proxies
 *             to Go using the system's own JWT.
 *   Features:
 *     - Generate key  (kyk_ prefix, SHA-256 hash stored, full key shown once)
 *     - Permission checkboxes per feature (kyc, blockchain, certificates, audit)
 *     - Enable / Disable toggle  (is_active)
 *     - Soft-delete   (is_deleted = true — never hard-deleted)
 *     - Per-key + per-scope request stats
 *     - Auto-refresh selector  (Off / 10s / 30s / 60s)
 *
 * NOTE: Requester Keys (Go backend ECDSA/RSA signing keys) are managed
 *       on the Certificates page — they are NOT shown here.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Key, Plus, RefreshCw, Eye, EyeOff, ShieldCheck,
  Copy, Loader2, AlertTriangle, CheckCircle2, XCircle, Search,
  MoreHorizontal, Clock, Trash2, Zap, Settings,
  FileText, Database, Blocks, BarChart3, AlertCircle,
  ToggleLeft, ToggleRight, Activity, Info, Lock,
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

// ─── Types ─────────────────────────────────────────��──────────────────────────

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

// Group labels for the summary panel
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
  key_prefix:          string;       // first 12 chars — safe to display
  key_hash:            string;       // SHA-256 of full key
  is_active:           boolean;
  is_deleted:          boolean;
  scopes:              Scope[];
  created_at:          number;       // Unix ms
  expires_at:          number;       // Unix ms  (0 = never)
  last_used_at:        number;       // Unix ms
  request_count:       number;       // lifetime total
  request_count_today: number;
  scope_counts:        Partial<Record<Scope, number>>;       // lifetime per-scope
  scope_counts_today:  Partial<Record<Scope, number>>;
}

const STORAGE_KEY = "int_api_keys_v1";

// ─── Sync Server ─────────────────────────────────

async function syncToServer(keys: IntegrationKey[]): Promise<void> {
  try {
    await fetch("/api/integration/sync", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ keys }),
    });
  } catch {
    // Non-fatal — sync best-effort
  }
}

// ─── Crypto helpers ───────────────────────────────────────────────────────────

function genRawKey(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return "kyk_" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function sha256hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

function loadKeys(): IntegrationKey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as IntegrationKey[];
    // Back-fill scope_counts for older records
    return parsed.map((k) => ({
      ...k,
      scope_counts:       k.scope_counts       ?? {},
      scope_counts_today: k.scope_counts_today ?? {},
    }));
  } catch { return []; }
}

function persistKeys(keys: IntegrationKey[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatPill({ label, value, accent }: { label: string; value: number | string; accent: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${accent}`}>
      <p className="text-2xl font-bold tabular-nums text-white">{typeof value === "number" ? value.toLocaleString() : value}</p>
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
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggle(d.id)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                    active
                      ? "bg-emerald-900/40 border-emerald-700 text-emerald-300"
                      : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                  }`}
                >
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

// ─── New Integration Key Dialog ───────────────────────────────────────────────

function NewIntegrationKeyDialog({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (key: IntegrationKey) => void;
}) {
  const { toast } = useToast();
  const [form, setForm]       = useState({ name: "", description: "", organization: "", expires_days: "365" });
  const [scopes, setScopes]   = useState<Scope[]>(["kyc:read", "certificates:verify"]);
  const [creating, setCreating] = useState(false);
  const [result, setResult]   = useState<{ key: IntegrationKey; fullKey: string } | null>(null);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ name: "", description: "", organization: "", expires_days: "365" });
      setScopes(["kyc:read", "certificates:verify"]);
      setResult(null); setCopied(false);
    }
  }, [open]);

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

      const existing = loadKeys();
      persistKeys([...existing, entry]);
      syncToServer([...existing, entry]);
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
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-[50rem] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-emerald-400" />New Integration API Key
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            External systems call{" "}
            <code className="text-cyan-400">/api/integration/&lt;feature&gt;</code>{" "}
            with this key. Next.js validates and proxies to Go — Go never sees the raw key.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 mt-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-gray-300 text-sm">Key Name <span className="text-red-400">*</span></Label>
                <Input
                  placeholder="loan-service-prod"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-gray-300 text-sm">Organization</Label>
                <Input
                  placeholder="ABA Bank Ltd."
                  value={form.organization}
                  onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-gray-300 text-sm">Description</Label>
                <Input
                  placeholder="Loan approval workflow integration"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-gray-300 text-sm">Expiry</Label>
                <Select value={form.expires_days} onValueChange={(v) => setForm((f) => ({ ...f, expires_days: v }))}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-800">
                    {[["30","30 days"],["90","90 days"],["180","180 days"],["365","1 year"],["730","2 years"],["0","Never"]].map(([v,l]) => (
                      <SelectItem key={v} value={v} className="text-gray-300">{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-gray-300 text-sm">
                Permissions <span className="text-red-400">*</span>
              </Label>
              <ScopePicker value={scopes} onChange={setScopes} />
            </div>

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
                <p className="text-xs text-amber-400/80 mt-0.5">Shown only once. Stored as a SHA-256 hash — cannot be recovered.</p>
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
                { label: "Key ID",      value: result.key.id.slice(0, 20) + "…" },
                { label: "Prefix",      value: result.key.key_prefix + "…"     },
                { label: "Permissions", value: `${result.key.scopes.length} granted` },
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

  const handleSave = () => {
    if (!editKey) return;
    if (!scopes.length) { toast({ title: "Select at least one permission", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const all = loadKeys();
      const upd = all.map((k) => k.id === editKey.id ? { ...k, scopes } : k);
      persistKeys(upd);
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

// ─── Per-API Summary Panel ─────────────────────────────────────────────────────

function ApiSummaryPanel({ keys }: { keys: IntegrationKey[] }) {
  const live = keys.filter((k) => !k.is_deleted);

  // Aggregate per-scope lifetime + today counts
  const totals = SCOPE_DEFS.reduce<Record<Scope, { lifetime: number; today: number }>>((acc, d) => {
    acc[d.id] = {
      lifetime: live.reduce((s, k) => s + (k.scope_counts?.[d.id] ?? 0), 0),
      today:    live.reduce((s, k) => s + (k.scope_counts_today?.[d.id] ?? 0), 0),
    };
    return acc;
  }, {} as Record<Scope, { lifetime: number; today: number }>);

  // Group
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
            <span>
              <span className="text-white font-semibold tabular-nums">{grandTotal.toLocaleString()}</span> lifetime
            </span>
            <span>
              <span className="text-cyan-400 font-semibold tabular-nums">{grandTotalToday.toLocaleString()}</span> today
            </span>
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
                {/* Per-scope breakdown */}
                <div className="mt-2 space-y-1 border-t border-white/10 pt-2">
                  {defs.map((d) => (
                    <div key={d.id} className="flex justify-between items-center text-xs">
                      <span className="opacity-60 truncate">{d.label.replace(group + " ", "")}</span>
                      <span className="tabular-nums font-medium text-white ml-1">
                        {(totals[d.id].lifetime).toLocaleString()}
                      </span>
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
  const [intSearch,   setIntSearch]   = useState("");
  const [showDeleted, setShowDeleted] = useState(false);
  const [visiblePfx,  setVisiblePfx]  = useState<Set<string>>(new Set());

  // Auto-refresh
  const [refreshMs,   setRefreshMs]   = useState(0);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load ──────────────────────────────────────────────────────────────────
  const fetchIntKeys = useCallback(() => {
    setIntLoading(true);
    try { setIntKeys(loadKeys()); }
    catch { setIntKeys([]); }
    finally { setIntLoading(false); }
  }, []);

  useEffect(() => { fetchIntKeys(); }, [fetchIntKeys]);

  // ── Auto-sync localStorage → server on page load ──────────────────────────
  // This creates/updates .int_keys_store.json so the gateway route can
  // validate keys. Runs once when admin visits the Keys page.
  useEffect(() => {
    const keys = loadKeys();
    if (keys.length > 0) {
      syncToServer(keys).then(() => {
        console.log("[keys] synced", keys.length, "key(s) to server store");
      });
    }
  }, []); // ← empty deps = runs once on mount only

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

  // ── Mutations ─────────────────────────────────────────────────────────────
  const mutateIntKey = (id: string, patch: Partial<IntegrationKey>) => {
    setIntKeys((prev) => {
      const updated = prev.map((k) => k.id === id ? { ...k, ...patch } : k);
      persistKeys(updated);
      syncToServer(updated);
      return updated;
    });
  };

  const toggleActive = (k: IntegrationKey) => {
    mutateIntKey(k.id, { is_active: !k.is_active });
    toast({ title: k.is_active ? `"${k.name}" disabled` : `"${k.name}" enabled` });
  };

  const softDelete = (k: IntegrationKey) => {
    mutateIntKey(k.id, { is_deleted: true, is_active: false });
    toast({ title: `"${k.name}" deleted (soft)` });
  };

  const restoreKey = (k: IntegrationKey) => {
    mutateIntKey(k.id, { is_deleted: false });
    toast({ title: `"${k.name}" restored` });
  };

  // ── Filtered list ─────────────────────────────────────────────────────────
  const filtered = intKeys.filter((k) => {
    if (!showDeleted && k.is_deleted) return false;
    const q = intSearch.toLowerCase();
    return !q
      || k.name.toLowerCase().includes(q)
      || k.organization.toLowerCase().includes(q)
      || k.key_prefix.toLowerCase().includes(q);
  });

  // ── Summary stats ─────────────────────────────────────────────────────────
  const live = intKeys.filter((k) => !k.is_deleted);
  const stats = {
    total:      live.length,
    active:     live.filter((k) => k.is_active).length,
    disabled:   live.filter((k) => !k.is_active).length,
    deleted:    intKeys.filter((k) => k.is_deleted).length,
    totalReqs:  live.reduce((s, k) => s + k.request_count, 0),
    todayReqs:  live.reduce((s, k) => s + k.request_count_today, 0),
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Zap className="h-6 w-6 text-emerald-400" />Integration API Keys
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Proxy keys for external systems — scoped, togglable, and tracked per feature
            </p>
          </div>

          {/* Controls */}
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
              <span className="text-xs text-gray-600 hidden sm:block">
                {format(lastRefresh, "HH:mm:ss")}
              </span>
            )}
            <Button onClick={() => setShowNew(true)} size="sm" className="h-8 bg-emerald-700 hover:bg-emerald-600 text-white">
              <Plus className="h-4 w-4 mr-1.5" />New Key
            </Button>
          </div>
        </div>

        {/* Summary stat pills */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatPill label="Total Keys"     value={stats.total}     accent="bg-gray-800/60 border-gray-700"          />
          <StatPill label="Active"         value={stats.active}    accent="bg-emerald-900/20 border-emerald-800/40"  />
          <StatPill label="Disabled"       value={stats.disabled}  accent="bg-gray-800/40 border-gray-700"           />
          <StatPill label="Deleted"        value={stats.deleted}   accent="bg-red-900/20 border-red-800/40"          />
          <StatPill label="Total Requests" value={stats.totalReqs} accent="bg-cyan-900/20 border-cyan-800/40"        />
          <StatPill label="Today"          value={stats.todayReqs} accent="bg-blue-900/20 border-blue-800/40"        />
        </div>

        {/* Per-API request summary */}
        <ApiSummaryPanel keys={intKeys} />

        {/* Keys table */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3 border-b border-gray-800 pt-4 px-4">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                <Input
                  placeholder="Search name, org, prefix…"
                  value={intSearch}
                  onChange={(e) => setIntSearch(e.target.value)}
                  className="pl-8 h-8 text-sm bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>
              <button
                onClick={() => setShowDeleted((p) => !p)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  showDeleted
                    ? "bg-red-900/20 border-red-800/40 text-red-400"
                    : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                }`}
              >
                <Trash2 className="h-3 w-3" />
                {showDeleted ? "Hide Deleted" : "Show Deleted"}
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
                      {[...Array(8)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <div className="flex flex-col items-center gap-2">
                        <Zap className="h-8 w-8 text-gray-700" />
                        <p className="text-gray-500 text-sm">
                          {intSearch ? "No keys match your search"
                           : showDeleted ? "No keys (including deleted)"
                           : "No integration API keys yet"}
                        </p>
                        {!intSearch && (
                          <Button onClick={() => setShowNew(true)} size="sm" variant="outline" className="border-gray-700 text-gray-400 hover:text-white mt-1">
                            <Plus className="h-3.5 w-3.5 mr-1.5" />Create first key
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((k) => {
                    const isExpired  = k.expires_at > 0 && k.expires_at < Date.now();
                    const pfxVisible = visiblePfx.has(k.id);
                    const togglePfx  = () => setVisiblePfx((p) => {
                      const n = new Set(p); n.has(k.id) ? n.delete(k.id) : n.add(k.id); return n;
                    });
                    const daysLeft = k.expires_at > 0
                      ? Math.floor((k.expires_at - Date.now()) / 86_400_000)
                      : null;

                    return (
                      <TableRow
                        key={k.id}
                        className={`border-gray-800 hover:bg-gray-800/30 ${k.is_deleted ? "opacity-40" : ""}`}
                      >
                        {/* Name */}
                        <TableCell className="pl-4 py-3.5">
                          <p className="text-sm font-medium text-white flex items-center gap-1.5">
                            {k.name}
                            {k.is_deleted && (
                              <span className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 px-1.5 py-0.5 rounded">deleted</span>
                            )}
                            {isExpired && !k.is_deleted && (
                              <span className="text-xs text-amber-400 bg-amber-950/40 border border-amber-900/50 px-1.5 py-0.5 rounded">expired</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">{k.organization || "—"}</p>
                          {k.description && (
                            <p className="text-xs text-gray-600 mt-0.5 truncate max-w-[180px]">{k.description}</p>
                          )}
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
                                  <div className="space-y-1">
                                    {k.scopes.slice(3).map((s) => <p key={s}>{s}</p>)}
                                  </div>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
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

                        {/* Enable / Disable toggle */}
                        <TableCell className="py-3.5">
                          {k.is_deleted ? (
                            <span className="text-xs text-red-400/60">—</span>
                          ) : (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => toggleActive(k)}
                                  className="flex items-center gap-1.5 group"
                                >
                                  {k.is_active ? (
                                    <>
                                      <ToggleRight className="h-6 w-6 text-emerald-400 group-hover:text-emerald-300 transition-colors" />
                                      <span className="text-xs text-emerald-400">On</span>
                                    </>
                                  ) : (
                                    <>
                                      <ToggleLeft className="h-6 w-6 text-gray-600 group-hover:text-gray-400 transition-colors" />
                                      <span className="text-xs text-gray-500">Off</span>
                                    </>
                                  )}
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
                                    onClick={() => setEditKey(k)}
                                  >
                                    <Settings className="h-3.5 w-3.5 mr-2" />Edit Permissions
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    className="text-gray-300 hover:text-white focus:text-white focus:bg-gray-800 cursor-pointer text-sm"
                                    onClick={() => toggleActive(k)}
                                  >
                                    {k.is_active
                                      ? <><ToggleLeft  className="h-3.5 w-3.5 mr-2" />Disable Key</>
                                      : <><ToggleRight className="h-3.5 w-3.5 mr-2" />Enable Key</>}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator className="bg-gray-800" />
                                  <DropdownMenuItem
                                    className="text-red-400 hover:text-red-300 focus:text-red-300 focus:bg-red-900/20 cursor-pointer text-sm"
                                    onClick={() => softDelete(k)}
                                  >
                                    <Trash2 className="h-3.5 w-3.5 mr-2" />Delete Key
                                  </DropdownMenuItem>
                                </>
                              )}
                              {k.is_deleted && (
                                <DropdownMenuItem
                                  className="text-emerald-400 hover:text-emerald-300 focus:text-emerald-300 focus:bg-emerald-900/20 cursor-pointer text-sm"
                                  onClick={() => restoreKey(k)}
                                >
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
                <p className="text-xs text-gray-700">Stored in browser · not synced to Go backend</p>
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
              External systems send the key in{" "}
              <code className="text-cyan-400">Authorization: Bearer &lt;key&gt;</code>{" "}
              to <code className="text-cyan-400">POST /api/integration/&lt;feature&gt;</code> on this Next.js server.
            </p>
            <p>
              Next.js validates the SHA-256 hash, checks the key's scopes, increments per-scope request counters,
              then proxies the request to the Go backend with the system JWT.
              The raw key is <span className="text-white font-medium">never sent to Go</span> and never stored in plain text.
            </p>
            <p className="text-gray-600">
              For certificate signing keys (ECDSA / RSA), see the <span className="text-cyan-400">Certificates</span> page.
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
    </TooltipProvider>
  );
}