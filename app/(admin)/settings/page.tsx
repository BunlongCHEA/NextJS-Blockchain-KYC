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

// ─── Types (existing) ────────────────────────────────────────────────────────

interface User {
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-gray-400 text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SECURITY TAB
// ═════════════════════════════════════════════════════════════════════════════

function SecurityTab() {
  // Password policy
  const [interval, setInterval] = useState<number>(3);
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
  const [signingKeys, setSigningKeys] = useState<any[]>([]);
  const [keks, setKeks] = useState<any[]>([]);
  const [rotatingSigning, setRotatingSigning] = useState(false);
  const [rotatingKEK, setRotatingKEK] = useState(false);

  const fetchPolicy = useCallback(async () => {
    setPolicyLoading(true);
    try {
      const res = await api.get("/api/v1/auth/password-policy");
      const d = res.data?.data;
      setInterval(d?.interval_months ?? 3);
      setPolicyUpdatedBy(d?.updated_by ?? "");
      setPolicyUpdatedAt(d?.updated_at ?? "");
    } catch { /* keep defaults */ }
    finally { setPolicyLoading(false); }
  }, []);

  const fetchLockStatus = useCallback(async () => {
    try {
      const res = await api.get("/api/v1/security/emergency-lock");
      setEmergencyLocked(!!res.data?.data?.locked);
    } catch { setEmergencyLocked(false); }
  }, []);

  const fetchKeys = useCallback(async () => {
    try {
      const [s, k] = await Promise.all([
        api.get("/api/v1/security/keys/signing").catch(() => ({ data: { data: { keys: [] } } })),
        api.get("/api/v1/security/keys/kek").catch(() => ({ data: { data: { keks: [] } } })),
      ]);
      setSigningKeys(s.data?.data?.keys ?? []);
      setKeks(k.data?.data?.keks ?? []);
    } catch {/* ignore */}
  }, []);

  useEffect(() => {
    fetchPolicy();
    fetchLockStatus();
    fetchKeys();
  }, [fetchPolicy, fetchLockStatus, fetchKeys]);

  const savePolicy = async () => {
    setSavingPolicy(true);
    try {
      await api.put("/api/v1/auth/password-policy", { interval_months: interval });
      toast({ title: `Password policy updated — ${interval} month(s)` });
      fetchPolicy();
    } catch (err: any) {
      toast({
        title: err?.response?.data?.error ?? "Failed to update policy",
        variant: "destructive",
      });
    } finally { setSavingPolicy(false); }
  };

  const handleForceReset = async () => {
    if (!confirmForceReset) {
      setConfirmForceReset(true);
      return;
    }
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
      await api.post("/api/v1/security/emergency-lock", {
        locked: next,
        reason: lockReason,
      });
      setEmergencyLocked(next);
      setLockReason("");
      toast({
        title: next ? "🔒 Emergency lock ENABLED" : "🔓 Emergency lock disabled",
        description: next
          ? "Non-admin logins are now blocked."
          : "Normal login resumed.",
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
      "Rotate the system signing key?\n\n" +
      "• All NEW certificates will be signed by the new key\n" +
      "• Existing certificates stay valid (they carry their own pubkey)\n" +
      "• Old key stays in registry for verifying historical certs\n\n" +
      "This is a safe operation. Recommended cadence: 1 year."
    )) return;

    setRotatingSigning(true);
    try {
      const res = await api.post("/api/v1/security/keys/signing/rotate", {});
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
      "Recommended cadence: 1–2 years."
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
            Blocks all non-admin logins. Use during a suspected breach.
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
          <div className="flex items-center gap-2">
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
                <Select value={String(interval)} onValueChange={v => setInterval(Number(v))}>
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
                Last updated {policyUpdatedAt && new Date(policyUpdatedAt).toLocaleString()}
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
                The <code className="text-cyan-400">integration_service</code> machine account is exempt.
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
          <div className="flex items-center gap-2 rounded-lg border border-amber-700 bg-amber-950/40 p-3">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0"/>
            <span className="text-sm text-amber-200 flex-1">Are you sure? This affects all non-admin users.</span>
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
        {/* Signing key */}
        <div className="rounded-lg border border-gray-800 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white font-medium flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5 text-blue-400"/>
                System Signing Key
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Signs KYC verification certificates. Rotate yearly.
              </p>
            </div>
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

          {signingKeys.length > 0 && (
            <div className="space-y-1">
              {signingKeys.slice(0, 3).map((k, i) => (
                <div key={k.KeyID ?? i} className="flex items-center gap-2 text-xs">
                  <Badge className={k.IsActive
                    ? "bg-emerald-900/40 text-emerald-400 border-emerald-800"
                    : "bg-gray-800 text-gray-500 border-gray-700"}>
                    {k.IsActive ? "Active" : "Retired"}
                  </Badge>
                  <span className="text-gray-400 font-mono">{k.KeyID}</span>
                  <span className="text-gray-600">· {k.KeyType}-{k.KeySize}</span>
                  {k.CreatedAt && (
                    <span className="text-gray-600 ml-auto">
                      {new Date(k.CreatedAt * 1000).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
              {signingKeys.length > 3 && (
                <p className="text-xs text-gray-600">…and {signingKeys.length - 3} more</p>
              )}
            </div>
          )}

          <p className="text-xs text-gray-500 flex items-start gap-2">
            <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500"/>
            External requesters continue verifying using the public key embedded in each certificate — no action needed on their side.
          </p>
        </div>

        {/* KEK */}
        <div className="rounded-lg border border-gray-800 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white font-medium flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5 text-pink-400"/>
                KEK (PII Envelope Encryption)
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Protects per-record DEKs that encrypt ID numbers, email, phone. Rotate every 1–2 years.
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

          {keks.length > 0 && (
            <div className="space-y-1">
              {keks.slice(0, 3).map((k, i) => (
                <div key={k.KEKID ?? i} className="flex items-center gap-2 text-xs">
                  <Badge className={k.IsActive
                    ? "bg-emerald-900/40 text-emerald-400 border-emerald-800"
                    : "bg-gray-800 text-gray-500 border-gray-700"}>
                    {k.IsActive ? "Active" : "Retired"}
                  </Badge>
                  <span className="text-gray-400 font-mono">{k.KEKID}</span>
                  {k.CreatedAt && (
                    <span className="text-gray-600 ml-auto">
                      {new Date(k.CreatedAt * 1000).toLocaleDateString()}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-500 flex items-start gap-2">
            <CheckCircle2 className="h-3 w-3 mt-0.5 shrink-0 text-emerald-500"/>
            DEK re-wrap runs in the background. No downtime, no re-encryption of PII ciphertext.
          </p>
        </div>
      </Section>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// (keep existing AlertConfigTab unchanged from your current file)
// ═════════════════════════════════════════════════════════════════════════════

function AlertConfigTab() {
  // ... (identical to the existing implementation — trimmed here for brevity,
  //     keep your current code verbatim)
  return <div>[Existing AlertConfigTab — unchanged]</div>;
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN PAGE — add "Security" tab
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
        <TabsList className="bg-gray-800/60 border border-gray-700 p-1 h-auto gap-1">
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

        {/* ── NEW: Security tab ── */}
        <TabsContent value="security" className="mt-4">
          <SecurityTab/>
        </TabsContent>

        {/* ── General (existing) ── */}
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

        {/* Other existing tabs unchanged … */}
        <TabsContent value="notifications" className="mt-4 space-y-4">
          <Section title="Email (SMTP)" icon={Mail} color="text-yellow-400">
            <p className="text-xs text-gray-500">(existing SMTP UI unchanged)</p>
          </Section>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <AlertConfigTab/>
        </TabsContent>

        <TabsContent value="api" className="mt-4">
          <Section title="API Endpoints" icon={Database} color="text-green-400">
            <Field label="Go KYC API URL">
              <Input readOnly value={process.env.NEXT_PUBLIC_API_URL ?? "https://kycapi.bunlong.uk"}
                className="bg-gray-800 border-gray-700 text-gray-400 text-sm"/>
            </Field>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}