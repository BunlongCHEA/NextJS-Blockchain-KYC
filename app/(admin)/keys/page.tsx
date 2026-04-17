"use client";

/**
 * Keys Management — /app/(admin)/keys/page.tsx
 * ─────────────────────────────────────────────
 *
 * Section 1 · Requester Keys
 *   Source : Go backend  GET /api/v1/keys
 *   Actions: View detail (GET /api/v1/keys/info) · Revoke (POST /api/v1/keys/revoke, admin)
 *
 * Section 2 · Integration API Keys
 *   Source : window.storage (persistent browser KV — no Go changes needed)
 *   Purpose: External systems call  POST /api/integration/<feature>  on the Next.js server.
 *            Next.js validates the hashed key + permission scope, then proxies to Go.
 *   Features:
 *     - Generate key (kyk_ prefix, SHA-256 hash stored, full key shown once)
 *     - Permission checkboxes per feature (kyc, blockchain, certificates, audit, logs)
 *     - Enable / Disable toggle (is_active)
 *     - Soft-delete (is_deleted = true, no hard delete)
 *     - Per-key request stats  (request_count, request_count_today, last_used_at)
 *     - Auto-refresh selector  (manual / 10s / 30s / 60s)
 */

import {
  useEffect, useState, useCallback, useRef,
} from "react";
import {
  Key, Plus, RefreshCw, Eye, EyeOff, ShieldX, ShieldCheck,
  Copy, Loader2, AlertTriangle, CheckCircle2, XCircle, Search,
  MoreHorizontal, Clock, Trash2, Building2, Zap, Settings,
  FileText, Database, Blocks, BarChart3, AlertCircle, Info,
  ToggleLeft, ToggleRight, Lock, Activity,
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
import api from "@/lib/api";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

// ─── Types ─────────────────────────────────────────────────────────────────────

/** From Go  GET /api/v1/keys  and  GET /api/v1/keys/info */
interface RequesterKey {
  id:             string;
  key_name:       string;
  key_type:       string;
  key_size:       number;
  public_key_pem: string;
  fingerprint:    string;
  organization:   string;
  email:          string;
  description:    string;
  is_active:      boolean;
  created_at:     number;   // Unix seconds
  expires_at:     number;   // Unix seconds
  created_by:     string;
  last_used_at?:  number;
  revoked_at?:    number;
}

/** Feature scopes an Integration API key may be granted */
type Scope =
  | "kyc:read"    | "kyc:verify"
  | "blockchain:read" | "blockchain:mine"
  | "certificates:issue" | "certificates:verify"
  | "audit:read";

interface ScopeDef { id: Scope; label: string; icon: React.ElementType; group: string }

const SCOPE_DEFS: ScopeDef[] = [
  { id: "kyc:read",             label: "KYC Read",           icon: FileText,     group: "KYC"          },
  { id: "kyc:verify",           label: "KYC Verify",         icon: ShieldCheck,  group: "KYC"          },
  { id: "blockchain:read",      label: "Blockchain Read",    icon: Blocks,       group: "Blockchain"   },
  { id: "blockchain:mine",      label: "Blockchain Mine",    icon: Database,     group: "Blockchain"   },
  { id: "certificates:issue",   label: "Issue Certificate",  icon: Lock,         group: "Certificates" },
  { id: "certificates:verify",  label: "Verify Certificate", icon: CheckCircle2, group: "Certificates" },
  { id: "audit:read",           label: "Audit Logs",         icon: BarChart3,    group: "Audit"        },
];

/** Stored in window.storage as JSON — no Go backend involvement */
interface IntegrationKey {
  id:                  string;   // crypto.randomUUID()
  name:                string;
  description:         string;
  organization:        string;
  key_prefix:          string;   // first 12 chars — safe to display
  key_hash:            string;   // SHA-256 of full key — used for validation
  is_active:           boolean;
  is_deleted:          boolean;
  scopes:              Scope[];
  created_at:          number;   // Unix ms
  expires_at:          number;   // Unix ms  (0 = never)
  last_used_at:        number;   // Unix ms
  request_count:       number;
  request_count_today: number;
}

const STORAGE_KEY = "int_api_keys_v1";

// ─── Crypto helpers ─────────────────────────────────────────────────────────

function genRawKey(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return "kyk_" + Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Storage helpers ─────────────────────────────────────────────────────────

async function loadKeys(): Promise<IntegrationKey[]> {
  try {
    const r = await window.storage.get(STORAGE_KEY);
    return r ? (JSON.parse(r.value) as IntegrationKey[]) : [];
  } catch { return []; }
}

async function persistKeys(keys: IntegrationKey[]): Promise<void> {
  await window.storage.set(STORAGE_KEY, JSON.stringify(keys));
}

// ─── Shared sub-components ───────────────────────────────────────────────────

function StatPill({
  label, value, accent,
}: { label: string; value: number | string; accent: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${accent}`}>
      <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
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
      <Icon className="h-2.5 w-2.5" />{def.label}
    </span>
  );
}

// ─── Section 1 — Requester Key Detail Dialog ─────────────────────────────────

function RequesterKeyDetailDialog({
  keyId, onClose, onRevoke,
}: {
  keyId: string | null;
  onClose: () => void;
  onRevoke: (key: RequesterKey) => void;
}) {
  const { toast }             = useToast();
  const [data, setData]       = useState<RequesterKey | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPub, setShowPub] = useState(false);

  useEffect(() => {
    if (!keyId) { setData(null); return; }
    setLoading(true); setShowPub(false);
    api.get("/api/v1/keys/info", { params: { key_id: keyId } })
      .then((res) => setData(res.data?.data?.key ?? res.data?.data ?? null))
      .catch(()  => toast({ title: "Failed to load key", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [keyId]);

  const copy = (txt: string) => { navigator.clipboard.writeText(txt); toast({ title: "Copied" }); };

  const daysLeft = data ? differenceInDays(data.expires_at * 1000, Date.now()) : 0;
  const expiryColor = daysLeft < 0 ? "text-red-400" : daysLeft <= 30 ? "text-amber-400" : "text-emerald-400";

  return (
    <Dialog open={!!keyId} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Key className="h-4 w-4 text-violet-400" />Requester Key Details
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            <code className="text-cyan-400">GET /api/v1/keys/info?key_id={keyId?.slice(0, 14)}…</code>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2 py-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-4 w-full bg-gray-800" />)}
          </div>
        ) : data ? (
          <div className="space-y-4 mt-1">
            {/* Status banner */}
            <div className={`flex items-center justify-between rounded-lg border px-3.5 py-2.5 ${
              data.is_active
                ? "bg-emerald-950/20 border-emerald-800/40"
                : "bg-red-950/20 border-red-800/40"
            }`}>
              <div className="flex items-center gap-2">
                {data.is_active
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  : <XCircle      className="h-4 w-4 text-red-400"     />}
                <span className={`text-sm font-medium ${data.is_active ? "text-emerald-300" : "text-red-300"}`}>
                  {data.is_active ? "Active" : "Revoked"}
                </span>
              </div>
              <span className={`text-xs ${expiryColor}`}>
                {daysLeft < 0 ? `Expired ${Math.abs(daysLeft)}d ago`
                 : daysLeft <= 30 ? `Expires in ${daysLeft}d`
                 : "Valid"}
              </span>
            </div>

            {/* Field list */}
            <div className="bg-gray-800/40 rounded-lg border border-gray-700/50 px-4 py-1">
              {[
                { label: "Key ID",       value: data.id,            mono: true },
                { label: "Name",         value: data.key_name                  },
                { label: "Type / Size",  value: `${data.key_type} ${data.key_size}-bit` },
                { label: "Fingerprint",  value: data.fingerprint,   mono: true },
                { label: "Organization", value: data.organization               },
                { label: "Email",        value: data.email                     },
                { label: "Description",  value: data.description               },
                { label: "Created",      value: data.created_at  ? format(new Date(data.created_at  * 1000), "MMM d, yyyy HH:mm") : "—" },
                { label: "Expires",      value: data.expires_at  ? format(new Date(data.expires_at  * 1000), "MMM d, yyyy")        : "—" },
                { label: "Last Used",    value: data.last_used_at ? formatDistanceToNow(data.last_used_at * 1000, { addSuffix: true }) : "Never" },
                { label: "Created By",   value: data.created_by,   mono: true },
              ].filter((f) => f.value && f.value !== "—").map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between items-center py-2 border-b border-gray-800/60 last:border-0">
                  <span className="text-xs text-gray-500 w-24 shrink-0">{label}</span>
                  <div className="flex items-center gap-1.5 min-w-0 justify-end flex-1">
                    <span className={`text-xs text-right break-all ${mono ? "font-mono text-cyan-400" : "text-gray-200"}`}>{value}</span>
                    {mono && <button onClick={() => copy(value!)} className="text-gray-700 hover:text-gray-300 shrink-0"><Copy className="h-3 w-3" /></button>}
                  </div>
                </div>
              ))}
            </div>

            {/* Public key toggle */}
            <div>
              <button
                onClick={() => setShowPub((p) => !p)}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300"
              >
                {showPub ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                {showPub ? "Hide" : "Show"} Public Key PEM
              </button>
              {showPub && data.public_key_pem && (
                <div className="mt-2 relative">
                  <pre className="bg-gray-950 rounded-lg border border-gray-800 p-3 font-mono text-xs text-cyan-400 overflow-auto max-h-28 whitespace-pre-wrap break-all">
                    {data.public_key_pem}
                  </pre>
                  <button onClick={() => copy(data.public_key_pem)} className="absolute top-2 right-2 text-gray-600 hover:text-gray-300">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-between pt-1">
              <Button
                variant="outline" size="sm"
                disabled={!data.is_active}
                onClick={() => data.is_active && onRevoke(data)}
                className="border-red-900/50 text-red-400 hover:bg-red-900/20 disabled:opacity-40 text-xs"
              >
                <ShieldX className="h-3.5 w-3.5 mr-1.5" />
                {data.is_active ? "Revoke Key" : "Already Revoked"}
              </Button>
              <Button size="sm" onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white text-xs">
                Close
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-gray-500 text-sm text-center py-8">Key not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Section 1 — Revoke Confirm Dialog ───────────────────────────────────────

function RevokeConfirmDialog({
  keyToRevoke, onClose, onRevoked,
}: {
  keyToRevoke: RequesterKey | null;
  onClose: () => void;
  onRevoked: (id: string) => void;
}) {
  const { toast }               = useToast();
  const [reason, setReason]     = useState("");
  const [revoking, setRevoking] = useState(false);

  useEffect(() => { if (keyToRevoke) setReason(""); }, [keyToRevoke]);

  const handleRevoke = async () => {
    if (!keyToRevoke) return;
    setRevoking(true);
    try {
      await api.post("/api/v1/keys/revoke", {
        key_id: keyToRevoke.id,
        reason: reason || "Revoked by admin",
      });
      toast({ title: `"${keyToRevoke.key_name}" revoked` });
      onRevoked(keyToRevoke.id);
      onClose();
    } catch (err: any) {
      toast({ title: err?.response?.data?.error || "Failed to revoke", variant: "destructive" });
    } finally { setRevoking(false); }
  };

  return (
    <Dialog open={!!keyToRevoke} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-400">
            <ShieldX className="h-5 w-5" />Revoke Requester Key
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            <code className="text-cyan-400">POST /api/v1/keys/revoke</code> — admin only. Cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <div className="bg-red-950/20 border border-red-800/40 rounded-lg px-3.5 py-3">
            <p className="text-sm font-medium text-red-300">{keyToRevoke?.key_name}</p>
            <p className="text-xs text-gray-500 mt-0.5">{keyToRevoke?.organization}</p>
            <p className="text-xs font-mono text-gray-600 mt-1">{keyToRevoke?.fingerprint}</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-gray-300 text-sm">
              Reason <span className="text-gray-600 font-normal">(optional)</span>
            </Label>
            <Input
              placeholder="Annual rotation, key compromise…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
            />
          </div>
          <p className="text-xs text-amber-500/80 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            Existing certificates signed with this key remain valid. New issuance will be blocked.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} disabled={revoking} className="border-gray-700 text-gray-300">Cancel</Button>
            <Button onClick={handleRevoke} disabled={revoking} className="bg-red-700 hover:bg-red-600 text-white">
              {revoking
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Revoking…</>
                : <><ShieldX className="h-4 w-4 mr-1.5" />Confirm Revoke</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Section 2 — Scope Picker (reused in New + Edit dialogs) ─────────────────

function ScopePicker({
  value, onChange,
}: { value: Scope[]; onChange: (s: Scope[]) => void }) {
  const toggle = (s: Scope) =>
    onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);

  // Group by group name
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
                  <Icon className="h-3 w-3" />{d.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Section 2 — New Integration Key Dialog ───────────────────────────────────

function NewIntegrationKeyDialog({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (key: IntegrationKey) => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState({ name: "", description: "", organization: "", expires_days: "365" });
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
      const fullKey  = genRawKey();
      const hash     = await sha256(fullKey);
      const now      = Date.now();
      const expDays  = parseInt(form.expires_days) || 365;

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
      };

      const existing = await loadKeys();
      await persistKeys([...existing, entry]);

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
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-emerald-400" />New Integration API Key
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            External systems call <code className="text-cyan-400">/api/integration/&lt;feature&gt;</code>
            {" "}with this key. Next.js validates + proxies to Go — the Go API never sees the key.
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4 mt-1">
            {/* Fields */}
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

            {/* Scopes */}
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
          /* ── Show key once ── */
          <div className="space-y-4 mt-1">
            <div className="flex items-start gap-2.5 bg-amber-950/40 border border-amber-800/50 rounded-lg p-3.5">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300">Copy your key NOW</p>
                <p className="text-xs text-amber-400/80 mt-0.5">This is the only time the full key is shown. It is hashed — cannot be recovered.</p>
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

            <div className="bg-gray-800/30 border border-gray-700/50 rounded-lg px-3.5 py-3 text-xs text-gray-400 space-y-1">
              <p className="text-gray-300 font-medium">Usage</p>
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

// ─── Section 2 — Edit Scopes Dialog ──────────────────────────────────────────

function EditScopesDialog({
  editKey, onClose, onSaved,
}: {
  editKey: IntegrationKey | null;
  onClose: () => void;
  onSaved: (k: IntegrationKey) => void;
}) {
  const { toast }             = useToast();
  const [scopes, setScopes]   = useState<Scope[]>([]);
  const [saving, setSaving]   = useState(false);

  useEffect(() => { if (editKey) setScopes([...editKey.scopes]); }, [editKey]);

  const handleSave = async () => {
    if (!editKey) return;
    if (!scopes.length) { toast({ title: "Select at least one permission", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const all = await loadKeys();
      const upd = all.map((k) => k.id === editKey.id ? { ...k, scopes } : k);
      await persistKeys(upd);
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

// ─── Main Page ────────────────────────────────────────────────────────────────

const REFRESH_OPTIONS = [
  { label: "Off",  ms: 0      },
  { label: "10s",  ms: 10000  },
  { label: "30s",  ms: 30000  },
  { label: "60s",  ms: 60000  },
];

export default function KeysPage() {
  const { toast } = useToast();

  // ── Section 1 state ──────────────────────────────────────────────────────
  const [reqKeys,     setReqKeys]     = useState<RequesterKey[]>([]);
  const [reqLoading,  setReqLoading]  = useState(true);
  const [reqSearch,   setReqSearch]   = useState("");
  const [viewKeyId,   setViewKeyId]   = useState<string | null>(null);
  const [revokeKey,   setRevokeKey]   = useState<RequesterKey | null>(null);

  // ── Section 2 state ──────────────────────────────────────────────────────
  const [intKeys,      setIntKeys]     = useState<IntegrationKey[]>([]);
  const [intLoading,   setIntLoading]  = useState(true);
  const [showNew,      setShowNew]     = useState(false);
  const [editKey,      setEditKey]     = useState<IntegrationKey | null>(null);
  const [intSearch,    setIntSearch]   = useState("");
  const [showDeleted,  setShowDeleted] = useState(false);
  const [visiblePfx,   setVisiblePfx] = useState<Set<string>>(new Set());

  // ── Auto-refresh ─────────────────────────────────────────────────────────
  const [refreshMs,    setRefreshMs]   = useState(0);
  const [lastRefresh,  setLastRefresh] = useState(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Data fetchers ─────────────────────────────────────────────────────────
  const fetchReqKeys = useCallback(async () => {
    setReqLoading(true);
    try {
      const res = await api.get("/api/v1/keys");
      const d   = res.data?.data?.keys ?? res.data?.keys ?? [];
      setReqKeys(Array.isArray(d) ? d : []);
    } catch { setReqKeys([]); }
    finally { setReqLoading(false); }
  }, []);

  const fetchIntKeys = useCallback(async () => {
    setIntLoading(true);
    try { setIntKeys(await loadKeys()); }
    catch { setIntKeys([]); }
    finally { setIntLoading(false); }
  }, []);

  useEffect(() => {
    fetchReqKeys();
    fetchIntKeys();
  }, [fetchReqKeys, fetchIntKeys]);

  // ── Auto-refresh timer ────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (refreshMs > 0) {
      timerRef.current = setInterval(() => {
        fetchReqKeys();
        fetchIntKeys();
        setLastRefresh(new Date());
      }, refreshMs);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [refreshMs, fetchReqKeys, fetchIntKeys]);

  const handleRefresh = () => {
    fetchReqKeys(); fetchIntKeys(); setLastRefresh(new Date());
  };

  // ── Integration key mutations ────────────────────────────────────────────
  const mutateIntKey = async (id: string, patch: Partial<IntegrationKey>) => {
    const updated = intKeys.map((k) => k.id === id ? { ...k, ...patch } : k);
    setIntKeys(updated);
    await persistKeys(updated);
  };

  const toggleActive = async (k: IntegrationKey) => {
    await mutateIntKey(k.id, { is_active: !k.is_active });
    toast({ title: k.is_active ? "Key disabled" : "Key enabled" });
  };

  const softDelete = async (k: IntegrationKey) => {
    await mutateIntKey(k.id, { is_deleted: true, is_active: false });
    toast({ title: `"${k.name}" deleted` });
  };

  // ── Filtered lists ────────────────────────────────────────────────────────
  const filteredReq = reqKeys.filter((k) => {
    const q = reqSearch.toLowerCase();
    return !q
      || k.key_name.toLowerCase().includes(q)
      || k.organization.toLowerCase().includes(q)
      || k.fingerprint.toLowerCase().includes(q);
  });

  const filteredInt = intKeys.filter((k) => {
    if (!showDeleted && k.is_deleted) return false;
    const q = intSearch.toLowerCase();
    return !q
      || k.name.toLowerCase().includes(q)
      || k.organization.toLowerCase().includes(q)
      || k.key_prefix.toLowerCase().includes(q);
  });

  // ── Summary stats ─────────────────────────────────────────────────────────
  const reqStats = {
    total:        reqKeys.length,
    active:       reqKeys.filter((k) => k.is_active).length,
    expiringSoon: reqKeys.filter((k) => {
      const d = differenceInDays(k.expires_at * 1000, Date.now());
      return d >= 0 && d <= 30;
    }).length,
    expired: reqKeys.filter((k) =>
      k.expires_at && differenceInDays(k.expires_at * 1000, Date.now()) < 0
    ).length,
  };

  const liveInt = intKeys.filter((k) => !k.is_deleted);
  const intStats = {
    total:      liveInt.length,
    active:     liveInt.filter((k) => k.is_active).length,
    totalReqs:  liveInt.reduce((s, k) => s + k.request_count, 0),
    todayReqs:  liveInt.reduce((s, k) => s + k.request_count_today, 0),
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <TooltipProvider>
      <div className="space-y-8">

        {/* ── Page header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Key className="h-6 w-6 text-violet-400" />Keys Management
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Certificate signing keys (Go backend) and integration API keys (Next.js middleware)
            </p>
          </div>

          {/* Auto-refresh + manual refresh */}
          <div className="flex items-center gap-2">
            <Select value={String(refreshMs)} onValueChange={(v) => setRefreshMs(Number(v))}>
              <SelectTrigger className="w-[90px] h-8 text-xs bg-gray-800 border-gray-700 text-gray-300">
                <Clock className="h-3 w-3 mr-1 shrink-0" />
                <SelectValue />
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
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 1 — REQUESTER KEYS  (Go backend)
        ══════════════════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Lock className="h-4 w-4 text-violet-400" />Requester Keys
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              ECDSA / RSA key pairs used for certificate signing — managed by the Go backend
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatPill label="Total"         value={reqStats.total}        accent="bg-gray-800/60 border-gray-700"         />
            <StatPill label="Active"        value={reqStats.active}       accent="bg-emerald-900/20 border-emerald-800/40" />
            <StatPill label="Expiring ≤30d" value={reqStats.expiringSoon} accent="bg-amber-900/20 border-amber-800/40"    />
            <StatPill label="Expired"       value={reqStats.expired}      accent="bg-red-900/20 border-red-800/40"        />
          </div>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-3 border-b border-gray-800 pt-4 px-4">
              <div className="relative max-w-xs">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                <Input
                  placeholder="Search name, org, fingerprint…"
                  value={reqSearch}
                  onChange={(e) => setReqSearch(e.target.value)}
                  className="pl-8 h-8 text-sm bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-500 text-xs uppercase pl-4">Name / Org</TableHead>
                    <TableHead className="text-gray-500 text-xs uppercase">Type</TableHead>
                    <TableHead className="text-gray-500 text-xs uppercase hidden md:table-cell">Fingerprint</TableHead>
                    <TableHead className="text-gray-500 text-xs uppercase">Status</TableHead>
                    <TableHead className="text-gray-500 text-xs uppercase">Expires</TableHead>
                    <TableHead className="text-right text-gray-500 text-xs uppercase pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reqLoading ? (
                    [...Array(3)].map((_, i) => (
                      <TableRow key={i} className="border-gray-800">
                        {[...Array(6)].map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredReq.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-12 text-gray-500 text-sm">
                        {reqSearch ? "No keys match your search" : "No requester keys — generate from the Certificates page"}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredReq.map((k) => {
                      const daysLeft   = differenceInDays(k.expires_at * 1000, Date.now());
                      const expiryClr  = daysLeft < 0 ? "text-red-400" : daysLeft <= 30 ? "text-amber-400" : "text-gray-400";
                      return (
                        <TableRow key={k.id} className="border-gray-800 hover:bg-gray-800/30">
                          <TableCell className="pl-4 py-3.5">
                            <p className="text-sm font-medium text-white">{k.key_name}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{k.organization}</p>
                          </TableCell>
                          <TableCell className="py-3.5">
                            <span className="text-xs font-mono text-cyan-400">{k.key_type}-{k.key_size}</span>
                          </TableCell>
                          <TableCell className="py-3.5 hidden md:table-cell">
                            <span className="text-xs font-mono text-gray-500 truncate max-w-[180px] block">{k.fingerprint}</span>
                          </TableCell>
                          <TableCell className="py-3.5">
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${
                              k.is_active
                                ? "bg-emerald-900/30 border-emerald-800 text-emerald-300"
                                : "bg-red-900/30 border-red-800 text-red-300"
                            }`}>
                              {k.is_active ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                              {k.is_active ? "Active" : "Revoked"}
                            </span>
                          </TableCell>
                          <TableCell className="py-3.5">
                            <p className={`text-sm ${expiryClr}`}>
                              {k.expires_at ? format(new Date(k.expires_at * 1000), "MMM d, yyyy") : "—"}
                            </p>
                            {k.expires_at && (
                              <p className="text-xs text-gray-600 mt-0.5">
                                {daysLeft < 0 ? `${Math.abs(daysLeft)}d ago` : `in ${daysLeft}d`}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="pr-4 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost" size="icon"
                                    className="h-7 w-7 text-gray-500 hover:text-white"
                                    onClick={() => setViewKeyId(k.id)}
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent className="bg-gray-800 border-gray-700 text-xs">View details</TooltipContent>
                              </Tooltip>
                              {k.is_active && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost" size="icon"
                                      className="h-7 w-7 text-red-500/70 hover:text-red-400"
                                      onClick={() => setRevokeKey(k)}
                                    >
                                      <ShieldX className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent className="bg-gray-800 border-gray-700 text-xs">Revoke key</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              {!reqLoading && filteredReq.length > 0 && (
                <div className="px-4 py-2.5 border-t border-gray-800">
                  <p className="text-xs text-gray-600">
                    {filteredReq.length} of {reqKeys.length} keys{reqSearch && " (filtered)"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            SECTION 2 — INTEGRATION API KEYS  (Next.js middleware layer)
        ══════════════════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Zap className="h-4 w-4 text-emerald-400" />Integration API Keys
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Keys for external systems to call the Next.js API middleware — proxied to Go backend
              </p>
            </div>
            <Button onClick={() => setShowNew(true)} size="sm" className="bg-emerald-700 hover:bg-emerald-600 text-white">
              <Plus className="h-4 w-4 mr-1.5" />New API Key
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatPill label="Total Keys"     value={intStats.total}     accent="bg-gray-800/60 border-gray-700"          />
            <StatPill label="Active"         value={intStats.active}    accent="bg-emerald-900/20 border-emerald-800/40"  />
            <StatPill label="Total Requests" value={intStats.totalReqs} accent="bg-cyan-900/20 border-cyan-800/40"        />
            <StatPill label="Today"          value={intStats.todayReqs} accent="bg-blue-900/20 border-blue-800/40"        />
          </div>

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
                    <TableHead className="text-gray-500 text-xs uppercase">Enabled</TableHead>
                    <TableHead className="text-gray-500 text-xs uppercase hidden sm:table-cell">Expires</TableHead>
                    <TableHead className="text-right text-gray-500 text-xs uppercase pr-4">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {intLoading ? (
                    [...Array(3)].map((_, i) => (
                      <TableRow key={i} className="border-gray-800">
                        {[...Array(7)].map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredInt.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-12">
                        <div className="flex flex-col items-center gap-2">
                          <Zap className="h-8 w-8 text-gray-700" />
                          <p className="text-gray-500 text-sm">
                            {intSearch ? "No keys match your search"
                             : showDeleted ? "No keys (including deleted)"
                             : "No integration API keys yet"}
                          </p>
                          {!intSearch && (
                            <Button
                              onClick={() => setShowNew(true)}
                              size="sm" variant="outline"
                              className="border-gray-700 text-gray-400 hover:text-white mt-1"
                            >
                              <Plus className="h-3.5 w-3.5 mr-1.5" />Create first key
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredInt.map((k) => {
                      const daysLeft  = k.expires_at > 0 ? differenceInDays(k.expires_at, Date.now()) : null;
                      const isExpired = daysLeft !== null && daysLeft < 0;
                      const pfxVisible = visiblePfx.has(k.id);
                      const togglePfx  = () => setVisiblePfx((p) => {
                        const n = new Set(p); n.has(k.id) ? n.delete(k.id) : n.add(k.id); return n;
                      });

                      return (
                        <TableRow
                          key={k.id}
                          className={`border-gray-800 hover:bg-gray-800/30 ${k.is_deleted ? "opacity-40" : ""}`}
                        >
                          {/* Name */}
                          <TableCell className="pl-4 py-3.5">
                            <div className="flex items-center gap-2">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-white flex items-center gap-1.5">
                                  {k.name}
                                  {k.is_deleted && (
                                    <span className="text-xs text-red-400 bg-red-950/40 border border-red-900/50 px-1.5 py-0.5 rounded">
                                      deleted
                                    </span>
                                  )}
                                </p>
                                <p className="text-xs text-gray-500 mt-0.5">{k.organization || "—"}</p>
                              </div>
                            </div>
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
                              {k.scopes.slice(0, 3).map((s) => (
                                <ScopeBadge key={s} scope={s} />
                              ))}
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

                          {/* Enable/Disable toggle */}
                          <TableCell className="py-3.5">
                            {k.is_deleted ? (
                              <span className="text-xs text-red-400/60">—</span>
                            ) : (
                              <button
                                onClick={() => toggleActive(k)}
                                className="flex items-center gap-1.5 group"
                              >
                                {k.is_active ? (
                                  <>
                                    <ToggleRight className="h-5 w-5 text-emerald-400 group-hover:text-emerald-300" />
                                    <span className="text-xs text-emerald-400">On</span>
                                  </>
                                ) : (
                                  <>
                                    <ToggleLeft className="h-5 w-5 text-gray-600 group-hover:text-gray-400" />
                                    <span className="text-xs text-gray-500">Off</span>
                                  </>
                                )}
                              </button>
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
                            {!k.is_deleted && (
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-white">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent className="bg-gray-900 border-gray-800" align="end">
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
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
              {!intLoading && filteredInt.length > 0 && (
                <div className="px-4 py-2.5 border-t border-gray-800 flex items-center justify-between">
                  <p className="text-xs text-gray-600">
                    {filteredInt.filter((k) => !k.is_deleted).length} active
                    {showDeleted && ` · ${filteredInt.filter((k) => k.is_deleted).length} deleted`}
                  </p>
                  <p className="text-xs text-gray-700">
                    Stored in browser · not synced to Go
                  </p>
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
                External systems send the key in the <code className="text-cyan-400">Authorization: Bearer &lt;key&gt;</code> header
                to <code className="text-cyan-400">POST /api/integration/&lt;feature&gt;</code> on this Next.js server.
              </p>
              <p>
                Next.js validates the SHA-256 hash, checks the key's permission scopes against the requested feature,
                records the request count, then proxies to the Go backend using the system's own JWT.
                The raw key never leaves this browser and is never sent to Go.
              </p>
            </div>
          </div>
        </section>
      </div>

      {/* ── Dialogs ── */}
      <RequesterKeyDetailDialog
        keyId={viewKeyId}
        onClose={() => setViewKeyId(null)}
        onRevoke={(k) => { setViewKeyId(null); setRevokeKey(k); }}
      />
      <RevokeConfirmDialog
        keyToRevoke={revokeKey}
        onClose={() => setRevokeKey(null)}
        onRevoked={(id) => {
          setReqKeys((prev) => prev.map((k) => k.id === id ? { ...k, is_active: false } : k));
        }}
      />
      <NewIntegrationKeyDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        onCreated={(k) => setIntKeys((prev) => [...prev, k])}
      />
      <EditScopesDialog
        editKey={editKey}
        onClose={() => setEditKey(null)}
        onSaved={(updated) => setIntKeys((prev) => prev.map((k) => k.id === updated.id ? updated : k))}
      />
    </TooltipProvider>
  );
}