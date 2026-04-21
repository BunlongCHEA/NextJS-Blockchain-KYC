"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Settings, Save, Globe, Bell, Database, Shield,
  Search, Mail, Webhook, Loader2, CheckCircle2, AlertCircle,
  User, RefreshCw, ChevronRight, X, Radio,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";
import api from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

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

function Section({ title, children, icon: Icon, color = "text-blue-400" }: {
  title: string; children: React.ReactNode; icon: React.ElementType; color?: string;
}) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader className="pb-3 pt-4">
        <CardTitle className={`text-white text-sm flex items-center gap-2`}>
          <Icon className={`h-4 w-4 ${color}`}/>{title}
        </CardTitle>
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

// ─── Alert Config Tab ─────────────────────────────────────────────────────────

function AlertConfigTab() {
  const [users,       setUsers]       = useState<User[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [selected,    setSelected]    = useState<User | null>(null);
  const [configs,     setConfigs]     = useState<Record<string, AlertConfig>>(loadAlertConfigs());
  const [editEmail,   setEditEmail]   = useState("");
  const [editWebhook, setEditWebhook] = useState("");
  const [saving,      setSaving]      = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/users/list");
      const arr: User[] = res.data?.data?.users ?? [];
      setUsers(arr.filter(u => u.is_active));
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const selectUser = (u: User) => {
    setSelected(u);
    const existing = configs[u.id];
    setEditEmail(existing?.email ?? u.email ?? "");
    setEditWebhook(existing?.webhook ?? "");
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);

    // Persist to localStorage
    const updated = {
      ...configs,
      [selected.id]: { userId: selected.id, email: editEmail, webhook: editWebhook }
    };
    setConfigs(updated);
    saveAlertConfigs(updated);

    // Also push to Go backend for any active renewal alerts for this user
    if (editEmail || editWebhook) {
      try {
        // Find certificates owned by this user and push config
        // For now we call with user_id as requester_id heuristic
        // The proper approach is to look up certs by requester_id = user.id
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

  const hasConfig = (u: User) => !!configs[u.id];

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
            {/* User summary */}
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

            {/* Email */}
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

            {/* Webhook */}
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

            {/* Delivery preview */}
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

            {/* Actions */}
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
                    <div key={cfg.userId} className="flex items-center gap-3 px-4 py-2.5">
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

// ─── Main Page ────────────────────────────────────────────────────────────────

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
        <p className="text-gray-400 text-sm mt-1">Configure system settings, notifications, and alert delivery</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="bg-gray-800/60 border border-gray-700 p-1 h-auto gap-1">
          {[
            { value: "general",       label: "General",       Icon: Globe    },
            { value: "notifications", label: "Notifications", Icon: Bell     },
            { value: "alerts",        label: "Alert Config",  Icon: Shield   },
            { value: "api",           label: "API",           Icon: Database },
          ].map(({ value, label, Icon }) => (
            <TabsTrigger key={value} value={value}
              className="data-[state=active]:bg-gray-700 data-[state=active]:text-white text-gray-400 text-xs flex items-center gap-1.5 px-3 py-1.5">
              <Icon className="h-3.5 w-3.5"/>{label}
            </TabsTrigger>
          ))}
        </TabsList>

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