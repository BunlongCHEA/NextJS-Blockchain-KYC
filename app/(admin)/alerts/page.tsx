"use client";

/**
 * Alerts Management — /app/(admin)/alerts/page.tsx
 * ──────────────────────────────────────────────────
 *
 * Two distinct alert categories, shown as tabs:
 *
 * Tab 1 — User Security Alerts
 *   Source : GET /api/v1/security/alerts?risk_level=X&reviewed=false
 *   Review : POST /api/v1/security/alerts/review
 *   Actions: acknowledge · dismiss · escalate · resolve
 *   Filter : Critical / High / Medium / Low · reviewed toggle
 *
 * Tab 2 — Customer Certificate Alerts
 *   Source : GET /api/v1/alerts/renewal
 *   Config : POST /api/v1/alerts/renewal/configure
 *   Filter : alert_type (30_DAY / 7_DAY / 1_DAY) · sent / pending
 *   Actions: Enable/Disable per cert · set Email / Webhook delivery
 *            Interval selector (immediate / daily / weekly)
 *            Manual Send button
 *
 * Go additions needed — see comments at the bottom of this file.
 */

import { useEffect, useState, useCallback, useRef } from "react";
import {
  AlertTriangle, RefreshCw, Bell, ShieldAlert, FileKey2,
  CheckCircle2, XCircle, Clock, ChevronDown, Filter,
  Mail, Webhook, Send, Settings, Loader2, MoreHorizontal,
  Info, Eye, EyeOff, ToggleLeft, ToggleRight, Timer,
  Zap, CalendarClock, BellOff, BellRing,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
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

// ─── Safe date helpers ────────────────────────────────────────────────────────
// Go sends created_at / alert_date / cert_expires_at as Unix seconds (int64).
// Any of these can be 0, null, or undefined on rows that predate the column.
// All date rendering goes through these helpers — never throws RangeError.

function safeTs(unix: number | null | undefined): number | null {
  if (!unix || unix <= 0) return null;
  return unix * 1000; // to ms
}

function safeFmt(unix: number | null | undefined, fmt = "MMM d, yyyy"): string {
  const ms = safeTs(unix);
  if (!ms) return "—";
  try { return format(new Date(ms), fmt); } catch { return "—"; }
}

function safeFromNow(unix: number | null | undefined): string {
  const ms = safeTs(unix);
  if (!ms) return "—";
  try { return formatDistanceToNow(ms, { addSuffix: true }); } catch { return "—"; }
}

// SecurityAlert.created_at from Go monitoring service is RFC3339 string OR Unix number.
// Go zero time "0001-01-01T00:00:00Z" must be treated as absent.
function secAlertTs(v: string | number | null | undefined): number | null {
  if (!v) return null;
  if (typeof v === "number") return v > 0 ? v : null;
  // RFC3339 string
  const ms = new Date(v).getTime();
  if (isNaN(ms) || ms <= 0) return null;
  const unix = Math.floor(ms / 1000);
  // Reject Go zero time (year 1) — unix < 0
  return unix > 0 ? unix : null;
}
function safeSecAlertDate(v: string | number | null | undefined, fmt: string): string {
  const ts = secAlertTs(v);
  if (!ts) return "—";
  try { return format(new Date(ts * 1000), fmt); } catch { return "—"; }
}



// ─── Types ────────────────────────────────────────────────────────────────────

type RiskLevel = "low" | "medium" | "high" | "critical";
type ReviewAction = "acknowledged" | "dismissed" | "escalated" | "resolved";
type DeliveryChannel = "email" | "webhook" | "both" | "none";
type AlertInterval = "immediate" | "daily" | "weekly";

interface SecurityAlert {
  id:          string;
  user_id:     string;
  action:      string;
  risk_level:  RiskLevel;
  reviewed:    boolean;
  notes?:      string;
  created_at:  string | number;
  details?:    Record<string, unknown>;
}

interface SecurityAlertSummary {
  total:    number;
  low:      number;
  medium:   number;
  high:     number;
  critical: number;
}

interface RenewalAlert {
  id:               string;
  certificate_id:   string;
  customer_id:      string;
  requester_id:     string;
  alert_type:       "30_DAY" | "7_DAY" | "1_DAY";
  alert_date:       number;   // Unix seconds — matches DB column
  cert_expires_at:  number;   // Unix seconds — matches DB column
  // status replaces the old sent boolean
  status:           "PENDING" | "SENT" | "FAILED";
  sent_at:          number;   // Unix seconds; 0 = not dispatched yet
  webhook_url?:     string;
  email_recipient?: string;
  is_active:        boolean;
  delivery:         DeliveryChannel;
  send_interval:    AlertInterval;  // matches DB column send_interval
  created_at:       number;   // Unix seconds
}

// ─── Shared helpers ────────────────────────────────────────────────────────────

const RISK_CFG: Record<RiskLevel, { label: string; color: string; dot: string; border: string }> = {
  critical: { label: "Critical", color: "text-red-400",    dot: "bg-red-400",    border: "border-red-800/60"   },
  high:     { label: "High",     color: "text-orange-400", dot: "bg-orange-400", border: "border-orange-800/60" },
  medium:   { label: "Medium",   color: "text-amber-400",  dot: "bg-amber-400",  border: "border-amber-800/60"  },
  low:      { label: "Low",      color: "text-blue-400",   dot: "bg-blue-400",   border: "border-blue-800/60"   },
};

const ALERT_TYPE_CFG = {
  "30_DAY": { label: "30 days",  urgency: "text-amber-400",  bg: "bg-amber-900/20 border-amber-800/40"  },
  "7_DAY":  { label: "7 days",   urgency: "text-orange-400", bg: "bg-orange-900/20 border-orange-800/40" },
  "1_DAY":  { label: "1 day",    urgency: "text-red-400",    bg: "bg-red-900/20 border-red-800/40"       },
};

function StatPill({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className={`rounded-xl border px-4 py-3 ${accent}`}>
      <p className="text-2xl font-bold tabular-nums text-white">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

// ─── Tab toggle ───────────────────────────────────────────────────────────────

type Tab = "security" | "renewal";

// ─── Security Alert Review Dialog ────────────────────────────────────────────

function ReviewDialog({
  alert,
  onClose,
  onReviewed,
}: {
  alert: SecurityAlert | null;
  onClose: () => void;
  onReviewed: (id: string, action: ReviewAction) => void;
}) {
  const { toast }             = useToast();
  const [action, setAction]   = useState<ReviewAction>("acknowledged");
  const [notes, setNotes]     = useState("");
  const [saving, setSaving]   = useState(false);

  useEffect(() => { if (alert) { setAction("acknowledged"); setNotes(""); } }, [alert]);

  const handleSubmit = async () => {
    if (!alert) return;
    setSaving(true);
    try {
      await api.post("/api/v1/security/alerts/review", {
        alert_id: alert.id,
        action,
        notes: notes || undefined,
      });
      toast({ title: `Alert ${action}` });
      onReviewed(alert.id, action);
      onClose();
    } catch (err: any) {
      toast({ title: err?.response?.data?.error || "Failed to review alert", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const actionCfg: Record<ReviewAction, { label: string; color: string }> = {
    acknowledged: { label: "Acknowledge",  color: "bg-blue-700 hover:bg-blue-600"     },
    dismissed:    { label: "Dismiss",      color: "bg-gray-700 hover:bg-gray-600"     },
    escalated:    { label: "Escalate",     color: "bg-orange-700 hover:bg-orange-600" },
    resolved:     { label: "Resolve",      color: "bg-emerald-700 hover:bg-emerald-600"},
  };

  return (
    <Dialog open={!!alert} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-400" />Review Security Alert
          </DialogTitle>
          {alert && (
            <DialogDescription className="text-xs text-gray-500">
              {alert.action} · {alert.user_id}
            </DialogDescription>
          )}
        </DialogHeader>
        {alert && (
          <div className="space-y-4 mt-1">
            {/* Alert summary */}
            <div className={`rounded-lg border px-3.5 py-3 ${RISK_CFG[alert.risk_level]?.border ?? "border-gray-700"}`}>
              <div className="flex items-center gap-2 mb-1">
                <div className={`h-2 w-2 rounded-full ${RISK_CFG[alert.risk_level]?.dot}`} />
                <span className={`text-xs font-medium uppercase ${RISK_CFG[alert.risk_level]?.color}`}>
                  {alert.risk_level}
                </span>
                <span className="ml-auto text-xs text-gray-500">
                  {safeFmt(
                      secAlertTs(alert.created_at),
                      "MMM d, HH:mm"
                    )}
                </span>
              </div>
              <p className="text-sm text-white font-medium">{alert.action}</p>
              <p className="text-xs text-gray-500 mt-0.5">User: {alert.user_id}</p>
            </div>

            {/* Action selector */}
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Action</Label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(actionCfg) as ReviewAction[]).map((a) => (
                  <button
                    key={a}
                    onClick={() => setAction(a)}
                    className={`py-2 text-xs rounded-lg border transition-all ${
                      action === a
                        ? "bg-gray-700 border-gray-500 text-white"
                        : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                    }`}
                  >
                    {actionCfg[a].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">
                Notes <span className="text-gray-600 font-normal">(optional)</span>
              </Label>
              <Input
                placeholder="Additional context…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} disabled={saving} className="border-gray-700 text-gray-300">Cancel</Button>
              <Button onClick={handleSubmit} disabled={saving} className={`text-white ${actionCfg[action].color}`}>
                {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : actionCfg[action].label}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Renewal Alert Configure Dialog ──────────────────────────────────────────

function ConfigureAlertDialog({
  alert,
  onClose,
  onSaved,
}: {
  alert: RenewalAlert | null;
  onClose: () => void;
  onSaved: (updated: RenewalAlert) => void;
}) {
  const { toast }                   = useToast();
  const [delivery, setDelivery]       = useState<DeliveryChannel>("none");
  const [interval, setInterval]       = useState<AlertInterval>("immediate");
  const [email, setEmail]             = useState("");
  const [webhook, setWebhook]         = useState("");
  const [isActive, setIsActive]       = useState(true);
  const [saving, setSaving]           = useState(false);
  const [sending, setSending]         = useState(false);
  const [customerEmail, setCustomerEmail] = useState<string>("");

  useEffect(() => {
    if (alert) {
      setDelivery(alert.delivery ?? "none");
      setInterval(alert.send_interval ?? "immediate");
      setEmail(alert.email_recipient ?? "");
      setWebhook(alert.webhook_url ?? "");
      setIsActive(alert.is_active !== false);
      setCustomerEmail("");

      // Auto-lookup customer email from KYC / user list
      api.get("/api/v1/kyc", { params: { customer_id: alert.customer_id } })
        .then(res => {
          const kycEmail = res.data?.data?.kyc_data?.email;
          if (kycEmail && kycEmail !== "[ENCRYPTED]") setCustomerEmail(kycEmail);
        })
        .catch(() => {
          // Fallback: try user list
          api.get("/api/v1/users/list")
            .then(res => {
              const users: any[] = res.data?.data?.users ?? [];
              // customer_id matches username or user id
              const match = users.find(u =>
                u.id === alert.customer_id || u.username === alert.customer_id
              );
              if (match?.email) setCustomerEmail(match.email);
            })
            .catch(() => {});
        });
    }
  }, [alert]);

  const handleSave = async () => {
    if (!alert) return;
    if ((delivery === "email" || delivery === "both") && !email.trim()) {
      toast({ title: "Email address is required", variant: "destructive" }); return;
    }
    if ((delivery === "webhook" || delivery === "both") && !webhook.trim()) {
      toast({ title: "Webhook URL is required", variant: "destructive" }); return;
    }
    setSaving(true);
    try {
      await api.post("/api/v1/alerts/renewal/configure", {
        certificate_id:  alert.certificate_id,
        webhook_url:     (delivery === "webhook" || delivery === "both") ? webhook : "",
        email_recipient: (delivery === "email"   || delivery === "both") ? email   : "",
        is_active:       isActive,
        send_interval:   interval,
      });
      toast({ title: "Alert configuration saved" });
      onSaved({ ...alert, delivery, send_interval: interval, webhook_url: webhook, email_recipient: email, is_active: isActive });
      onClose();
    } catch (err: any) {
      toast({ title: err?.response?.data?.error || "Failed to save configuration", variant: "destructive" });
    } finally { setSaving(false); }
  };

  const handleManualSend = async () => {
    if (!alert) return;
    setSending(true);
    try {
      // POST /api/v1/alerts/renewal/send (Go addition — see bottom of file)
      await api.post("/api/v1/alerts/renewal/send", {
        certificate_id: alert.certificate_id,
        alert_id:       alert.id,
      });
      toast({ title: "Alert sent manually" });
    } catch (err: any) {
      toast({ title: err?.response?.data?.error || "Failed to send alert", variant: "destructive" });
    } finally { setSending(false); }
  };

  const cfg = alert ? ALERT_TYPE_CFG[alert.alert_type] : null;
  const daysLeft = alert && alert.cert_expires_at > 0
    ? differenceInDays(alert.cert_expires_at * 1000, Date.now())
    : 0;

  return (
    <Dialog open={!!alert} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-cyan-400" />Configure Renewal Alert
          </DialogTitle>
          <DialogDescription className="text-xs text-gray-500">
            {alert?.certificate_id?.slice(0, 20)}… · {alert?.customer_id}
          </DialogDescription>
        </DialogHeader>

        {alert && cfg && (
          <div className="space-y-4 mt-1">
            {/* Alert info */}
            <div className={`rounded-lg border px-3.5 py-3 ${cfg.bg}`}>
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${cfg.urgency}`}>
                  {cfg.label} before expiry
                </span>
                <span className={`text-xs ${daysLeft < 0 ? "text-red-400" : daysLeft <= 7 ? "text-orange-400" : "text-amber-400"}`}>
                  {daysLeft < 0 ? `Expired ${Math.abs(daysLeft)}d ago` : `${daysLeft}d remaining`}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1 font-mono">{alert.certificate_id}</p>
            </div>

            {/* Enable/Disable */}
            <div className="flex items-center justify-between rounded-lg border border-gray-800 px-3.5 py-2.5">
              <div>
                <p className="text-sm text-white font-medium">Alert Enabled</p>
                <p className="text-xs text-gray-500">Disable to suppress this alert</p>
              </div>
              <button onClick={() => setIsActive((p) => !p)} className="flex items-center gap-1.5">
                {isActive
                  ? <><ToggleRight className="h-6 w-6 text-emerald-400" /><span className="text-xs text-emerald-400">On</span></>
                  : <><ToggleLeft  className="h-6 w-6 text-gray-600"   /><span className="text-xs text-gray-500">Off</span></>}
              </button>
            </div>

            {/* Delivery channel */}
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm">Delivery Channel</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  ["none",    "None",    BellOff  ],
                  ["email",   "Email",   Mail     ],
                  ["webhook", "Webhook", Webhook  ],
                  ["both",    "Both",    BellRing ],
                ] as [DeliveryChannel, string, React.ElementType][]).map(([val, lbl, Icon]) => (
                  <button
                    key={val}
                    onClick={() => setDelivery(val)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-xs transition-all ${
                      delivery === val
                        ? "bg-cyan-900/40 border-cyan-700 text-cyan-300"
                        : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />{lbl}
                  </button>
                ))}
              </div>
            </div>

            {/* Email */}
            {(delivery === "email" || delivery === "both") && (
              <div className="space-y-1.5">
                <Label className="text-gray-300 text-sm">Email Address <span className="text-red-400">*</span></Label>
                <Input
                  type="email"
                  placeholder={customerEmail || "alerts@ababank.com"}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                />
                {customerEmail && !email && (
                  <button
                    onClick={() => setEmail(customerEmail)}
                    className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    ↑ Use customer email: {customerEmail}
                  </button>
                )}
              </div>
            )}

            {/* Webhook */}
            {(delivery === "webhook" || delivery === "both") && (
              <div className="space-y-1.5">
                <Label className="text-gray-300 text-sm">Webhook URL <span className="text-red-400">*</span></Label>
                <Input
                  type="url"
                  placeholder="https://hooks.ababank.com/kyc-alerts"
                  value={webhook}
                  onChange={(e) => setWebhook(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                />
                <p className="text-xs text-gray-600">POST with JSON body: {`{ certificate_id, customer_id, cert_expires_at, alert_type }`}</p>
              </div>
            )}

            {/* Interval */}
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5 text-gray-500" />
                Send Interval
              </Label>
              <div className="grid grid-cols-3 gap-1.5">
                {([
                  ["immediate", "Immediate", Zap         ],
                  ["daily",     "Daily",     CalendarClock],
                  ["weekly",    "Weekly",    CalendarClock],
                ] as [AlertInterval, string, React.ElementType][]).map(([val, lbl, Icon]) => (
                  <button
                    key={val}
                    onClick={() => setInterval(val)}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs transition-all ${
                      interval === val
                        ? "bg-violet-900/40 border-violet-700 text-violet-300"
                        : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                    }`}
                  >
                    <Icon className="h-3 w-3" />{lbl}
                  </button>
                ))}
              </div>
              <p className="text-xs text-gray-600">
                {interval === "immediate" && "Send immediately when the threshold is reached"}
                {interval === "daily"     && "Batch into a daily digest at 08:00 local time"}
                {interval === "weekly"    && "Batch into a weekly digest (Mondays 08:00)"}
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualSend}
                disabled={sending || delivery === "none"}
                className="border-gray-700 text-gray-300 hover:text-white text-xs"
              >
                {sending
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Sending…</>
                  : <><Send className="h-3.5 w-3.5 mr-1.5" />Send Now</>}
              </Button>
              <div className="flex-1" />
              <Button variant="outline" onClick={onClose} disabled={saving} className="border-gray-700 text-gray-300 text-xs">Cancel</Button>
              <Button onClick={handleSave} disabled={saving} className="bg-cyan-700 hover:bg-cyan-600 text-white text-xs">
                {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</> : "Save Config"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AlertsPage() {
  const { toast } = useToast();

  // ── Tab state ──
  const [tab, setTab] = useState<Tab>("security");

  // ── Security alerts state ──
  const [secAlerts,      setSecAlerts]      = useState<SecurityAlert[]>([]);
  const [secSummary,     setSecSummary]     = useState<SecurityAlertSummary>({ total: 0, low: 0, medium: 0, high: 0, critical: 0 });
  const [secLoading,     setSecLoading]     = useState(true);
  const [secRiskFilter,  setSecRiskFilter]  = useState<RiskLevel | "all">("all");
  const [secShowReviewed, setSecShowReviewed] = useState(false);
  const [reviewAlert,    setReviewAlert]    = useState<SecurityAlert | null>(null);

  // ── Renewal alerts state ──
  const [renewAlerts,    setRenewAlerts]    = useState<RenewalAlert[]>([]);
  const [renewLoading,   setRenewLoading]   = useState(true);
  const [renewTypeFilter, setRenewTypeFilter] = useState<"all" | "30_DAY" | "7_DAY" | "1_DAY">("all");
  const [renewSentFilter, setRenewSentFilter] = useState<"all" | "sent" | "pending">("all");
  const [configAlert,    setConfigAlert]    = useState<RenewalAlert | null>(null);

  // ─── Fetch Security Alerts ──────────────────────────────────────────────────
  const fetchSecAlerts = useCallback(async () => {
    setSecLoading(true);
    try {
      const params: Record<string, string> = {};
      if (secRiskFilter !== "all") params.risk_level = secRiskFilter;
      if (!secShowReviewed) params.reviewed = "false";

      const res = await api.get("/api/v1/security/alerts", { params });
      const data = res.data?.data;
      setSecAlerts(Array.isArray(data?.alerts) ? data.alerts : []);
      if (data?.summary) setSecSummary(data.summary);
    } catch { setSecAlerts([]); }
    finally { setSecLoading(false); }
  }, [secRiskFilter, secShowReviewed]);

  // ─── Fetch Renewal Alerts ───────────────────────────────────────────────────
  const fetchRenewAlerts = useCallback(async () => {
    setRenewLoading(true);
    try {
      const res = await api.get("/api/v1/alerts/renewal");
      const raw: RenewalAlert[] = Array.isArray(res.data?.data?.alerts)
        ? res.data.data.alerts
        : Array.isArray(res.data?.data) ? res.data.data : [];

      // All config fields come from DB — ensure defaults for any missing fields.
      const enriched = raw.map((a) => ({
        ...a,
        is_active:     a.is_active     ?? true,
        delivery:      (a.delivery      || "none")      as DeliveryChannel,
        send_interval: (a.send_interval || "immediate") as AlertInterval,
        status:        (a.status        || "PENDING")   as "PENDING" | "SENT" | "FAILED",
      }));
      setRenewAlerts(enriched);
    } catch { setRenewAlerts([]); }
    finally { setRenewLoading(false); }
  }, []);

  useEffect(() => { fetchSecAlerts(); }, [fetchSecAlerts]);
  useEffect(() => { fetchRenewAlerts(); }, [fetchRenewAlerts]);

  // ─── Filter applied arrays ──────────────────────────────────────────────────
  const filteredSec = secAlerts.filter((a) =>
    (secRiskFilter === "all" || a.risk_level === secRiskFilter) &&
    (secShowReviewed ? true : !a.reviewed)
  );

  const filteredRenew = renewAlerts.filter((a) =>
    (renewTypeFilter === "all" || a.alert_type === renewTypeFilter) &&
    (renewSentFilter === "all" || (renewSentFilter === "sent" ? (a.status === 'SENT') : !(a.status === 'SENT')))
  );

  // ─── Handlers ───────────────────────────────────────────────────────────────
  const handleReviewed = (id: string, action: ReviewAction) => {
    setSecAlerts((prev) =>
      action === "resolved" || action === "dismissed"
        ? prev.map((a) => a.id === id ? { ...a, reviewed: true } : a)
        : prev.map((a) => a.id === id ? { ...a, reviewed: action === "acknowledged" } : a)
    );
  };

  const handleConfigSaved = (updated: RenewalAlert) => {
    // The Go backend updated ALL rows for the certificate_id (delivery, is_active, etc.)
    // Mirror that in React state: rows with the same certificate_id get the same
    // delivery/webhook/email/send_interval/is_active.  Each row keeps its own
    // id, alert_type, alert_date, status, sent_at (those are per-row fields).
    setRenewAlerts((prev) => prev.map((a) => {
      if (a.certificate_id !== updated.certificate_id) return a;
      // Same cert → apply the shared config fields
      return {
        ...a,
        is_active:       updated.is_active,
        delivery:        updated.delivery,
        send_interval:   updated.send_interval,
        webhook_url:     updated.webhook_url,
        email_recipient: updated.email_recipient,
      };
    }));
  };

  const toggleRenewActive = async (alert: RenewalAlert) => {
    try {
      // Use alert_id to update ONLY this single row — not all rows for the cert
      await api.post("/api/v1/alerts/renewal/configure", {
        alert_id:  alert.id,
        is_active: !alert.is_active,
      });
      setRenewAlerts((prev) =>
        prev.map((a) => a.id === alert.id ? { ...a, is_active: !alert.is_active } : a)
      );
      toast({ title: alert.is_active ? "Alert disabled" : "Alert enabled" });
    } catch { toast({ title: "Failed to toggle alert", variant: "destructive" }); }
  };

  const sendManualAlert = async (alert: RenewalAlert) => {
    try {
      await api.post("/api/v1/alerts/renewal/send", {
        certificate_id: alert.certificate_id,
        alert_id:       alert.id,
      });
      toast({ title: "Alert sent manually" });
    } catch (err: any) {
      toast({ title: err?.response?.data?.error || "Failed to send alert", variant: "destructive" });
    }
  };

  // ─── Derived counts ─────────────────────────────────────────────────────────
  const renewExpired  = renewAlerts.filter((a) => a.cert_expires_at > 0 && a.cert_expires_at < Date.now() / 1000);
  const renewExpiring = renewAlerts.filter((a) => {
    if (!a.cert_expires_at || a.cert_expires_at <= 0) return false;
    const d = differenceInDays(a.cert_expires_at * 1000, Date.now());
    return d >= 0 && d <= 30;
  });
  const renewPending  = renewAlerts.filter((a) => !(a.status === 'SENT'));

  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Bell className="h-6 w-6 text-amber-400" />Alerts
            </h1>
            <p className="text-gray-400 text-sm mt-1">
              Security alerts and certificate renewal notifications
            </p>
          </div>
          <Button
            onClick={() => { fetchSecAlerts(); fetchRenewAlerts(); }}
            variant="outline" size="sm"
            className="border-gray-700 text-gray-300"
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />Refresh
          </Button>
        </div>

        {/* ── Tab selector ── */}
        <div className="flex gap-1 p-1 bg-gray-900 border border-gray-800 rounded-xl w-fit">
          <button
            onClick={() => setTab("security")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "security"
                ? "bg-gray-800 text-white shadow"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <ShieldAlert className="h-4 w-4 text-red-400" />
            User Security
            {secSummary.critical + secSummary.high > 0 && (
              <span className="text-xs bg-red-900/60 border border-red-800 text-red-300 px-1.5 py-0.5 rounded-full">
                {secSummary.critical + secSummary.high}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("renewal")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === "renewal"
                ? "bg-gray-800 text-white shadow"
                : "text-gray-500 hover:text-gray-300"
            }`}
          >
            <FileKey2 className="h-4 w-4 text-cyan-400" />
            Certificate Renewal
            {renewPending.length > 0 && (
              <span className="text-xs bg-cyan-900/60 border border-cyan-800 text-cyan-300 px-1.5 py-0.5 rounded-full">
                {renewPending.length}
              </span>
            )}
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            TAB 1 — USER SECURITY ALERTS
        ══════════════════════════════════════════════════════════════════ */}
        {tab === "security" && (
          <div className="space-y-4">

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <StatPill label="Total"    value={secSummary.total}    accent="bg-gray-800/60 border-gray-700"          />
              <StatPill label="Critical" value={secSummary.critical} accent="bg-red-900/20 border-red-800/40"         />
              <StatPill label="High"     value={secSummary.high}     accent="bg-orange-900/20 border-orange-800/40"   />
              <StatPill label="Medium"   value={secSummary.medium}   accent="bg-amber-900/20 border-amber-800/40"     />
              <StatPill label="Low"      value={secSummary.low}      accent="bg-blue-900/20 border-blue-800/40"       />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-gray-600 shrink-0" />
              {/* Risk filter */}
              {(["all","critical","high","medium","low"] as const).map((lvl) => (
                <button
                  key={lvl}
                  onClick={() => setSecRiskFilter(lvl)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    secRiskFilter === lvl
                      ? lvl === "all"
                        ? "bg-gray-700 border-gray-600 text-white"
                        : `border-current text-white ${
                            lvl === "critical" ? "bg-red-900/50 border-red-700 text-red-300"
                            : lvl === "high"   ? "bg-orange-900/50 border-orange-700 text-orange-300"
                            : lvl === "medium" ? "bg-amber-900/50 border-amber-700 text-amber-300"
                            : "bg-blue-900/50 border-blue-700 text-blue-300"
                          }`
                      : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                  }`}
                >
                  {lvl === "all" ? "All Levels" : lvl.charAt(0).toUpperCase() + lvl.slice(1)}
                </button>
              ))}
              <div className="flex-1" />
              {/* Reviewed toggle */}
              <button
                onClick={() => setSecShowReviewed((p) => !p)}
                className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                  secShowReviewed
                    ? "bg-emerald-900/20 border-emerald-800/40 text-emerald-400"
                    : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                }`}
              >
                {secShowReviewed ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                {secShowReviewed ? "Hide Reviewed" : "Show Reviewed"}
              </button>
            </div>

            {/* Alert list */}
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-0">
                {secLoading ? (
                  <div className="p-4 space-y-3">
                    {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full bg-gray-800 rounded-lg" />)}
                  </div>
                ) : filteredSec.length === 0 ? (
                  <div className="text-center py-16">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3 opacity-60" />
                    <p className="text-gray-400 text-sm">
                      {secRiskFilter !== "all" ? `No ${secRiskFilter} alerts` : "No active security alerts"}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-800/60">
                    {filteredSec.map((alert) => {
                      const cfg = RISK_CFG[alert.risk_level] ?? RISK_CFG.low;
                      return (
                        <div
                          key={alert.id}
                          className={`flex items-start gap-3 px-4 py-3.5 hover:bg-gray-800/20 transition-colors ${
                            alert.reviewed ? "opacity-50" : ""
                          }`}
                        >
                          {/* Risk dot */}
                          <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${cfg.dot}`} />

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                              <span className={`text-xs font-semibold uppercase ${cfg.color}`}>
                                {alert.risk_level}
                              </span>
                              <span className="text-xs text-gray-500 font-mono">{alert.action}</span>
                              {alert.reviewed && (
                                <span className="text-xs bg-gray-800 border border-gray-700 text-gray-500 px-1.5 py-0.5 rounded">
                                  reviewed
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-gray-300 truncate">User: {alert.user_id}</p>
                            {alert.notes && (
                              <p className="text-xs text-gray-600 mt-0.5 truncate">{alert.notes}</p>
                            )}
                          </div>

                          {/* Timestamp */}
                          <p className="text-xs text-gray-600 shrink-0">
                            {safeFromNow(secAlertTs(alert.created_at))}
                          </p>

                          {/* Review button */}
                          {!alert.reviewed && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-gray-700 text-gray-400 hover:text-white text-xs shrink-0 h-7"
                              onClick={() => setReviewAlert(alert)}
                            >
                              Review
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                {!secLoading && filteredSec.length > 0 && (
                  <div className="px-4 py-2.5 border-t border-gray-800">
                    <p className="text-xs text-gray-600">
                      {filteredSec.filter((a) => !a.reviewed).length} unreviewed · {filteredSec.filter((a) => a.reviewed).length} reviewed
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            TAB 2 — CERTIFICATE RENEWAL ALERTS
        ══════════════════════════════════════════════════════════════════ */}
        {tab === "renewal" && (
          <div className="space-y-4">

            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatPill label="Total Alerts"  value={renewAlerts.length}  accent="bg-gray-800/60 border-gray-700"         />
              <StatPill label="Pending Send"  value={renewPending.length}  accent="bg-cyan-900/20 border-cyan-800/40"       />
              <StatPill label="Expiring ≤30d" value={renewExpiring.length} accent="bg-amber-900/20 border-amber-800/40"     />
              <StatPill label="Expired"       value={renewExpired.length}  accent="bg-red-900/20 border-red-800/40"         />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <Filter className="h-3.5 w-3.5 text-gray-600 shrink-0" />
              {/* Alert type filter */}
              {(["all","30_DAY","7_DAY","1_DAY"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setRenewTypeFilter(t)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    renewTypeFilter === t
                      ? t === "all"
                        ? "bg-gray-700 border-gray-600 text-white"
                        : t === "30_DAY" ? "bg-amber-900/50 border-amber-700 text-amber-300"
                        : t === "7_DAY"  ? "bg-orange-900/50 border-orange-700 text-orange-300"
                        : "bg-red-900/50 border-red-700 text-red-300"
                      : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                  }`}
                >
                  {t === "all" ? "All Types" : ALERT_TYPE_CFG[t].label}
                </button>
              ))}
              <div className="w-px h-4 bg-gray-700 mx-1" />
              {/* Sent filter */}
              {(["all","pending","sent"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setRenewSentFilter(s)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    renewSentFilter === s
                      ? "bg-gray-700 border-gray-600 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                  }`}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {/* Renewal list */}
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-0">
                {renewLoading ? (
                  <div className="p-4 space-y-3">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full bg-gray-800 rounded-lg" />)}
                  </div>
                ) : filteredRenew.length === 0 ? (
                  <div className="text-center py-16">
                    <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-3 opacity-60" />
                    <p className="text-gray-400 text-sm">No renewal alerts match your filters</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-800/60">
                    {filteredRenew.map((alert) => {
                      const typeCfg    = ALERT_TYPE_CFG[alert.alert_type];
                      const daysLeft   = alert.cert_expires_at > 0
                        ? differenceInDays(alert.cert_expires_at * 1000, Date.now())
                        : 0;
                      const isExpired  = alert.cert_expires_at > 0 && daysLeft < 0;
                      const isInactive = alert.is_active === false;

                      return (
                        <div
                          key={alert.id}
                          className={`flex items-start gap-3 px-4 py-3.5 hover:bg-gray-800/20 transition-colors ${isInactive ? "opacity-50" : ""}`}
                        >
                          {/* Type badge */}
                          <div className={`text-xs px-2 py-1 rounded border font-medium shrink-0 mt-0.5 ${typeCfg.bg}`}>
                            <span className={typeCfg.urgency}>{typeCfg.label}</span>
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm text-white font-medium font-mono truncate">
                                {alert.certificate_id?.slice(0, 20)}…
                              </p>
                              {isExpired && (
                                <span className="text-xs bg-red-950/50 border border-red-900/50 text-red-400 px-1.5 py-0.5 rounded">
                                  expired
                                </span>
                              )}
                              {(alert.status === 'SENT') && (
                                <span className="text-xs bg-emerald-950/50 border border-emerald-900/50 text-emerald-400 px-1.5 py-0.5 rounded">
                                  sent
                                </span>
                              )}
                              {isInactive && (
                                <span className="text-xs bg-gray-800 border border-gray-700 text-gray-500 px-1.5 py-0.5 rounded">
                                  disabled
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              Customer: <span className="font-mono">{alert.customer_id}</span>
                            </p>
                            {/* Delivery info */}
                            <div className="flex items-center gap-2 mt-1">
                              {alert.delivery === "none" ? (
                                <span className="text-xs text-gray-600 flex items-center gap-1">
                                  <BellOff className="h-3 w-3" />No delivery configured
                                </span>
                              ) : (
                                <span className="text-xs text-gray-500 flex items-center gap-1">
                                  {(alert.delivery === "email" || alert.delivery === "both")   && <Mail    className="h-3 w-3 text-blue-400" />}
                                  {(alert.delivery === "webhook" || alert.delivery === "both") && <Webhook className="h-3 w-3 text-violet-400" />}
                                  {alert.send_interval && (
                                    <span className="text-gray-600">· {alert.send_interval}</span>
                                  )}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Expiry */}
                          <div className="text-right shrink-0">
                            <p className={`text-sm font-medium ${isExpired ? "text-red-400" : daysLeft <= 7 ? "text-orange-400" : "text-amber-400"}`}>
                              {isExpired ? `${Math.abs(daysLeft)}d ago` : `${daysLeft}d left`}
                            </p>
                            <p className="text-xs text-gray-600">
                              {safeFmt(alert.cert_expires_at, "MMM d, yyyy")}
                            </p>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-1 shrink-0">
                            {/* Enable/Disable toggle */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => toggleRenewActive(alert)}
                                  className="p-1.5 text-gray-600 hover:text-gray-300 rounded"
                                >
                                  {alert.is_active !== false
                                    ? <BellRing className="h-3.5 w-3.5 text-emerald-400" />
                                    : <BellOff  className="h-3.5 w-3.5 text-gray-500" />}
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
                                {alert.is_active !== false ? "Disable alert" : "Enable alert"}
                              </TooltipContent>
                            </Tooltip>

                            {/* Manual send */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => sendManualAlert(alert)}
                                  disabled={alert.delivery === "none"}
                                  className="p-1.5 text-gray-600 hover:text-cyan-400 rounded disabled:opacity-30"
                                >
                                  <Send className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
                                {alert.delivery === "none" ? "Configure delivery first" : "Send alert now"}
                              </TooltipContent>
                            </Tooltip>

                            {/* Configure */}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={() => setConfigAlert(alert)}
                                  className="p-1.5 text-gray-600 hover:text-white rounded"
                                >
                                  <Settings className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-gray-800 border-gray-700 text-xs">Configure</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {!renewLoading && filteredRenew.length > 0 && (
                  <div className="px-4 py-2.5 border-t border-gray-800">
                    <p className="text-xs text-gray-600">
                      {filteredRenew.filter((a) => !(a.status === 'SENT')).length} pending · {filteredRenew.filter((a) => (a.status === 'SENT')).length} sent
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Architecture note */}
            <div className="flex items-start gap-3 bg-gray-900/40 border border-gray-800 rounded-xl p-4">
              <Info className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
              <div className="text-xs text-gray-500 space-y-1">
                <p className="text-gray-300 font-medium">Renewal Alert delivery</p>
                <p>
                  Alerts are scheduled automatically when a certificate is issued (30d · 7d · 1d before expiry).
                  Configure <strong className="text-white">Email</strong> or <strong className="text-white">Webhook</strong> per certificate — or both.
                  Use <strong className="text-white">Send Now</strong> for immediate manual dispatch.
                </p>
                <p>
                  Go backend note: <code className="text-cyan-400">POST /api/v1/alerts/renewal/send</code> needs to be added — see
                  {" "}<code className="text-gray-400">handlers-alerts-additions.go</code>.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Dialogs ── */}
      <ReviewDialog
        alert={reviewAlert}
        onClose={() => setReviewAlert(null)}
        onReviewed={handleReviewed}
      />
      <ConfigureAlertDialog
        alert={configAlert}
        onClose={() => setConfigAlert(null)}
        onSaved={handleConfigSaved}
      />
    </TooltipProvider>
  );
}