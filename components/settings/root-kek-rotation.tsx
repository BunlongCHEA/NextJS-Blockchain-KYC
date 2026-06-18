"use client";

// Self-contained — defines its own tiny Card/Field wrappers rather than
// importing from app/(admin)/settings/page.tsx, so it can be dropped in
// without touching that file's existing Section/Field helpers.

import { useState, useEffect, useCallback } from "react";
import {
  Fingerprint, Eye, EyeOff, Copy, Wand2, CheckCircle2, XCircle,
  AlertTriangle, Loader2, ShieldCheck, ShieldAlert, RotateCw, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/use-toast";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface RootKEKStatus {
  current_fingerprint: string;
  kek_count?: number;
  last_rotated_at?: number | null;
  last_rotated_by?: string | null;
  last_rotated_fingerprint?: string;
  matches_last_recorded_rotation?: boolean;
  source: string;
}

interface RootKEKHealthResult {
  active_kek_ok: boolean;
  active_kek_error?: string;
  sample_checked: number;
  sample_success: number;
  sample_failed: number;
  overall_status: "healthy" | "degraded" | "broken";
  note?: string;
}

// ─── Crypto helpers (browser-side, Web Crypto API) ────────────────────────────

function generateRootKEK(): string {
  const bytes = new Uint8Array(32);
  window.crypto.getRandomValues(bytes);
  let binary = "";
  bytes.forEach(b => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function checkFormat(value: string): { valid: boolean; reason?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { valid: false, reason: "Key is empty" };
  let decoded: string;
  try {
    decoded = atob(trimmed);
  } catch {
    return { valid: false, reason: "Not valid base64" };
  }
  if (decoded.length !== 32) {
    return { valid: false, reason: `Must decode to exactly 32 bytes (got ${decoded.length})` };
  }
  return { valid: true };
}

async function fingerprintOf(base64Key: string): Promise<string | null> {
  try {
    const binary = atob(base64Key.trim());
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const digest = await window.crypto.subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
    return `SHA256:${hex.slice(0, 16)}`;
  } catch {
    return null; // non-secure context or unsupported — server fingerprint still applies
  }
}

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  } catch {
    toast({ title: "Copy failed — select and copy manually", variant: "destructive" });
  }
}

function fmtDate(unix?: number | null) {
  return unix && unix > 0 ? new Date(unix * 1000).toLocaleString() : "—";
}

// ─── Small UI atoms (local, so this file has no cross-file dependency) ───────

function StepBadge({ state }: { state: "pending" | "active" | "done" | "failed" }) {
  const map = {
    pending: "bg-gray-800 text-gray-500 border-gray-700",
    active:  "bg-blue-900/40 text-blue-300 border-blue-800",
    done:    "bg-emerald-900/40 text-emerald-400 border-emerald-800",
    failed:  "bg-red-900/40 text-red-400 border-red-800",
  } as const;
  const label = { pending: "Pending", active: "In progress", done: "Done", failed: "Failed" } as const;
  return <Badge className={`text-xs ${map[state]}`}>{label[state]}</Badge>;
}

function MaskedField({
  value, onChange, show, onToggleShow, placeholder, readOnly,
}: {
  value: string; onChange?: (v: string) => void; show: boolean; onToggleShow: () => void;
  placeholder?: string; readOnly?: boolean;
}) {
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        value={value}
        readOnly={readOnly}
        onChange={e => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="bg-gray-800 border-gray-700 text-white text-sm pr-9 font-mono"
        autoComplete="off"
      />
      <button
        type="button"
        onClick={onToggleShow}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
        aria-label={show ? "Hide value" : "Show value"}
      >
        {show ? <EyeOff className="h-3.5 w-3.5"/> : <Eye className="h-3.5 w-3.5"/>}
      </button>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export function RootKEKRotationSection() {
  // ── Status (current fingerprint, history) ────────────────────────────────
  const [status, setStatus] = useState<RootKEKStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const fetchStatus = useCallback(async () => {
    setStatusLoading(true);
    try {
      const res = await api.get("/api/v1/security/keys/root-kek/status");
      setStatus(res.data?.data ?? null);
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => { fetchStatus(); }, [fetchStatus]);

  // ── Step 1: confirm current key (proof of knowledge) ─────────────────────
  const [confirmCurrent, setConfirmCurrent] = useState("");
  const [showConfirmCurrent, setShowConfirmCurrent] = useState(false);
  const [verifyingCurrent, setVerifyingCurrent] = useState(false);
  const [currentVerified, setCurrentVerified] = useState<boolean | null>(null);

  const handleConfirmCurrentChange = (v: string) => {
    setConfirmCurrent(v);
    setCurrentVerified(null); // any edit invalidates a prior verification
  };

  const verifyCurrent = async () => {
    if (!confirmCurrent.trim()) {
      toast({ title: "Enter the current root KEK value first", variant: "destructive" });
      return;
    }
    setVerifyingCurrent(true);
    try {
      const res = await api.post("/api/v1/security/keys/root-kek/validate", {
        confirm_current: confirmCurrent,
      });
      const ok = !!res.data?.data?.current_confirmed;
      setCurrentVerified(ok);
      toast({
        title: ok ? "Current key confirmed" : "Current key does not match the active root",
        variant: ok ? undefined : "destructive",
      });
    } catch (err: any) {
      setCurrentVerified(false);
      toast({ title: err?.response?.data?.error ?? "Verification failed", variant: "destructive" });
    } finally {
      setVerifyingCurrent(false);
    }
  };

  // ── Step 2: new key (auto-generate or manual) + dry-run validate ─────────
  const [newKeyMode, setNewKeyMode] = useState<"auto" | "manual">("auto");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [showNewKey, setShowNewKey] = useState(false);
  const [localFingerprint, setLocalFingerprint] = useState<string | null>(null);
  const [serverFingerprint, setServerFingerprint] = useState<string | null>(null);
  const [validatingNewKey, setValidatingNewKey] = useState(false);
  const [newKeyValidated, setNewKeyValidated] = useState(false);
  const [newKeySameAsCurrent, setNewKeySameAsCurrent] = useState(false);

  const formatCheck = checkFormat(newKeyValue);

  useEffect(() => {
    setNewKeyValidated(false);
    setServerFingerprint(null);
    setNewKeySameAsCurrent(false);
    if (checkFormat(newKeyValue).valid) {
      fingerprintOf(newKeyValue).then(setLocalFingerprint);
    } else {
      setLocalFingerprint(null);
    }
  }, [newKeyValue]);

  const handleGenerate = () => {
    setNewKeyValue(generateRootKEK());
  };

  const handleModeChange = (mode: "auto" | "manual") => {
    setNewKeyMode(mode);
    setNewKeyValue("");
  };

  const validateNewKey = async () => {
    if (!currentVerified) {
      toast({ title: "Verify the current key first (step 1)", variant: "destructive" });
      return;
    }
    if (!formatCheck.valid) {
      toast({ title: formatCheck.reason ?? "Invalid key format", variant: "destructive" });
      return;
    }
    setValidatingNewKey(true);
    try {
      const res = await api.post("/api/v1/security/keys/root-kek/validate", {
        confirm_current: confirmCurrent,
        new_root_kek: newKeyValue,
      });
      const d = res.data?.data;
      setServerFingerprint(d?.new_key_fingerprint ?? null);
      setNewKeySameAsCurrent(!!d?.new_key_same_as_current);
      const ok = !!d?.current_confirmed && !!d?.new_key_valid && !d?.new_key_same_as_current;
      setNewKeyValidated(ok);
      toast({
        title: ok ? "New key validated — ready to rotate" : "Validation failed",
        description: d?.new_key_same_as_current
          ? "The new key is identical to the current key — generate or enter a different one."
          : (d?.new_key_error as string | undefined),
        variant: ok ? undefined : "destructive",
      });
    } catch (err: any) {
      setNewKeyValidated(false);
      toast({ title: err?.response?.data?.error ?? "Validation failed", variant: "destructive" });
    } finally {
      setValidatingNewKey(false);
    }
  };

  // ── Step 3: rotate (irreversible-feeling, type-to-confirm) ───────────────
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [confirmRotateText, setConfirmRotateText] = useState("");
  const [rotating, setRotating] = useState(false);
  const [rotateResult, setRotateResult] = useState<{ kekCount: number } | null>(null);
  const [savedAck, setSavedAck] = useState(false);

  const doRotate = async () => {
    setRotating(true);
    try {
      const res = await api.post("/api/v1/security/keys/root-kek/rotate", {
        confirm_current: confirmCurrent,
        new_root_kek: newKeyValue,
      });
      const d = res.data?.data;
      setRotateResult({ kekCount: d?.kek_count ?? 0 });
      setShowRotateConfirm(false);
      setConfirmRotateText("");
      setSavedAck(false);
      toast({ title: `Rotated ${d?.kek_count ?? 0} KEK(s) successfully` });
      fetchStatus();
    } catch (err: any) {
      toast({ title: err?.response?.data?.error ?? "Rotation failed", variant: "destructive" });
    } finally {
      setRotating(false);
    }
  };

  const resetFlow = () => {
    setConfirmCurrent(""); setCurrentVerified(null);
    setNewKeyValue(""); setNewKeyValidated(false);
    setLocalFingerprint(null); setServerFingerprint(null);
    setRotateResult(null); setSavedAck(false);
    setShowRotateConfirm(false); setConfirmRotateText("");
  };

  // ── Step 4: post-restart health verification ──────────────────────────────
  const [verifyingHealth, setVerifyingHealth] = useState(false);
  const [healthResult, setHealthResult] = useState<RootKEKHealthResult | null>(null);

  const verifyHealth = async () => {
    setVerifyingHealth(true);
    try {
      const res = await api.get("/api/v1/security/keys/root-kek/verify-health", { params: { sample: 5 } });
      setHealthResult(res.data?.data ?? null);
    } catch (err: any) {
      setHealthResult({
        active_kek_ok: false,
        overall_status: "broken",
        sample_checked: 0, sample_success: 0, sample_failed: 0,
        note: err?.response?.data?.error ?? "request failed",
      });
    } finally {
      setVerifyingHealth(false);
    }
  };

  const healthBadge = (s: RootKEKHealthResult["overall_status"]) => {
    const map = {
      healthy:  "bg-emerald-900/40 text-emerald-400 border-emerald-800",
      degraded: "bg-amber-900/40 text-amber-400 border-amber-800",
      broken:   "bg-red-900/40 text-red-400 border-red-800",
    } as const;
    return <Badge className={`text-xs ${map[s]}`}>{s.toUpperCase()}</Badge>;
  };

  return (
    <div className="space-y-4">

      {/* ── Current status card ──────────────────────────────────────────── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Fingerprint className="h-4 w-4 text-rose-400"/>
            Root KEK — current status
          </CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            The root key itself is never displayed, transmitted to this UI, or stored anywhere
            outside your environment / secrets manager. Only a one-way fingerprint is shown,
            so you can confirm it matches the value in your vault.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {statusLoading ? (
            <p className="text-xs text-gray-600">Loading…</p>
          ) : !status ? (
            <p className="text-xs text-red-400">Could not load root KEK status.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-gray-800 p-2.5">
                  <p className="text-xs text-gray-500">Active fingerprint</p>
                  <p className="text-sm text-gray-200 font-mono mt-0.5">{status.current_fingerprint}</p>
                </div>
                <div className="rounded-lg border border-gray-800 p-2.5">
                  <p className="text-xs text-gray-500">KEKs in registry</p>
                  <p className="text-sm text-gray-200 mt-0.5">{status.kek_count ?? "—"}</p>
                </div>
                <div className="rounded-lg border border-gray-800 p-2.5">
                  <p className="text-xs text-gray-500">Last rotated</p>
                  <p className="text-sm text-gray-200 mt-0.5">{fmtDate(status.last_rotated_at)}</p>
                  {status.last_rotated_by && (
                    <p className="text-xs text-gray-600">by {status.last_rotated_by}</p>
                  )}
                </div>
              </div>
              {status.last_rotated_at && status.matches_last_recorded_rotation === false && (
                <div className="rounded-lg bg-amber-900/20 border border-amber-800/60 p-2.5 text-xs text-amber-200 flex items-start gap-2">
                  <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5"/>
                  The active key's fingerprint doesn't match the last rotation recorded here —
                  it may have been changed outside this UI (e.g. directly in the environment).
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Rotation wizard ──────────────────────────────────────────────── */}
      <Card className="bg-gray-900 border-rose-900/40">
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-rose-400"/>
            Rotate Root KEK
          </CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            The most sensitive credential in the system — it wraps the key that wraps every
            customer record's encryption key. Recommended cadence: every 1–2 years, or
            immediately after any suspected exposure.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">

          <div className="rounded-lg bg-gray-800/40 border border-gray-700/60 p-2.5 text-xs text-gray-400 flex items-start gap-2">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-cyan-400"/>
            Nothing you type here is saved to this browser — closing or refreshing the page
            clears it. Rotation only re-wraps the small number of KEK rows shown above; it does
            not touch KYC records or signing keys (they're wrapped by the KEK, not the root).
          </div>

          {/* Step 1 */}
          <div className="rounded-lg border border-gray-800 p-3 space-y-2.5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-white font-medium">1. Confirm current root key</p>
              <StepBadge state={currentVerified === true ? "done" : currentVerified === false ? "failed" : "pending"}/>
            </div>
            <p className="text-xs text-gray-500">
              Proof-of-knowledge gate — paste the current <code className="text-cyan-400">KYC_ROOT_KEK</code> value
              from your environment / secrets manager. This is never stored or logged.
            </p>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <MaskedField
                  value={confirmCurrent}
                  onChange={handleConfirmCurrentChange}
                  show={showConfirmCurrent}
                  onToggleShow={() => setShowConfirmCurrent(s => !s)}
                  placeholder="Current KYC_ROOT_KEK value (base64)"
                />
              </div>
              <Button
                onClick={verifyCurrent}
                disabled={verifyingCurrent || !confirmCurrent.trim()}
                size="sm"
                className="bg-gray-700 hover:bg-gray-600 text-white text-xs shrink-0"
              >
                {verifyingCurrent ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : "Verify"}
              </Button>
            </div>
          </div>

          {/* Step 2 */}
          <div className={`rounded-lg border p-3 space-y-2.5 ${currentVerified ? "border-gray-800" : "border-gray-800/50 opacity-60"}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-white font-medium">2. Choose the new root key</p>
              <StepBadge state={newKeyValidated ? "done" : validatingNewKey ? "active" : "pending"}/>
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant={newKeyMode === "auto" ? "default" : "outline"}
                disabled={!currentVerified}
                onClick={() => handleModeChange("auto")}
                className={newKeyMode === "auto" ? "bg-rose-700 hover:bg-rose-600 text-white text-xs" : "border-gray-700 text-gray-300 text-xs"}
              >
                Auto-generate
              </Button>
              <Button
                size="sm"
                variant={newKeyMode === "manual" ? "default" : "outline"}
                disabled={!currentVerified}
                onClick={() => handleModeChange("manual")}
                className={newKeyMode === "manual" ? "bg-rose-700 hover:bg-rose-600 text-white text-xs" : "border-gray-700 text-gray-300 text-xs"}
              >
                Manual input
              </Button>
            </div>

            {newKeyMode === "auto" ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleGenerate}
                    disabled={!currentVerified}
                    className="bg-gray-700 hover:bg-gray-600 text-white text-xs"
                  >
                    <Wand2 className="h-3.5 w-3.5 mr-1.5"/>
                    {newKeyValue ? "Regenerate" : "Generate"}
                  </Button>
                  <p className="text-xs text-gray-600">
                    Generated locally in your browser via the Web Crypto API — never sent anywhere until you validate or rotate.
                  </p>
                </div>
                {newKeyValue && (
                  <MaskedField
                    value={newKeyValue}
                    show={showNewKey}
                    onToggleShow={() => setShowNewKey(s => !s)}
                    readOnly
                  />
                )}
              </div>
            ) : (
              <Field label="New root key (base64, 32 bytes)">
                <MaskedField
                  value={newKeyValue}
                  onChange={v => currentVerified && setNewKeyValue(v)}
                  show={showNewKey}
                  onToggleShow={() => setShowNewKey(s => !s)}
                  placeholder="Generate with: openssl rand -base64 32"
                />
              </Field>
            )}

            {newKeyValue && (
              <div className="flex items-center gap-2 flex-wrap text-xs">
                {!formatCheck.valid ? (
                  <span className="text-red-400 flex items-center gap-1"><XCircle className="h-3 w-3"/>{formatCheck.reason}</span>
                ) : (
                  <>
                    <span className="text-gray-500">Local fingerprint:</span>
                    <span className="text-gray-300 font-mono">{localFingerprint ?? "computing…"}</span>
                    {serverFingerprint && (
                      serverFingerprint === localFingerprint
                        ? <span className="text-emerald-400 flex items-center gap-1"><CheckCircle2 className="h-3 w-3"/>matches server</span>
                        : <span className="text-amber-400 flex items-center gap-1"><AlertTriangle className="h-3 w-3"/>differs from server check</span>
                    )}
                    <button
                      onClick={() => copyToClipboard(newKeyValue, "New root key")}
                      className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 ml-auto"
                    >
                      <Copy className="h-3 w-3"/>Copy key
                    </button>
                  </>
                )}
                {newKeySameAsCurrent && (
                  <span className="text-amber-400 flex items-center gap-1 w-full">
                    <AlertTriangle className="h-3 w-3"/>Identical to the current key — choose a different one.
                  </span>
                )}
              </div>
            )}

            <Button
              onClick={validateNewKey}
              disabled={!currentVerified || !formatCheck.valid || validatingNewKey}
              size="sm"
              className="bg-gray-700 hover:bg-gray-600 text-white text-xs"
            >
              {validatingNewKey
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin"/>Validating…</>
                : "Validate new key"}
            </Button>
          </div>

          {/* Step 3 */}
          <div className={`rounded-lg border p-3 space-y-2.5 ${newKeyValidated ? "border-rose-900/50" : "border-gray-800/50 opacity-60"}`}>
            <div className="flex items-center justify-between">
              <p className="text-sm text-white font-medium">3. Rotate</p>
              <StepBadge state={rotateResult ? "done" : rotating ? "active" : "pending"}/>
            </div>
            <p className="text-xs text-gray-500">
              Re-wraps every KEK row under the new root in a single database transaction, then
              updates this server instance's in-memory root immediately. If the database write
              fails, the transaction rolls back and the current key remains fully valid.
            </p>

            {!rotateResult ? (
              !showRotateConfirm ? (
                <Button
                  onClick={() => setShowRotateConfirm(true)}
                  disabled={!newKeyValidated}
                  size="sm"
                  className="bg-rose-700 hover:bg-rose-600 text-white text-xs"
                >
                  <RotateCw className="h-3.5 w-3.5 mr-1.5"/>
                  Rotate root KEK
                </Button>
              ) : (
                <div className="rounded-lg border border-rose-800 bg-rose-950/30 p-3 space-y-2">
                  <p className="text-xs text-rose-200 flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5"/>
                    Type <code className="text-rose-100 font-mono">ROTATE</code> to confirm. You will need to
                    update <code className="text-rose-100">KYC_ROOT_KEK</code> and restart every server
                    replica right after this completes.
                  </p>
                  <Input
                    value={confirmRotateText}
                    onChange={e => setConfirmRotateText(e.target.value)}
                    placeholder="ROTATE"
                    className="bg-gray-900 border-rose-800 text-white text-sm h-8 w-32"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={doRotate}
                      disabled={confirmRotateText !== "ROTATE" || rotating}
                      size="sm"
                      className="bg-rose-700 hover:bg-rose-600 text-white text-xs"
                    >
                      {rotating
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin"/>Rotating…</>
                        : "Confirm & rotate"}
                    </Button>
                    <Button
                      onClick={() => { setShowRotateConfirm(false); setConfirmRotateText(""); }}
                      variant="outline"
                      size="sm"
                      className="border-gray-700 text-gray-300 text-xs"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )
            ) : (
              <div className="space-y-3">
                <div className="rounded-lg bg-emerald-900/20 border border-emerald-800/60 p-3 text-xs text-emerald-200 flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5"/>
                  <div>
                    <p className="font-medium">Rotated {rotateResult.kekCount} KEK(s) successfully</p>
                    <p className="text-emerald-200/80 mt-0.5">
                      This instance is already using the new root key. Other replicas still hold the
                      old one until you update the env var and restart them.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-amber-800 bg-amber-950/30 p-3 space-y-2">
                  <p className="text-xs text-amber-200 font-medium flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5"/>Save this value now — shown one more time
                  </p>
                  <MaskedField value={newKeyValue} show={showNewKey} onToggleShow={() => setShowNewKey(s => !s)} readOnly/>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => copyToClipboard(newKeyValue, "New root key")}
                      size="sm"
                      className="bg-amber-700 hover:bg-amber-600 text-white text-xs"
                    >
                      <Copy className="h-3 w-3 mr-1"/>Copy key
                    </Button>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-amber-200/90 pt-1">
                    <input type="checkbox" checked={savedAck} onChange={e => setSavedAck(e.target.checked)}/>
                    I've copied this into my environment / secrets manager
                  </label>
                </div>

                {savedAck && (
                  <div className="rounded-lg bg-gray-800/50 border border-gray-700 p-3 text-xs text-gray-400 space-y-1">
                    <p className="text-gray-300 font-medium">Next steps</p>
                    <p>1. Set <code className="text-cyan-400">KYC_ROOT_KEK</code> to the value above in every replica's environment.</p>
                    <p>2. Rolling-restart all replicas.</p>
                    <p>3. Use the health check below, on each replica if possible, to confirm the rotation propagated.</p>
                    <Button onClick={resetFlow} variant="outline" size="sm" className="border-gray-700 text-gray-300 text-xs mt-2">
                      Start a new rotation
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Post-rotation health check ───────────────────────────────────── */}
      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3 pt-4">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-sky-400"/>
            4. Verify rotation health
          </CardTitle>
          <p className="text-xs text-gray-500 mt-0.5">
            Run this on a server instance after it has restarted with the new
            <code className="text-cyan-400"> KYC_ROOT_KEK</code> to confirm the full chain
            (root → active KEK → sample customer records) decrypts correctly. No PII is ever
            returned — only success/fail counts.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button
            onClick={verifyHealth}
            disabled={verifyingHealth}
            size="sm"
            className="bg-sky-700 hover:bg-sky-600 text-white text-xs"
          >
            {verifyingHealth
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin"/>Checking…</>
              : "Run health check"}
          </Button>

          {healthResult && (
            <div className="rounded-lg border border-gray-800 p-3 space-y-2">
              <div className="flex items-center gap-2">
                {healthBadge(healthResult.overall_status)}
                <span className="text-xs text-gray-500">
                  {healthResult.overall_status === "healthy" && "Everything decrypts correctly with the current root key."}
                  {healthResult.overall_status === "degraded" && "Some records failed to decrypt — investigate before relying on this instance."}
                  {healthResult.overall_status === "broken" && "The active KEK could not be unwrapped — this instance cannot read PII."}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2">
                  {healthResult.active_kek_ok
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400"/>
                    : <XCircle className="h-3.5 w-3.5 text-red-400"/>}
                  <span className="text-gray-400">
                    Active KEK unwrap: {healthResult.active_kek_ok ? "passed" : "failed"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {healthResult.sample_failed === 0
                    ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400"/>
                    : <AlertTriangle className="h-3.5 w-3.5 text-amber-400"/>}
                  <span className="text-gray-400">
                    Sample decrypt: {healthResult.sample_success}/{healthResult.sample_checked} records
                  </span>
                </div>
              </div>

              {healthResult.active_kek_error && (
                <p className="text-xs text-red-400 font-mono break-all">{healthResult.active_kek_error}</p>
              )}
              {healthResult.note && (
                <p className="text-xs text-gray-500">{healthResult.note}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Minimal local Field wrapper — mirrors the page's own Field component
// styling without importing it, so this file stays drop-in self-contained.
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-gray-400 text-xs">{label}</Label>
      {children}
    </div>
  );
}