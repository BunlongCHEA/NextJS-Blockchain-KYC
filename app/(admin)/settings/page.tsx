"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings, Save, Globe, Bell, Database, Shield,
  Search, Mail, Webhook, Loader2, CheckCircle2, AlertCircle,
  User, RefreshCw, ChevronRight, X, Radio, Lock, Unlock,
  KeyRound, AlertTriangle, Clock, RotateCw, Users,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UserRow {
  id:       string;
  username: string;
  email:    string;
  role:     string;
  bank_id?: string;
  is_active: boolean;
}

interface AlertConfig {
  userId:   string;
  email:    string;
  webhook:  string;
}

interface SigningKeyRow {
  KeyID:     string;
  KeyType:   string;
  KeySize:   number;
  IsActive:  boolean;
  ValidFrom: number;
  ValidUntil?: number;
  RetiredAt?: number;
  CreatedAt: number;
  CreatedBy?: string;
}

interface KEKRow {
  KEKID:     string;
  IsActive:  boolean;
  CreatedAt: number;
  RetiredAt?: number;
}

const ALERT_CONFIGS_KEY = "kyc_alert_configs";

function loadAlertConfigs(): Record<string, AlertConfig> {
  try {
    const raw = typeof window !== "undefined" ? localStorage.getItem(ALERT_CONFIGS_KEY) : null;
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveAlertConfigs(cfg: Record<string, AlertConfig>) {
  localStorage.setItem(ALERT_CONFIGS_KEY, JSON.stringify(cfg));
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children, icon: Icon, color = "text-blue-400", subtitle }: {
  title: string; children: React.ReactNode; icon: React.ElementType;
  color?: string; subtitle?: string;
}) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-3 pt-4">
        <CardTitle className={`text-white text-sm flex items-center gap-2`}>
          <Icon className={`h-4 w-4 ${color}`}/>{title}
        </CardTitle>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

// ─── Field row ────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-gray-400 text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SECURITY TAB — password policy, emergency lock, force reset, key rotation
// ═════════════════════════════════════════════════════════════════════════════

function SecurityTab() {
  // Password policy
  const [intervalMonths, setIntervalMonths] = useState<number>(3);
  const [policyLoading, setPolicyLoading] = useState(true);
  const [policyUpdatedBy, setPolicyUpdatedBy] = useState<string>("");
  const [policyUpdatedAt, setPolicyUpdatedAt] = useState<string>("");
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Emergency lock
  const [emergencyLocked, setEmergencyLocked] = useState<boolean | null>(null);
  const [lockReason, setLockReason] = useState("");
  const [togglingLock, setTogglingLock] = useState(false);

  // Force reset
  const [confirmForceReset, setConfirmForceReset] = useState(false);
  const [forcingReset, setForcingReset] = useState(false);

  // Key rotation
  const [signingKeys, setSigningKeys] = useState<SigningKeyRow[]>([]);
  const [keks, setKeks] = useState<KEKRow[]>([]);
  const [rotatingSigning, setRotatingSigning] = useState(false);
  const [rotatingKEK, setRotatingKEK] = useState(false);
  const [signAlgo, setSignAlgo] = useState<"ECDSA" | "RSA">("ECDSA");
  const [signSize, setSignSize] = useState<number>(256);

  const fetchPolicy = useCallback(async () => {
    setPolicyLoading(true);
    try {
      const res = await api.get("/api/v1/auth/password-policy");
      const d = res.data?.data;
      setIntervalMonths(d?.interval_months ?? 3);
      setPolicyUpdatedBy(d?.updated_by ?? "");
      setPolicyUpdatedAt(d?.updated_at ?? "");
    } catch {
      /* keep defaults */
    } finally {
      setPolicyLoading(false);
    }
  }, []);

  const fetchLockStatus = useCallback(async () => {
    try {
      const res = await api.get("/api/v1/security/emergency-lock");
      setEmergencyLocked(!!res.data?.data?.locked);
    } catch {
      setEmergencyLocked(false);
    }
  }, []);

  const fetchKeys = useCallback(async () => {
    try {
      const [s, k] = await Promise.all([
        api.get("/api/v1/security/keys/signing").catch(() => ({ data: { data: { keys: [] } } })),
        api.get("/api/v1/security/keys/kek").catch(() => ({ data: { data: { keks: [] } } })),
      ]);
      setSigningKeys(s.data?.data?.keys ?? []);
      setKeks(k.data?.data?.keks ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    fetchPolicy();
    fetchLockStatus();
    fetchKeys();
  }, [fetchPolicy, fetchLockStatus, fetchKeys]);

  // When user flips algorithm, default the size to a sensible value for that algo
  useEffect(() => {
    if (signAlgo === "ECDSA" && ![256, 384, 521].includes(signSize)) setSignSize(256);
    if (signAlgo === "RSA"   && ![2048, 3072, 4096].includes(signSize)) setSignSize(2048);
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signAlgo]);

  const savePolicy = async () => {
    setSavingPolicy(true);
    try {
      await api.put("/api/v1/auth/password-policy", { interval_months: intervalMonths });
      toast({ title: `Password policy updated — every ${intervalMonths} month(s)` });
      fetchPolicy();
    } catch (err: any) {
      toast({
        title: err?.response?.data?.error ?? "Failed to update policy",
        variant: "destructive",
      });
    } finally { setSavingPolicy(false); }
  };

  const handleForceReset = async () => {
    if (!confirmForceReset) { setConfirmForceReset(true); return; }
    setForcingReset(true);
    try {
      const res = await api.post("/api/v1/auth/force-password-reset-all");
      toast({
        title: `Forced password reset for ${res.data?.data?.affected_count ?? "all"} users`,
        description: "Users will be required to change their password on next login.",
      });
    } catch (err: any) {
      toast({
        title: err?.response?.data?.error ?? "Failed",
        variant: "destructive",
      });
    } finally {
      setForcingReset(false);
      setConfirmForceReset(false);
    }
  };

  const handleToggleLock = async () => {
    const next = !emergencyLocked;
    if (next && !lockReason.trim()) {
      toast({ title: "Provide a reason before enabling emergency lock", variant: "destructive" });
      return;
    }
    setTogglingLock(true);
    try {
      await api.post("/api/v1/security/emergency-lock", { locked: next, reason: lockReason });
      setEmergencyLocked(next);
      setLockReason("");
      toast({
        title: next ? "🔒 Emergency lock ENABLED" : "🔓 Emergency lock disabled",
        description: next ? "Non-admin logins are now blocked." : "Normal login resumed.",
      });
    } catch (err: any) {
      toast({
        title: err?.response?.data?.error ?? "Failed",
        variant: "destructive",
      });
    } finally { setTogglingLock(false); }
  };

  const handleRotateSigning = async () => {
    if (!confirm(
      `Rotate the system signing key (${signAlgo}-${signSize})?\n\n` +
      "• All NEW certificates will be signed by the new key\n" +
      "• Existing certificates stay valid (they carry their own pubkey)\n" +
      "• Old key stays in registry for verifying historical certs\n\n" +
      "This is a safe operation. Recommended cadence: every 12 months."
    )) return;

    setRotatingSigning(true);
    try {
      const res = await api.post("/api/v1/security/keys/signing/rotate", {
        algorithm: signAlgo,
        key_size:  signSize,
      });
      toast({
        title: "Signing key rotated",
        description: `New key ID: ${res.data?.data?.new_key_id}`,
      });
      fetchKeys();
    } catch (err: any) {
      toast({
        title: err?.response?.data?.error ?? "Rotation failed",
        variant: "destructive",
      });
    } finally { setRotatingSigning(false); }
  };

  const handleRotateKEK = async () => {
    if (!confirm(
      "Rotate the Key Encryption Key (KEK)?\n\n" +
      "• New KEK becomes active immediately\n" +
      "• All per-record DEKs are re-wrapped in the background\n" +
      "• No downtime — PII stays readable throughout\n" +
      "• Old KEK is retained until re-wrap completes\n\n" +
      "Recommended cadence: every 1–2 years."
    )) return;

    setRotatingKEK(true);
    try {
      const res = await api.post("/api/v1/security/keys/kek/rotate", {});
      toast({
        title: "KEK rotated",
        description: `Re-wrap running in background. New KEK: ${res.data?.data?.new_kek_id}`,
      });
      fetchKeys();
    } catch (err: any) {
      toast({
        title: err?.response?.data?.error ?? "Rotation failed",
        variant: "destructive",
      });
    } finally { setRotatingKEK(false); }
  };

  const fmtDate = (unix?: number) =>
    unix && unix > 0 ? new Date(unix * 1000).toLocaleDateString() : "—";

  return (
    <div className="space-y-4">

      {/* ── Emergency Lock — TOP, high visibility ─────────────────────── */}
      <Card className={`border-2 ${emergencyLocked ? "border-red-700 bg-red-950/30" : "border-gray-800 bg-gray-900"}`}>
        <CardHeader className="pb-3">
          <CardTitle className={`text-sm flex items-center gap-2 ${emergencyLocked ? "text-red-300" : "text-white"}`}>
            {emergencyLocked ? <Lock className="h-4 w-4"/> : <Unlock className="h-4 w-4 text-emerald-400"/>}
            Emergency Lock
            {emergencyLocked !== null && (
              <Badge className={`ml-2 text-xs ${emergencyLocked
                ? "bg-red-900 text-red-300 border-red-800"
                : "bg-emerald-900/40 text-emerald-400 border-emerald-800"}`}>
                {emergencyLocked ? "LOCKED" : "Unlocked"}
              </Badge>
            )}
          </CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            Blocks all non-admin logins. Use during a suspected breach or investigation.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {!emergencyLocked && (
            <Field label="Reason (required)">
              <Input
                value={lockReason}
                onChange={e => setLockReason(e.target.value)}
                placeholder="e.g. Investigating suspicious login activity on bank X"
                className="bg-gray-800 border-gray-700 text-white text-sm"
              />
            </Field>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              onClick={handleToggleLock}
              disabled={togglingLock || emergencyLocked === null}
              className={emergencyLocked
                ? "bg-emerald-700 hover:bg-emerald-600 text-white text-sm"
                : "bg-red-700 hover:bg-red-600 text-white text-sm"}
            >
              {togglingLock
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin"/>Working…</>
                : emergencyLocked
                  ? <><Unlock className="h-4 w-4 mr-2"/>Disable Lock</>
                  : <><Lock className="h-4 w-4 mr-2"/>Enable Emergency Lock</>}
            </Button>
            {emergencyLocked && (
              <p className="text-xs text-red-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3 w-3"/>
                Only admin accounts can log in while this is enabled
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Password Policy ─────────────────────────────────────────── */}
      <Section
        title="Password Rotation Policy"
        icon={Clock}
        color="text-cyan-400"
        subtitle="All users (except machine accounts) must change their password on this interval"
      >
        {policyLoading ? (
          <Skeleton className="h-10 w-full bg-gray-800"/>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Rotation Interval">
                <Select value={String(intervalMonths)} onValueChange={v => setIntervalMonths(Number(v))}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-sm">
                    <SelectValue/>
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700 text-white">
                    <SelectItem value="1">Every 1 month (highest security)</SelectItem>
                    <SelectItem value="3">Every 3 months (recommended)</SelectItem>
                    <SelectItem value="6">Every 6 months</SelectItem>
                    <SelectItem value="12">Every 12 months</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <div className="flex flex-col justify-end">
                <Button
                  onClick={savePolicy}
                  disabled={savingPolicy}
                  className="bg-cyan-700 hover:bg-cyan-600 text-white text-sm"
                >
                  {savingPolicy
                    ? <><Loader2 className="h-4 w-4 mr-2 animate-spin"/>Saving…</>
                    : <><Save className="h-4 w-4 mr-2"/>Save Policy</>}
                </Button>
              </div>
            </div>

            {(policyUpdatedBy || policyUpdatedAt) && (
              <p className="text-xs text-gray-500">
                Last updated{policyUpdatedAt && ` ${new Date(policyUpdatedAt).toLocaleString()}`}
                {policyUpdatedBy && ` by ${policyUpdatedBy}`}
              </p>
            )}

            <div className="rounded-lg bg-gray-800/50 border border-gray-700 p-3 space-y-1 text-xs text-gray-400">
              <p className="flex items-start gap-2">
                <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-400"/>
                When a user's password exceeds this age, they'll be forced to the change-password screen on next login.
              </p>
              <p className="flex items-start gap-2">
                <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-400"/>
                The <code className="text-cyan-400">integration_service</code> machine account is exempt from rotation.
              </p>
            </div>
          </>
        )}
      </Section>

      {/* ── Force Password Reset (All) ─────────────────────────────── */}
      <Section
        title="Force Password Reset — All Users"
        icon={Users}
        color="text-amber-400"
        subtitle="Immediately require every user to change their password on next login"
      >
        <div className="rounded-lg bg-amber-900/20 border border-amber-800/60 p-3 text-xs text-amber-200 flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5"/>
          <div className="space-y-1">
            <p className="font-medium">This is a bulk operation</p>
            <p className="text-amber-200/80">
              Every active user (except root admin and machine accounts) will be required to change their password
              on their next login. Existing sessions continue, but the user will be forced to the change-password
              screen when they next authenticate.
            </p>
          </div>
        </div>

        {!confirmForceReset ? (
          <Button
            onClick={() => setConfirmForceReset(true)}
            className="bg-amber-700 hover:bg-amber-600 text-white text-sm"
          >
            <RefreshCw className="h-4 w-4 mr-2"/>
            Force Reset All Users
          </Button>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border border-amber-700 bg-amber-950/40 p-3 flex-wrap">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0"/>
            <span className="text-sm text-amber-200 flex-1 min-w-[180px]">
              Are you sure? This affects all non-admin users.
            </span>
            <Button
              onClick={handleForceReset}
              disabled={forcingReset}
              className="bg-red-700 hover:bg-red-600 text-white text-xs"
              size="sm"
            >
              {forcingReset ? <><Loader2 className="h-3 w-3 mr-1 animate-spin"/>Working…</> : "Yes, reset all"}
            </Button>
            <Button
              onClick={() => setConfirmForceReset(false)}
              variant="outline"
              size="sm"
              className="border-gray-700 text-gray-300 text-xs"
            >
              Cancel
            </Button>
          </div>
        )}
      </Section>

      {/* ── Key Rotation ───────────────────────────────────────────── */}
      <Section
        title="Cryptographic Key Rotation"
        icon={KeyRound}
        color="text-violet-400"
        subtitle="Rotate signing keys (certificates) and KEK (PII at rest) per your security policy"
      >
        {/* Signing key block */}
        <div className="rounded-lg border border-gray-800 p-3 space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm text-white font-medium flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-blue-400"/>
                System Signing Key
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Signs KYC verification certificates. Recommended cadence: every 12 months.
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Select value={signAlgo} onValueChange={v => setSignAlgo(v as "ECDSA" | "RSA")}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-xs h-8 w-[100px]">
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-white">
                  <SelectItem value="ECDSA">ECDSA</SelectItem>
                  <SelectItem value="RSA">RSA</SelectItem>
                </SelectContent>
              </Select>

              <Select value={String(signSize)} onValueChange={v => setSignSize(Number(v))}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-xs h-8 w-[92px]">
                  <SelectValue/>
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700 text-white">
                  {signAlgo === "ECDSA" ? (
                    <>
                      <SelectItem value="256">P-256</SelectItem>
                      <SelectItem value="384">P-384</SelectItem>
                      <SelectItem value="521">P-521</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="2048">2048</SelectItem>
                      <SelectItem value="3072">3072</SelectItem>
                      <SelectItem value="4096">4096</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>

              <Button
                onClick={handleRotateSigning}
                disabled={rotatingSigning}
                size="sm"
                className="bg-blue-700 hover:bg-blue-600 text-white text-xs"
              >
                {rotatingSigning
                  ? <><Loader2 className="h-3 w-3 mr-1 animate-spin"/>Rotating…</>
                  : <><RotateCw className="h-3 w-3 mr-1"/>Rotate</>}
              </Button>
            </div>
          </div>

          {signingKeys.length > 0 ? (
            <div className="space-y-1">
              {signingKeys.slice(0, 5).map((k, i) => (
                <div key={k.KeyID ?? i} className="flex items-center gap-2 text-xs flex-wrap">
                  <Badge className={k.IsActive
                    ? "bg-emerald-900/40 text-emerald-400 border-emerald-800"
                    : "bg-gray-800 text-gray-500 border-gray-700"}>
                    {k.IsActive ? "Active" : "Retired"}
                  </Badge>
                  <span className="text-gray-400 font-mono truncate max-w-[220px]">{k.KeyID}</span>
                  <span className="text-gray-600">· {k.KeyType}-{k.KeySize}</span>
                  <span className="text-gray-600 ml-auto">
                    Created {fmtDate(k.CreatedAt)}
                    {!k.IsActive && k.RetiredAt ? ` · Retired ${fmtDate(k.RetiredAt)}` : ""}
                  </span>
                </div>
              ))}
              {signingKeys.length > 5 && (
                <p className="text-xs text-gray-600">…and {signingKeys.length - 5} more historical key(s)</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-600">No signing keys yet — one will be generated automatically on first startup.</p>
          )}

          <div className="rounded-lg bg-gray-800/30 border border-gray-700/50 p-2.5 space-y-1 text-xs text-gray-500">
            <p className="flex items-start gap-2">
              <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500"/>
              External requesters continue verifying using the public key embedded in each certificate — no action needed on their side.
            </p>
            <p className="flex items-start gap-2">
              <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500"/>
              Retired keys are kept in the registry so historical certificates remain verifiable.
            </p>
          </div>
        </div>

        {/* KEK block */}
        <div className="rounded-lg border border-gray-800 p-3 space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <p className="text-sm text-white font-medium flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-pink-400"/>
                KEK (PII Envelope Encryption)
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Wraps per-record DEKs that encrypt ID numbers, email, phone. Recommended cadence: every 1–2 years.
              </p>
            </div>
            <Button
              onClick={handleRotateKEK}
              disabled={rotatingKEK}
              size="sm"
              className="bg-pink-700 hover:bg-pink-600 text-white text-xs"
            >
              {rotatingKEK
                ? <><Loader2 className="h-3 w-3 mr-1 animate-spin"/>Rotating…</>
                : <><RotateCw className="h-3 w-3 mr-1"/>Rotate</>}
            </Button>
          </div>

          {keks.length > 0 ? (
            <div className="space-y-1">
              {keks.slice(0, 5).map((k, i) => (
                <div key={k.KEKID ?? i} className="flex items-center gap-2 text-xs flex-wrap">
                  <Badge className={k.IsActive
                    ? "bg-emerald-900/40 text-emerald-400 border-emerald-800"
                    : "bg-gray-800 text-gray-500 border-gray-700"}>
                    {k.IsActive ? "Active" : "Retired"}
                  </Badge>
                  <span className="text-gray-400 font-mono truncate max-w-[220px]">{k.KEKID}</span>
                  <span className="text-gray-600 ml-auto">
                    Created {fmtDate(k.CreatedAt)}
                    {!k.IsActive && k.RetiredAt ? ` · Retired ${fmtDate(k.RetiredAt)}` : ""}
                  </span>
                </div>
              ))}
              {keks.length > 5 && (
                <p className="text-xs text-gray-600">…and {keks.length - 5} more historical KEK(s)</p>
              )}
            </div>
          ) : (
            <p className="text-xs text-gray-600">No KEKs yet — one will be generated automatically on first startup.</p>
          )}

          <div className="rounded-lg bg-gray-800/30 border border-gray-700/50 p-2.5 space-y-1 text-xs text-gray-500">
            <p className="flex items-start gap-2">
              <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500"/>
              DEK re-wrap runs in the background. No downtime, no re-encryption of PII ciphertext.
            </p>
            <p className="flex items-start gap-2">
              <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500"/>
              Old KEK stays available for unwrap until re-wrap of every record completes.
            </p>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ALERT CONFIG TAB (existing — preserved verbatim)
// ═════════════════════════════════════════════════════════════════════════════

function AlertConfigTab() {
  const [users,       setUsers]       = useState<UserRow[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [selected,    setSelected]    = useState<UserRow | null>(null);
  const [configs,     setConfigs]     = useState<Record<string, AlertConfig>>(loadAlertConfigs());
  const [editEmail,   setEditEmail]   = useState("");
  const [editWebhook, setEditWebhook] = useState("");
  const [saving,      setSaving]      = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/users/list");
      const arr: UserRow[] = res.data?.data?.users ?? [];
      setUsers(arr.filter(u => u.is_active));
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const selectUser = (u: UserRow) => {
    setSelected(u);
    const existing = configs[u.id];
    setEditEmail(existing?.email ?? u.email ?? "");
    setEditWebhook(existing?.webhook ?? "");
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);

    const updated = {
      ...configs,
      [selected.id]: { userId: selected.id, email: editEmail, webhook: editWebhook }
    };
    setConfigs(updated);
    saveAlertConfigs(updated);

    if (editEmail || editWebhook) {
      try {
        await api.get("/api/v1/alerts/renewal", { params: { requester_id: selected.id } })
          .then(async (res) => {
            const alerts = res.data?.data?.alerts ?? [];
            const certIds = Array.from(new Set(alerts.map((a: any) => a.certificate_id))) as string[];
            for (const certId of certIds.slice(0, 20)) {
              const delivery = editEmail && editWebhook ? "both"
                : editEmail ? "email" : editWebhook ? "webhook" : "none";
              await api.post("/api/v1/alerts/renewal/configure", {
                certificate_id:  certId,
                email_recipient: editEmail,
                webhook_url:     editWebhook,
                delivery,
                send_interval:   "immediate",
              }).catch(() => {});
            }
          }).catch(() => {});
      } catch {}
    }

    setSaving(false);
    toast({ title: `Alert config saved for ${selected.username}` });
  };

  const handleClear = () => {
    if (!selected) return;
    const updated = { ...configs };
    delete updated[selected.id];
    setConfigs(updated);
    saveAlertConfigs(updated);
    setEditEmail(selected.email ?? "");
    setEditWebhook("");
    toast({ title: "Alert config cleared" });
  };

  const filtered = users.filter(u =>
    u.username.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.role.toLowerCase().includes(search.toLowerCase())
  );

  const hasConfig = (u: UserRow) => !!configs[u.id];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

      {/* Left: User list */}
      <Section title="Select User" icon={User} color="text-cyan-400">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500"/>
          <Input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search users…"
            className="pl-8 h-8 text-xs bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"/>
        </div>

        <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
          {loading ? (
            [...Array(5)].map((_,i) => <Skeleton key={i} className="h-10 w-full bg-gray-800 rounded-lg"/>)
          ) : filtered.length === 0 ? (
            <p className="text-gray-600 text-xs text-center py-4">No users found</p>
          ) : (
            filtered.map(u => (
              <button key={u.id} onClick={()=>selectUser(u)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-colors ${
                  selected?.id===u.id
                    ? "bg-cyan-900/30 border border-cyan-800/60"
                    : "hover:bg-gray-800/60 border border-transparent"
                }`}
              >
                <div className="h-7 w-7 rounded-full bg-gray-700 flex items-center justify-center shrink-0">
                  <span className="text-xs text-gray-300">{u.username[0]?.toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white font-medium truncate">{u.username}</p>
                  <p className="text-xs text-gray-500 truncate">{u.email}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-xs text-gray-600">{u.role}</span>
                  {hasConfig(u) && <CheckCircle2 className="h-3 w-3 text-emerald-500"/>}
                  <ChevronRight className="h-3 w-3 text-gray-600"/>
                </div>
              </button>
            ))
          )}
        </div>
        {!loading && (
          <p className="text-xs text-gray-600">{filtered.length} of {users.length} users</p>
        )}
      </Section>

      {/* Right: Config panel */}
      <Section title={selected ? `Alert Config — ${selected.username}` : "Alert Config"} icon={Bell} color="text-amber-400">
        {!selected ? (
          <div className="text-center py-8">
            <User className="h-8 w-8 text-gray-700 mx-auto mb-2"/>
            <p className="text-gray-600 text-xs">Select a user to configure their alert settings</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-gray-800 px-3 py-2.5 flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-cyan-900/40 flex items-center justify-center">
                <span className="text-xs text-cyan-300 font-medium">{selected.username[0]?.toUpperCase()}</span>
              </div>
              <div>
                <p className="text-sm text-white font-medium">{selected.username}</p>
                <p className="text-xs text-gray-500">{selected.role}{selected.bank_id ? ` · ${selected.bank_id}` : ""}</p>
              </div>
              {hasConfig(selected) && <Badge className="ml-auto text-xs bg-emerald-900/40 border-emerald-800 text-emerald-400">Configured</Badge>}
            </div>

            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs flex items-center gap-1.5">
                <Mail className="h-3 w-3"/>Alert Email
              </Label>
              <Input
                type="email"
                value={editEmail}
                onChange={e=>setEditEmail(e.target.value)}
                placeholder={selected.email || "Enter email address"}
                className="h-9 text-sm bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
              />
              {selected.email && editEmail !== selected.email && (
                <button onClick={()=>setEditEmail(selected.email)}
                  className="text-xs text-cyan-400 hover:text-cyan-300">
                  ↑ Use account email: {selected.email}
                </button>
              )}
              <p className="text-xs text-gray-600">
                Renewal alerts will be sent to this address. Defaults to the user's account email.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-gray-400 text-xs flex items-center gap-1.5">
                <Webhook className="h-3 w-3"/>Webhook URL
                <span className="text-gray-600 font-normal">(optional)</span>
              </Label>
              <Input
                type="url"
                value={editWebhook}
                onChange={e=>setEditWebhook(e.target.value)}
                placeholder="https://hooks.example.com/kyc-alerts"
                className="h-9 text-sm bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
              />
              <p className="text-xs text-gray-600">
                POST JSON payload: {"{ certificate_id, customer_id, alert_type, cert_expires_at }"}
              </p>
            </div>

            {(editEmail || editWebhook) && (
              <div className="rounded-lg bg-gray-800/50 border border-gray-700 px-3 py-2">
                <p className="text-xs text-gray-500 mb-1">Will deliver via:</p>
                <div className="flex gap-2">
                  {editEmail  && <span className="text-xs flex items-center gap-1 text-blue-400"><Mail className="h-3 w-3"/>Email</span>}
                  {editWebhook && <span className="text-xs flex items-center gap-1 text-violet-400"><Webhook className="h-3 w-3"/>Webhook</span>}
                  {editEmail && editWebhook && <span className="text-xs text-gray-500">(both)</span>}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button onClick={handleClear} variant="outline" size="sm"
                className="border-gray-700 text-gray-400 hover:text-white text-xs">
                <X className="h-3 w-3 mr-1"/>Clear
              </Button>
              <div className="flex-1"/>
              <Button onClick={handleSave} disabled={saving} size="sm"
                className="bg-cyan-700 hover:bg-cyan-600 text-white text-xs">
                {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin"/>Saving…</> : <><Save className="h-3.5 w-3.5 mr-1.5"/>Save Config</>}
              </Button>
            </div>
          </div>
        )}
      </Section>

      {/* Configured users summary */}
      {Object.keys(configs).length > 0 && (
        <div className="lg:col-span-2">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-white text-xs flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400"/>
                {Object.keys(configs).length} user(s) with alert configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-gray-800">
                {Object.values(configs).map(cfg => {
                  const u = users.find(x => x.id === cfg.userId);
                  return (
                    <div key={cfg.userId} className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
                      <span className="text-xs text-gray-400 font-medium min-w-[120px]">
                        {u?.username ?? cfg.userId}
                      </span>
                      {cfg.email   && <span className="text-xs text-blue-400 flex items-center gap-1"><Mail    className="h-3 w-3"/>{cfg.email}</span>}
                      {cfg.webhook && <span className="text-xs text-violet-400 flex items-center gap-1"><Webhook className="h-3 w-3"/>{cfg.webhook.slice(0,40)}{cfg.webhook.length>40?"…":""}</span>}
                      <button onClick={()=>u&&selectUser(u)} className="ml-auto text-xs text-gray-600 hover:text-gray-300">Edit</button>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ═════════════════════════════════════════════════════════════════════════════

export default function SettingsPage() {
  const [saving, setSaving] = useState(false);

  const handleSave = async (section: string) => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 600));
    setSaving(false);
    toast({ title: `${section} settings saved` });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Settings className="h-6 w-6 text-gray-400"/>Settings
        </h1>
        <p className="text-gray-400 text-sm mt-1">
          Configure system settings, security policy, notifications, and alert delivery
        </p>
      </div>

      <Tabs defaultValue="security">
        <TabsList className="bg-gray-800/60 border border-gray-700 p-1 h-auto gap-1 flex-wrap">
          {[
            { value: "security",      label: "Security",      Icon: Shield   },
            { value: "general",       label: "General",       Icon: Globe    },
            { value: "notifications", label: "Notifications", Icon: Bell     },
            { value: "alerts",        label: "Alert Config",  Icon: Bell     },
            { value: "api",           label: "API",           Icon: Database },
          ].map(({ value, label, Icon }) => (
            <TabsTrigger key={value} value={value}
              className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 text-xs flex items-center gap-1.5 px-3 py-1.5">
              <Icon className="h-3.5 w-3.5"/>{label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Security ── */}
        <TabsContent value="security" className="mt-4">
          <SecurityTab/>
        </TabsContent>

        {/* ── General ── */}
        <TabsContent value="general" className="mt-4">
          <Section title="General Settings" icon={Globe} color="text-blue-400">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="System Name">
                <Input defaultValue="KYC Blockchain System" className="bg-gray-800 border-gray-700 text-white text-sm"/>
              </Field>
              <Field label="Support Email">
                <Input defaultValue="support@kyc.bunlong.uk" className="bg-gray-800 border-gray-700 text-white text-sm"/>
              </Field>
              <Field label="Default Language">
                <Input defaultValue="en" className="bg-gray-800 border-gray-700 text-white text-sm"/>
              </Field>
              <Field label="Timezone">
                <Input defaultValue="Asia/Phnom_Penh" className="bg-gray-800 border-gray-700 text-white text-sm"/>
              </Field>
            </div>
            <Button onClick={()=>handleSave("General")} className="bg-blue-600 hover:bg-blue-700 text-sm" disabled={saving}>
              <Save className="h-4 w-4 mr-2"/>{saving?"Saving…":"Save Changes"}
            </Button>
          </Section>
        </TabsContent>

        {/* ── Notifications ── */}
        <TabsContent value="notifications" className="mt-4 space-y-4">
          <Section title="Email (SMTP)" icon={Mail} color="text-yellow-400">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="SMTP Host">
                <Input placeholder="smtp.gmail.com" className="bg-gray-800 border-gray-700 text-white text-sm"/>
              </Field>
              <Field label="SMTP Port">
                <Input placeholder="587" className="bg-gray-800 border-gray-700 text-white text-sm"/>
              </Field>
              <Field label="From Email">
                <Input placeholder="noreply@kyc.bunlong.uk" className="bg-gray-800 border-gray-700 text-white text-sm"/>
              </Field>
              <Field label="SMTP Password">
                <Input type="password" placeholder="••••••••" className="bg-gray-800 border-gray-700 text-white text-sm"/>
              </Field>
            </div>
            <Button onClick={()=>handleSave("SMTP")} className="bg-blue-600 hover:bg-blue-700 text-sm" disabled={saving}>
              <Save className="h-4 w-4 mr-2"/>Save
            </Button>
          </Section>

          <Section title="Syslog (External)" icon={Radio} color="text-cyan-400">
            <p className="text-xs text-gray-500">
              Configure from the Audit page → Syslog button, or set here. Settings stored in browser localStorage.
            </p>
            <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 text-xs"
              onClick={()=>{ window.location.href="/audit"; }}>
              Open Audit Page → Syslog Config
            </Button>
          </Section>
        </TabsContent>

        {/* ── Alert Config ── */}
        <TabsContent value="alerts" className="mt-4">
          <AlertConfigTab/>
        </TabsContent>

        {/* ── API ── */}
        <TabsContent value="api" className="mt-4">
          <Section title="API Endpoints" icon={Database} color="text-green-400">
            <Field label="Go KYC API URL">
              <Input readOnly value={process.env.NEXT_PUBLIC_API_URL ?? "https://kycapi.bunlong.uk"}
                className="bg-gray-800 border-gray-700 text-gray-400 text-sm"/>
            </Field>
            <Field label="Python AI KYC API URL">
              <Input readOnly value={process.env.NEXT_PUBLIC_PYTHON_API_URL ?? "https://kyc-python-api.bunlong.uk"}
                className="bg-gray-800 border-gray-700 text-gray-400 text-sm"/>
            </Field>
            <div className="rounded-lg bg-gray-800/50 border border-gray-700 p-3 text-xs text-gray-500">
              These values are read from environment variables (<code className="text-cyan-400">NEXT_PUBLIC_API_URL</code>,{" "}
              <code className="text-cyan-400">NEXT_PUBLIC_PYTHON_API_URL</code>). Edit your <code className="text-cyan-400">.env.local</code> to change them.
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}