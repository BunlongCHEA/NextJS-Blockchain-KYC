"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  ShieldCheck, RefreshCw, Download, Plus, Search,
  CheckCircle2, XCircle, Clock, AlertTriangle, Copy,
  Eye, Loader2, FileKey2, CalendarClock, BadgeCheck,
  Hash, Key, Building2, Upload, ChevronDown, X,
  Sparkles, AlertCircle, Info,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import api from "@/lib/api";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { useToast } from "@/components/ui/use-toast";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Certificate {
  id: string;
  certificate_id: string;
  customer_id: string;
  customer_name: string;
  requester_id: string;
  issued_at: number;
  expires_at: number;
  hash: string;
  status: string;
  key_type: string;
  issuer: string;
  // Full fields needed by POST /api/v1/certificate/verify
  issuer_public_key?: string;
  signature?: string;
  signed_at?: number;
  verified_by?: string;
  verification_date?: number;
  requester_public_key?: string;
  kyc_summary?: {
    first_name: string;
    last_name: string;
    nationality: string;
    id_type: string;
    risk_level: string;
    bank_id: string;
  };
}

interface FullCertificate {
  certificate_id: string;
  customer_id: string;
  status: string;
  verified_by: string;
  verification_date: number;
  expires_at: number;
  requester_id: string;
  requester_public_key?: string;
  kyc_summary?: {
    first_name: string;
    last_name: string;
    nationality: string;
    id_type: string;
    risk_level: string;
    bank_id: string;
  };
  issuer_id: string;
  issuer_public_key: string;
  key_type: string;
  signature: string;
  signed_at: number;
}

// GET /api/v1/keys  →  { keys: RequesterKey[], count: number }
interface RequesterKey {
  id: string;
  key_name: string;
  key_type: string;
  key_size: number;
  public_key_pem: string;
  fingerprint: string;
  organization: string;
  email: string;
  description: string;
  is_active: boolean;
  created_at: number;
  expires_at: number;
  created_by: string;
}

// GET /api/v1/banks/list
interface Bank {
  id: string;
  name: string;
  code: string;
  country: string;
  is_active: boolean;
}

// KYC lookup result
interface KYCLookup {
  customer_id: string;
  first_name: string;
  last_name: string;
  status: string;
  bank_id: string;
  risk_level: string;
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function getCertStatus(cert: Certificate): "active" | "expiring" | "grace" | "expired" {
  const d = differenceInDays(cert.expires_at * 1000, Date.now());
  if (d < -7) return "expired";
  if (d < 0)  return "grace";
  if (d <= 30) return "expiring";
  return "active";
}

const STATUS_CFG = {
  active:   { label: "Active",        color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", Icon: CheckCircle2  },
  expiring: { label: "Expiring Soon", color: "bg-amber-500/10 text-amber-400 border-amber-500/20",      Icon: AlertTriangle },
  grace:    { label: "Grace Period",  color: "bg-orange-500/10 text-orange-400 border-orange-500/20",   Icon: Clock        },
  expired:  { label: "Expired",       color: "bg-red-500/10 text-red-400 border-red-500/20",            Icon: XCircle      },
} as const;

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, accent }: {
  label: string; value: number; icon: React.ElementType; accent: string;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3">
      <div className={`p-2.5 rounded-lg shrink-0 ${accent}`}><Icon className="h-5 w-5" /></div>
      <div>
        <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
        <p className="text-xs text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ─── Generate Requester Key Dialog ────────────────────────────────────────────

interface GenerateKeyDialogProps {
  open: boolean;
  onClose: () => void;
  banks: Bank[];
  onGenerated: (key: RequesterKey) => void;
}

function GenerateKeyDialog({ open, onClose, banks, onGenerated }: GenerateKeyDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    key_name: "", key_type: "ECDSA", key_size: 256,
    organization: "", email: "", description: "", bank_id: "",
  });
  const [generating, setGenerating] = useState(false);
  // After generation, show the private key once
  const [generatedResult, setGeneratedResult] = useState<{
    key: RequesterKey;
    private_key_pem: string;
    private_key_path: string;
    public_key_path: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setForm({ key_name: "", key_type: "ECDSA", key_size: 256, organization: "", email: "", description: "", bank_id: "" });
      setGeneratedResult(null);
      setCopied(false);
    }
  }, [open]);

  // Auto-fill organization from bank selection
  const handleBankSelect = (bankId: string) => {
    const bank = banks.find((b) => b.id === bankId);
    setForm((f) => ({
      ...f,
      bank_id: bankId,
      organization: bank ? bank.name : f.organization,
      key_name: bank ? `${bank.code.toLowerCase()}-service` : f.key_name,
    }));
  };

  const handleGenerate = async () => {
    if (!form.key_name || !form.organization || !form.email) {
      toast({ title: "Key name, organization, and email are required", variant: "destructive" });
      return;
    }
    setGenerating(true);
    try {
      // POST /api/v1/keys/generate
      const res = await api.post("/api/v1/keys/generate", {
        key_name:     form.key_name,
        key_type:     form.key_type,
        key_size:     form.key_size,
        organization: form.organization,
        email:        form.email,
        description:  form.description || `${form.organization} certificate requests`,
      });

      // Response shape: { data: { key_pair: {...}, security_notice: {...}, files_saved: {...} } }
      const data = res.data?.data;
      const keyPair = data?.key_pair;

      const newKey: RequesterKey = {
        id:             keyPair?.key_id ?? "",
        key_name:       keyPair?.key_name ?? form.key_name,
        key_type:       keyPair?.key_type ?? form.key_type,
        key_size:       keyPair?.key_size ?? form.key_size,
        public_key_pem: keyPair?.public_key_pem ?? "",
        fingerprint:    keyPair?.fingerprint ?? "",
        organization:   keyPair?.organization ?? form.organization,
        email:          keyPair?.email ?? form.email,
        description:    form.description,
        is_active:      true,
        created_at:     Math.floor(Date.now() / 1000),
        expires_at:     Math.floor(Date.now() / 1000) + 2 * 365 * 86400,
        created_by:     "",
      };

      setGeneratedResult({
        key: newKey,
        private_key_pem:  keyPair?.private_key_pem ?? "",
        private_key_path: data?.files_saved?.private_key ?? "",
        public_key_path:  data?.files_saved?.public_key ?? "",
      });
      onGenerated(newKey);
      toast({ title: "Key pair generated — save your private key now!" });
    } catch (err: any) {
      toast({ title: err?.response?.data?.error || "Failed to generate key pair", variant: "destructive" });
    } finally {
      setGenerating(false);
    }
  };

  const copyPrivateKey = () => {
    if (generatedResult?.private_key_pem) {
      navigator.clipboard.writeText(generatedResult.private_key_pem);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const downloadPrivateKey = () => {
    if (!generatedResult) return;
    const blob = new Blob([generatedResult.private_key_pem], { type: "text/plain" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = `${form.key_name}_private.pem`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Key className="h-5 w-5 text-violet-400" />
            Generate Requester Key Pair
          </DialogTitle>
          <DialogDescription className="text-gray-500 text-xs">
            Calls <code className="text-cyan-400">POST /api/v1/keys/generate</code> — creates an RSA/ECDSA key pair.
            The private key is shown once only and saved to the server's Downloads folder.
          </DialogDescription>
        </DialogHeader>

        {!generatedResult ? (
          <div className="space-y-4 mt-1">
            {/* Bank selection — auto-fills org + key name */}
            <div className="space-y-1.5">
              <Label className="text-gray-300 text-sm flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-gray-500" />
                Select Bank <span className="text-gray-600 font-normal">(auto-fills fields)</span>
              </Label>
              <Select onValueChange={handleBankSelect}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-300">
                  <SelectValue placeholder="Choose a bank…" />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800">
                  {banks.map((b) => (
                    <SelectItem key={b.id} value={b.id} className="text-gray-300">
                      <span className="font-medium text-white">{b.name}</span>
                      <span className="text-gray-500 ml-2 text-xs">({b.code})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Key Name */}
              <div className="space-y-1.5 col-span-2">
                <Label className="text-gray-300 text-sm">Key Name <span className="text-red-400">*</span></Label>
                <Input
                  placeholder="aba-loan-service"
                  value={form.key_name}
                  onChange={(e) => setForm((f) => ({ ...f, key_name: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                />
                <p className="text-xs text-gray-600">Lowercase, hyphens OK. Must be unique.</p>
              </div>

              {/* Key Type */}
              <div className="space-y-1.5">
                <Label className="text-gray-300 text-sm">Key Type</Label>
                <Select value={form.key_type} onValueChange={(v) => {
                  const size = v === "RSA" ? 2048 : 256;
                  setForm((f) => ({ ...f, key_type: v, key_size: size }));
                }}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-800">
                    <SelectItem value="ECDSA">ECDSA (recommended)</SelectItem>
                    <SelectItem value="RSA">RSA</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Key Size */}
              <div className="space-y-1.5">
                <Label className="text-gray-300 text-sm">Key Size</Label>
                <Select
                  value={String(form.key_size)}
                  onValueChange={(v) => setForm((f) => ({ ...f, key_size: Number(v) }))}
                >
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-300">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-800">
                    {form.key_type === "RSA"
                      ? [2048, 3072, 4096].map((s) => <SelectItem key={s} value={String(s)}>{s} bits</SelectItem>)
                      : [256, 384, 521].map((s)    => <SelectItem key={s} value={String(s)}>{s} bits</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* Organization */}
              <div className="space-y-1.5 col-span-2">
                <Label className="text-gray-300 text-sm">Organization <span className="text-red-400">*</span></Label>
                <Input
                  placeholder="ABA Bank Ltd."
                  value={form.organization}
                  onChange={(e) => setForm((f) => ({ ...f, organization: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>

              {/* Email */}
              <div className="space-y-1.5 col-span-2">
                <Label className="text-gray-300 text-sm">Contact Email <span className="text-red-400">*</span></Label>
                <Input
                  type="email"
                  placeholder="tech@ababank.com"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>

              {/* Description */}
              <div className="space-y-1.5 col-span-2">
                <Label className="text-gray-300 text-sm">Description <span className="text-gray-600 font-normal">(optional)</span></Label>
                <Input
                  placeholder="Loan approval system certificate requests"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={onClose} className="border-gray-700 text-gray-300" disabled={generating}>Cancel</Button>
              <Button onClick={handleGenerate} disabled={generating} className="bg-violet-700 hover:bg-violet-600 text-white">
                {generating
                  ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Generating…</>
                  : <><Sparkles className="h-4 w-4 mr-1.5" />Generate Key Pair</>}
              </Button>
            </div>
          </div>
        ) : (
          /* ── Private key reveal (shown once) ── */
          <div className="space-y-4 mt-1">
            <div className="flex items-start gap-2.5 bg-amber-950/40 border border-amber-800/50 rounded-lg p-3.5">
              <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-300">Save your private key NOW</p>
                <p className="text-xs text-amber-400/80 mt-0.5">This is the only time it will be shown. It is NOT stored on the server.</p>
              </div>
            </div>

            {/* Key details */}
            <div className="bg-gray-800/60 rounded-lg border border-gray-700/50 px-4 py-3 space-y-2 text-xs">
              {[
                { label: "Key ID",       value: generatedResult.key.id,          mono: true },
                { label: "Key Name",     value: generatedResult.key.key_name },
                { label: "Type / Size",  value: `${generatedResult.key.key_type} ${generatedResult.key.key_size}-bit` },
                { label: "Fingerprint",  value: generatedResult.key.fingerprint,  mono: true },
                { label: "Organization", value: generatedResult.key.organization },
                { label: "Saved to",     value: generatedResult.private_key_path || "server Downloads folder", mono: true },
              ].map(({ label, value, mono }) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-gray-500 shrink-0">{label}</span>
                  <span className={`text-right break-all ${mono ? "font-mono text-cyan-400" : "text-gray-200"}`}>{value}</span>
                </div>
              ))}
            </div>

            {/* Private key PEM */}
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Private Key (PEM)</p>
              <div className="relative">
                <pre className="bg-gray-950 rounded-lg border border-gray-800 p-3 font-mono text-xs text-green-400 overflow-auto max-h-36 whitespace-pre-wrap break-all">
                  {generatedResult.private_key_pem}
                </pre>
              </div>
              <div className="flex gap-2 mt-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyPrivateKey}
                  className={`flex-1 border-gray-700 text-xs ${copied ? "text-green-400 border-green-700" : "text-gray-300"}`}
                >
                  <Copy className="h-3.5 w-3.5 mr-1.5" />
                  {copied ? "Copied!" : "Copy PEM"}
                </Button>
                <Button
                  size="sm"
                  onClick={downloadPrivateKey}
                  className="flex-1 bg-amber-700 hover:bg-amber-600 text-white text-xs"
                >
                  <Download className="h-3.5 w-3.5 mr-1.5" />
                  Download .pem file
                </Button>
              </div>
            </div>

            <Button onClick={onClose} className="w-full bg-gray-700 hover:bg-gray-600 text-white">
              Done — I have saved my private key
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Issue Certificate Dialog ─────────────────────────────────────────────────

interface IssueDialogProps {
  open: boolean;
  onClose: () => void;
  onIssued: (cert: FullCertificate) => void;
  requesterKeys: RequesterKey[];
  banks: Bank[];
  onOpenGenerateKey: () => void;
}

// Public key input mode
type PubKeyMode = "paste" | "file" | "from_key";

function IssueDialog({ open, onClose, onIssued, requesterKeys, banks, onOpenGenerateKey }: IssueDialogProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [customerSearch, setCustomerSearch] = useState("");
  const [kycResult,      setKycResult]      = useState<KYCLookup | null>(null);
  const [kycChecking,    setKycChecking]    = useState(false);
  const [kycError,       setKycError]       = useState<string | null>(null);

  // KYC list for search dropdown
  const [kycList,        setKycList]        = useState<KYCLookup[]>([]);
  const [showKycDropdown, setShowKycDropdown] = useState(false);
  const [kycListLoading, setKycListLoading] = useState(false);

  const [selectedKey,    setSelectedKey]    = useState<RequesterKey | null>(null);
  const [pubKeyMode,     setPubKeyMode]     = useState<PubKeyMode>("from_key");
  const [pastedPubKey,   setPastedPubKey]   = useState("");
  const [fileLoadError,  setFileLoadError]  = useState<string | null>(null);

  const [validityDays,   setValidityDays]   = useState(365);
  const [issuing,        setIssuing]        = useState(false);

  useEffect(() => {
    if (open) {
      setCustomerSearch(""); setKycResult(null); setKycError(null);
      setSelectedKey(null); setPastedPubKey(""); setFileLoadError(null);
      setPubKeyMode("from_key"); setValidityDays(365);
      setShowKycDropdown(false);
    }
  }, [open]);

  // Load VERIFIED KYC list for search
  useEffect(() => {
    if (!open) return;
    setKycListLoading(true);
    api.get("/api/v1/kyc/list", { params: { status: "VERIFIED", per_page: 100 } })
      .then((res) => {
        const data: any[] = res.data?.data || [];
        setKycList(data.map((k) => ({
          customer_id: k.customer_id,
          first_name:  k.first_name,
          last_name:   k.last_name,
          status:      k.status,
          bank_id:     k.bank_id,
          risk_level:  k.risk_level,
        })));
      })
      .catch(() => setKycList([]))
      .finally(() => setKycListLoading(false));
  }, [open]);

  // Filter KYC list by search
  const filteredKyc = kycList.filter((k) => {
    const q = customerSearch.toLowerCase();
    return !q ||
      k.customer_id.toLowerCase().includes(q) ||
      k.first_name.toLowerCase().includes(q) ||
      k.last_name.toLowerCase().includes(q);
  });

  const selectKYC = (kyc: KYCLookup) => {
    setCustomerSearch(`${kyc.first_name} ${kyc.last_name} (${kyc.customer_id})`);
    setKycResult(kyc);
    setShowKycDropdown(false);
    setKycError(null);
    // If selected key is from a different bank, warn
    if (selectedKey) {
      const keyBank = banks.find((b) => {
        const org = selectedKey.organization.toLowerCase();
        return b.name.toLowerCase().includes(org) || org.includes(b.name.toLowerCase());
      });
      if (keyBank && keyBank.id !== kyc.bank_id) {
        toast({
          title: `Warning: requester bank may not match customer's bank (${kyc.bank_id})`,
          variant: "destructive",
        });
      }
    }
  };

  // Handle .pem file upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".pem") && !file.name.endsWith(".pub") && !file.name.endsWith(".key")) {
      setFileLoadError("Please select a .pem, .pub, or .key file");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target?.result as string;
      if (!content.includes("BEGIN")) {
        setFileLoadError("File does not appear to be a valid PEM key");
        return;
      }
      setPastedPubKey(content.trim());
      setFileLoadError(null);
      toast({ title: `Loaded: ${file.name}` });
    };
    reader.onerror = () => setFileLoadError("Failed to read file");
    reader.readAsText(file);
    // Reset input so same file can be reloaded
    e.target.value = "";
  };

  // Derive public key to send
  const getPublicKey = (): string => {
    if (pubKeyMode === "from_key" && selectedKey) return selectedKey.public_key_pem;
    if (pubKeyMode === "paste" || pubKeyMode === "file") return pastedPubKey;
    return "";
  };

  // Bank match validation
  const getBankMismatchWarning = (): string | null => {
    if (!kycResult || !selectedKey) return null;
    const customerBank = banks.find((b) => b.id === kycResult.bank_id);
    if (!customerBank) return null;
    const orgLower  = selectedKey.organization.toLowerCase();
    const bankLower = customerBank.name.toLowerCase();
    if (!orgLower.includes(bankLower.split(" ")[0]) && !bankLower.includes(orgLower.split(" ")[0])) {
      return `Customer registered at ${customerBank.name}. Selected key is from "${selectedKey.organization}". Ensure this is correct.`;
    }
    return null;
  };

  const bankMismatch = getBankMismatchWarning();

  const handleIssue = async () => {
    if (!kycResult) {
      toast({ title: "Please select a verified customer", variant: "destructive" }); return;
    }
    if (!selectedKey && pubKeyMode === "from_key") {
      toast({ title: "Please select a requester key or switch to paste/file mode", variant: "destructive" }); return;
    }
    if ((pubKeyMode === "paste" || pubKeyMode === "file") && !pastedPubKey) {
      toast({ title: "Public key is required", variant: "destructive" }); return;
    }

    setIssuing(true);
    try {
      const res = await api.post("/api/v1/certificate/issue", {
        customer_id:          kycResult.customer_id,
        requester_id:         selectedKey?.key_name ?? selectedKey?.id ?? "manual-request",
        requester_public_key: getPublicKey() || undefined,
        validity_days:        validityDays,
      });

      const cert: FullCertificate = res.data?.data?.certificate;
      if (!cert?.certificate_id) throw new Error("No certificate returned");

      const validityInfo = res.data?.data?.validity_info;
      const actualDays   = validityInfo?.actual_days ?? validityDays;
      const expiresDate  = cert.expires_at ? format(new Date(cert.expires_at * 1000), "MMM d, yyyy") : "—";
      const reason       = validityInfo?.reason ?? "";

      const msg = actualDays < validityDays
        ? `Certificate issued — ${actualDays}d validity (capped from ${validityDays}d). Expires ${expiresDate}. ${reason}`
        : `Certificate issued — valid ${actualDays}d, expires ${expiresDate}`;

      toast({ title: msg });
      onIssued(cert);
      onClose();
    } catch (err: any) {
      toast({ title: err?.response?.data?.error || "Failed to issue certificate", variant: "destructive" });
    } finally {
      setIssuing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <ShieldCheck className="h-5 w-5 text-cyan-400" />
            Issue Verification Certificate
          </DialogTitle>
          <DialogDescription className="text-gray-500 text-xs">
            KYC must be VERIFIED. Validity is automatically capped by ID expiry + review cycle.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-1">

          {/* ── 1. Customer Search ── */}
          <div className="space-y-1.5">
            <Label className="text-gray-300 text-sm font-medium">
              Customer <span className="text-red-400">*</span>
            </Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
              <Input
                placeholder="Search by name or customer ID…"
                value={customerSearch}
                onFocus={() => setShowKycDropdown(true)}
                onBlur={() => {
                  // Delay so onMouseDown on a dropdown item fires first
                  setTimeout(() => setShowKycDropdown(false), 150);
                }}
                onChange={(e) => {
                  setCustomerSearch(e.target.value);
                  setKycResult(null);
                  setShowKycDropdown(true);
                }}
                className="pl-8 bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
              />
              {kycChecking && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 animate-spin" />}
            </div>

            {/* KYC dropdown */}
            {showKycDropdown && (
              <div className="relative">
                {/* Backdrop — rendered FIRST so it sits below the list in stacking order */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setShowKycDropdown(false)}
                />
                {/* Dropdown list — z-50 so it renders above the backdrop */}
                <div className="absolute top-0 left-0 right-0 z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl overflow-hidden max-h-48 overflow-y-auto">
                  {kycListLoading ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-gray-500">
                      <Loader2 className="h-3 w-3 animate-spin" />Loading verified customers…
                    </div>
                  ) : filteredKyc.length === 0 ? (
                    <div className="px-3 py-2.5 text-xs text-gray-500">
                      {customerSearch ? "No matching VERIFIED customers" : "No verified customers found"}
                    </div>
                  ) : (
                    filteredKyc.map((kyc) => {
                      const bank = banks.find((b) => b.id === kyc.bank_id);
                      return (
                        <button
                          key={kyc.customer_id}
                          // Use onMouseDown so selection fires before the input's onBlur
                          // which would otherwise close the dropdown before onClick runs
                          onMouseDown={(e) => {
                            e.preventDefault(); // prevent input blur
                            selectKYC(kyc);
                          }}
                          className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-gray-700 transition-colors text-left"
                        >
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <p className="text-sm text-white font-medium truncate">
                              {kyc.first_name} {kyc.last_name}
                            </p>
                            <p className="text-xs text-gray-500 font-mono">{kyc.customer_id}</p>
                            {bank && (
                              <p className="text-xs text-cyan-600 mt-0.5">{bank.name}</p>
                            )}
                          </div>
                          <span className={`ml-auto text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
                            kyc.risk_level === "high"   ? "bg-red-900/50 text-red-300"
                            : kyc.risk_level === "medium" ? "bg-amber-900/50 text-amber-300"
                            : "bg-green-900/50 text-green-300"
                          }`}>{kyc.risk_level}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Selected customer badge */}
            {kycResult && (
              <div className="flex items-center gap-2 bg-emerald-950/30 border border-emerald-800/40 rounded-lg px-3 py-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-emerald-300 font-medium">
                    {kycResult.first_name} {kycResult.last_name}
                  </p>
                  <p className="text-xs text-gray-500 font-mono">{kycResult.customer_id}</p>
                </div>
                <div className="text-right text-xs">
                  <p className="text-emerald-400">VERIFIED</p>
                  <p className="text-gray-600">{banks.find((b) => b.id === kycResult.bank_id)?.name ?? kycResult.bank_id}</p>
                </div>
                <button onClick={() => { setKycResult(null); setCustomerSearch(""); }} className="text-gray-600 hover:text-gray-300 ml-1">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* ── 2. Requester Key ── */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-gray-300 text-sm font-medium">Requester Key</Label>
              <button
                onClick={onOpenGenerateKey}
                className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
              >
                <Sparkles className="h-3 w-3" />Generate new key
              </button>
            </div>

            {/* Key dropdown */}
            <Select
              value={selectedKey?.id ?? ""}
              onValueChange={(id) => {
                const key = requesterKeys.find((k) => k.id === id) ?? null;
                setSelectedKey(key);
                if (key) setPubKeyMode("from_key");
              }}
            >
              <SelectTrigger className="bg-gray-800 border-gray-700 text-gray-300">
                <SelectValue placeholder="Select a requester key…" />
              </SelectTrigger>
              <SelectContent className="bg-gray-900 border-gray-800 max-h-52">
                {requesterKeys.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-gray-500">
                    No keys yet — generate one above
                  </div>
                ) : (
                  requesterKeys.filter((k) => k.is_active).map((k) => (
                    <SelectItem key={k.id} value={k.id}>
                      <div className="flex flex-col">
                        <span className="text-white font-medium">{k.key_name}</span>
                        <span className="text-gray-500 text-xs">{k.organization} · {k.key_type}-{k.key_size}</span>
                      </div>
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>

            {/* Selected key info + bank match */}
            {selectedKey && (
              <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 px-3 py-2 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Organization</span>
                  <span className="text-gray-200">{selectedKey.organization}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Type</span>
                  <span className="font-mono text-cyan-400">{selectedKey.key_type}-{selectedKey.key_size}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Fingerprint</span>
                  <span className="font-mono text-gray-400">{selectedKey.fingerprint}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Expires</span>
                  <span className="text-gray-300">{format(new Date(selectedKey.expires_at * 1000), "MMM d, yyyy")}</span>
                </div>
              </div>
            )}

            {/* Bank mismatch warning */}
            {bankMismatch && (
              <div className="flex items-start gap-2 bg-amber-950/30 border border-amber-800/40 rounded-lg px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-400">{bankMismatch}</p>
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <div className="flex-1 h-px bg-gray-800" />
              or provide public key manually
              <div className="flex-1 h-px bg-gray-800" />
            </div>

            {/* Public key mode tabs */}
            <div className="flex gap-1.5">
              {([["paste", "Paste PEM"], ["file", "Upload File"]] as [PubKeyMode, string][]).map(([m, label]) => (
                <button
                  key={m}
                  onClick={() => { setPubKeyMode(m); setSelectedKey(null); }}
                  className={`flex-1 py-1.5 text-xs rounded border transition-colors ${
                    pubKeyMode === m && !selectedKey
                      ? "bg-gray-700 border-gray-600 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
                  }`}
                >
                  {m === "file" ? <><Upload className="h-3 w-3 inline mr-1" />{label}</> : label}
                </button>
              ))}
            </div>

            {/* Paste mode */}
            {!selectedKey && pubKeyMode === "paste" && (
              <Textarea
                placeholder={"-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKN...\n-----END PUBLIC KEY-----"}
                value={pastedPubKey}
                onChange={(e) => setPastedPubKey(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 font-mono text-xs h-24 resize-none"
              />
            )}

            {/* File upload mode */}
            {!selectedKey && pubKeyMode === "file" && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pem,.pub,.key,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-gray-700 rounded-lg py-4 text-sm text-gray-500 hover:border-gray-600 hover:text-gray-300 transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Click to upload .pem / .pub / .key file
                </button>
                {pastedPubKey && (
                  <div className="mt-2 flex items-center gap-2 text-xs text-emerald-400">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Public key loaded from file
                    <button onClick={() => setPastedPubKey("")} className="ml-auto text-gray-600 hover:text-gray-300">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
                {fileLoadError && <p className="mt-1.5 text-xs text-red-400">{fileLoadError}</p>}
              </div>
            )}

            <p className="text-xs text-gray-600 flex items-center gap-1">
              <Info className="h-3 w-3" />
              Public key is optional — certificate is still valid without it
            </p>
          </div>

          {/* ── 3. Validity ── */}
          <div className="space-y-1.5">
            <Label className="text-gray-300 text-sm font-medium">Requested Validity</Label>
            <div className="flex gap-2">
              {[30, 90, 180, 365].map((d) => (
                <button
                  key={d}
                  onClick={() => setValidityDays(d)}
                  className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${
                    validityDays === d
                      ? "bg-cyan-700 border-cyan-600 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600"
                  }`}
                >
                  {d}d
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-600">
              Actual validity may be shorter if ID expires sooner or KYC review is due
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="border-gray-700 text-gray-300" disabled={issuing}>Cancel</Button>
            <Button
              onClick={handleIssue}
              disabled={issuing || !kycResult}
              className="bg-cyan-700 hover:bg-cyan-600 text-white"
            >
              {issuing
                ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Issuing…</>
                : <><ShieldCheck className="h-4 w-4 mr-1.5" />Issue Certificate</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Verify Dialog ────────────────────────────────────────────────────────────

function VerifyDialog({ open, initialJson, onClose }: {
  open: boolean; initialJson?: string; onClose: () => void;
}) {
  const { toast } = useToast();
  const [json, setJson]           = useState(initialJson ?? "");
  const [verifying, setVerifying] = useState(false);
  const [result, setResult]       = useState<{ valid: boolean; message: string; data?: Record<string, unknown> } | null>(null);

  useEffect(() => { setJson(initialJson ?? ""); setResult(null); }, [initialJson, open]);

  const handleVerify = async () => {
    if (!json.trim()) { toast({ title: "Paste the certificate JSON first", variant: "destructive" }); return; }
    let parsed: unknown;
    try { parsed = JSON.parse(json); } catch { toast({ title: "Invalid JSON format", variant: "destructive" }); return; }
    setVerifying(true); setResult(null);
    try {
      const res = await api.post("/api/v1/certificate/verify", { certificate: parsed });
      setResult({ valid: true, message: res.data?.message ?? "Verification successful", data: res.data?.data });
    } catch (err: any) {
      setResult({ valid: false, message: err?.response?.data?.error ?? "Verification failed" });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <BadgeCheck className="h-5 w-5 text-emerald-400" />Verify Certificate
          </DialogTitle>
          <DialogDescription className="text-gray-500 text-xs">
            <code className="text-cyan-400">POST /api/v1/certificate/verify</code> — public endpoint, no auth needed.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            placeholder='{"certificate_id":"CERT...","customer_id":"CUST...","signature":"..."}'
            value={json}
            onChange={(e) => setJson(e.target.value)}
            className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 font-mono text-xs h-36 resize-none"
          />
          {result && (
            <div className={`rounded-lg border p-3.5 ${result.valid ? "bg-emerald-500/5 border-emerald-500/20" : "bg-red-500/5 border-red-500/20"}`}>
              <div className="flex items-start gap-2.5">
                {result.valid
                  ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                  : <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />}
                <div className="space-y-1.5 flex-1">
                  <p className={`text-sm font-medium ${result.valid ? "text-emerald-400" : "text-red-400"}`}>
                    {result.valid ? "Certificate is Valid ✓" : "Certificate is Invalid"}
                  </p>
                  <p className="text-xs text-gray-400">{result.message}</p>
                  {result.data && (
                    <div className="mt-2 space-y-1 text-xs">
                      {Boolean(result.data.customer_id)      && <div className="flex justify-between"><span className="text-gray-500">Customer ID</span><span className="font-mono text-gray-300">{String(result.data.customer_id)}</span></div>}
                      {Boolean(result.data.expires_at_human) && <div className="flex justify-between"><span className="text-gray-500">Expires</span><span className="text-gray-300">{String(result.data.expires_at_human)}</span></div>}
                      {Boolean(result.data.key_type)         && <div className="flex justify-between"><span className="text-gray-500">Key Type</span><span className="text-gray-300">{String(result.data.key_type)}</span></div>}
                      {Boolean(result.data.grace_period)     && (
                        <div className="flex items-center gap-1.5 mt-1 bg-orange-500/10 border border-orange-500/20 rounded px-2 py-1.5">
                          <AlertTriangle className="h-3 w-3 text-orange-400 shrink-0" />
                          <span className="text-orange-300 text-xs">In grace period — renewal required immediately</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} className="border-gray-700 text-gray-300">Close</Button>
            <Button onClick={handleVerify} disabled={verifying || !json.trim()} className="bg-emerald-700 hover:bg-emerald-600 text-white">
              {verifying ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Verifying…</> : <><BadgeCheck className="h-4 w-4 mr-1.5" />Verify</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cert Detail Dialog ───────────────────────────────────────────────────────

function CertDetailDialog({ cert, fullCert, onClose, onDownload, onVerify }: {
  cert: Certificate | null; fullCert: FullCertificate | null;
  onClose: () => void; onDownload: (c: Certificate) => void; onVerify: (c: Certificate) => void;
}) {
  const { toast } = useToast();
  if (!cert) return null;
  const certStatus = getCertStatus(cert);
  const cfg = STATUS_CFG[certStatus];
  const copy = (text: string, label: string) => { navigator.clipboard.writeText(text); toast({ title: `${label} copied` }); };

  const Field = ({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) => {
    if (!value && value !== 0) return null;
    return (
      <div className="flex justify-between items-start gap-4 py-2 border-b border-gray-800/60 last:border-0">
        <span className="text-xs text-gray-500 shrink-0 w-36">{label}</span>
        <span className={`text-xs text-right break-all flex-1 ${mono ? "font-mono text-cyan-400" : "text-gray-200"}`}>{String(value)}</span>
      </div>
    );
  };

  return (
    <Dialog open={Boolean(cert)} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <FileKey2 className="h-5 w-5 text-cyan-400" />Certificate Details
          </DialogTitle>
        </DialogHeader>
        <div className={`flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 ${cfg.color}`}>
          <cfg.Icon className="h-4 w-4 shrink-0" />
          <div>
            <p className="text-sm font-medium">{cfg.label}</p>
            {cert.expires_at && (
              <p className="text-xs opacity-70 mt-0.5">
                {certStatus === "expired"
                  ? `Expired ${formatDistanceToNow(cert.expires_at * 1000)} ago`
                  : `Expires ${formatDistanceToNow(cert.expires_at * 1000, { addSuffix: true })}`}
              </p>
            )}
          </div>
        </div>
        <div className="bg-gray-800/40 rounded-lg border border-gray-700/50 px-4 py-2">
          <Field label="Certificate ID" value={cert.certificate_id} mono />
          <Field label="Customer"       value={cert.customer_name || cert.customer_id} />
          <Field label="Customer ID"    value={cert.customer_id} mono />
          <Field label="Requester ID"   value={cert.requester_id} mono />
          <Field label="Key Type"       value={cert.key_type} />
          <Field label="Issuer"         value={cert.issuer || "KYC-BLOCKCHAIN-SYSTEM"} />
          <Field label="Issued At"      value={cert.issued_at ? format(new Date(cert.issued_at * 1000), "MMM d, yyyy HH:mm:ss") : undefined} />
          <Field label="Expires At"     value={cert.expires_at ? format(new Date(cert.expires_at * 1000), "MMM d, yyyy HH:mm:ss") : undefined} />
        </div>
        {fullCert?.kyc_summary && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">KYC Summary</p>
            <div className="bg-gray-800/40 rounded-lg border border-gray-700/50 px-4 py-2">
              <Field label="Name"        value={`${fullCert.kyc_summary.first_name} ${fullCert.kyc_summary.last_name}`} />
              <Field label="Nationality" value={fullCert.kyc_summary.nationality} />
              <Field label="ID Type"     value={fullCert.kyc_summary.id_type} />
              <Field label="Risk Level"  value={fullCert.kyc_summary.risk_level} />
              <Field label="Bank ID"     value={fullCert.kyc_summary.bank_id} mono />
            </div>
          </div>
        )}
        {cert.hash && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1.5">Signature</p>
            <div className="bg-gray-950 rounded-lg border border-gray-800 p-3 flex items-start gap-2">
              <p className="font-mono text-xs text-cyan-400 break-all flex-1 line-clamp-3">{cert.hash}</p>
              <button onClick={() => copy(cert.hash, "Signature")} className="text-gray-600 hover:text-gray-300 shrink-0 mt-0.5">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
        <div className="flex justify-between items-center pt-1">
          <Button variant="outline" size="sm" onClick={() => onDownload(cert)} className="border-gray-700 text-gray-300 hover:text-white">
            <Download className="h-3.5 w-3.5 mr-1.5" />Download JSON
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => onVerify(cert)} className="border-gray-700 text-gray-300 hover:text-white">
              <BadgeCheck className="h-3.5 w-3.5 mr-1.5" />Re-verify
            </Button>
            <Button size="sm" onClick={onClose} className="bg-gray-700 hover:bg-gray-600 text-white">Close</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CertificatesPage() {
  const { toast } = useToast();

  const [certs,        setCerts]        = useState<Certificate[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Shared data fetched once
  const [requesterKeys, setRequesterKeys] = useState<RequesterKey[]>([]);
  const [banks,         setBanks]         = useState<Bank[]>([]);

  // Dialog state
  const [showIssue,       setShowIssue]       = useState(false);
  const [showGenerateKey, setShowGenerateKey] = useState(false);
  const [showVerify,      setShowVerify]      = useState(false);
  const [verifyJson,      setVerifyJson]      = useState<string | undefined>(undefined);
  const [selected,        setSelected]        = useState<Certificate | null>(null);
  const [fullCert,        setFullCert]        = useState<FullCertificate | null>(null);

  // Fetch certs
  const fetchCerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/certificates/list");
      const data = res.data?.data || res.data || [];
      setCerts(Array.isArray(data) ? data : []);
    } catch { setCerts([]); } finally { setLoading(false); }
  }, []);

  // Fetch requester keys
  const fetchKeys = useCallback(async () => {
    try {
      const res = await api.get("/api/v1/keys");
      const data = res.data?.data?.keys || res.data?.keys || [];
      setRequesterKeys(Array.isArray(data) ? data : []);
    } catch { setRequesterKeys([]); }
  }, []);

  // Fetch banks
  const fetchBanks = useCallback(async () => {
    try {
      const res = await api.get("/api/v1/banks/list");
      const data = res.data?.data || res.data || [];
      setBanks(Array.isArray(data) ? data : []);
    } catch { setBanks([]); }
  }, []);

  useEffect(() => {
    fetchCerts();
    fetchKeys();
    fetchBanks();
  }, [fetchCerts, fetchKeys, fetchBanks]);

  // Filter
  const filtered = certs.filter((c) => {
    const q = search.toLowerCase();
    return (
      (!q || c.customer_name?.toLowerCase().includes(q) || c.customer_id?.toLowerCase().includes(q) ||
       c.requester_id?.toLowerCase().includes(q) || c.certificate_id?.toLowerCase().includes(q)) &&
      (statusFilter === "all" || getCertStatus(c) === statusFilter)
    );
  });

  const stats = {
    total:    certs.length,
    active:   certs.filter((c) => getCertStatus(c) === "active").length,
    expiring: certs.filter((c) => getCertStatus(c) === "expiring").length,
    expired:  certs.filter((c) => getCertStatus(c) === "expired" || getCertStatus(c) === "grace").length,
  };

  const handleIssued = (cert: FullCertificate) => {
    const row: Certificate = {
      id:                   cert.certificate_id,
      certificate_id:       cert.certificate_id,
      customer_id:          cert.customer_id,
      customer_name:        cert.kyc_summary
        ? `${cert.kyc_summary.first_name} ${cert.kyc_summary.last_name}`.trim()
        : cert.customer_id,
      requester_id:         cert.requester_id,
      issued_at:            cert.signed_at,
      expires_at:           cert.expires_at,
      hash:                 cert.signature,
      status:               cert.status,
      key_type:             cert.key_type,
      issuer:               cert.issuer_id,
      // Store full verify-required fields
      issuer_public_key:    cert.issuer_public_key,
      signature:            cert.signature,
      signed_at:            cert.signed_at,
      verified_by:          cert.verified_by,
      verification_date:    cert.verification_date,
      requester_public_key: cert.requester_public_key,
      kyc_summary:          cert.kyc_summary,
    };
    setCerts((prev) => [row, ...prev]);
    setSelected(row); setFullCert(cert);
  };

  const handleKeyGenerated = (key: RequesterKey) => {
    setRequesterKeys((prev) => [key, ...prev]);
  };

  const downloadCert = (cert: Certificate) => {
    // Write the full Go VerificationCertificate shape so the file can be
    // pasted directly into POST /api/v1/certificate/verify
    const verifyCert = {
      certificate_id:       cert.certificate_id,
      customer_id:          cert.customer_id,
      status:               cert.status,
      verified_by:          cert.verified_by ?? "",
      verification_date:    cert.verification_date ?? 0,
      expires_at:           cert.expires_at,
      requester_id:         cert.requester_id,
      requester_public_key: cert.requester_public_key ?? "",
      kyc_summary:          cert.kyc_summary ?? {},
      issuer_id:            cert.issuer ?? "",
      issuer_public_key:    cert.issuer_public_key ?? "",
      key_type:             cert.key_type,
      signature:            cert.signature ?? cert.hash,
      signed_at:            cert.signed_at ?? cert.issued_at,
    };
    const blob = new Blob([JSON.stringify(verifyCert, null, 2)], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url;
    a.download = `cert-${cert.customer_id}-${cert.certificate_id?.slice(-8) ?? "kyc"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openVerify = (cert?: Certificate) => {
    if (cert) {
      // Build the exact shape Go's VerifyCertificate handler expects
      // (models.VerificationCertificate fields, not the frontend Certificate row aliases)
      const verifyCert = {
        certificate_id:       cert.certificate_id,
        customer_id:          cert.customer_id,
        status:               cert.status,
        verified_by:          cert.verified_by ?? "",
        verification_date:    cert.verification_date ?? 0,
        expires_at:           cert.expires_at,
        requester_id:         cert.requester_id,
        requester_public_key: cert.requester_public_key ?? "",
        kyc_summary:          cert.kyc_summary ?? {},
        issuer_id:            cert.issuer ?? "",
        issuer_public_key:    cert.issuer_public_key ?? "",
        key_type:             cert.key_type,
        signature:            cert.signature ?? cert.hash,
        signed_at:            cert.signed_at ?? cert.issued_at,
      };
      setVerifyJson(JSON.stringify(verifyCert, null, 2));
    } else {
      setVerifyJson(undefined);
    }
    setShowVerify(true);
  };

  const copy = (text: string, label = "Copied") => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied` });
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* ── Header ── */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-cyan-500/10 rounded-lg border border-cyan-500/20">
                <ShieldCheck className="h-5 w-5 text-cyan-400" />
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">Certificates</h1>
            </div>
            <p className="text-gray-500 text-sm mt-1.5 ml-0.5">KYC verification certificates — issue, verify, and audit</p>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            <Button onClick={() => setShowGenerateKey(true)} variant="outline" size="sm" className="border-violet-800 text-violet-400 hover:bg-violet-900/20">
              <Key className="h-4 w-4 mr-1.5" />Generate Key
            </Button>
            <Button onClick={() => openVerify()} variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:text-white">
              <BadgeCheck className="h-4 w-4 mr-1.5" />Verify
            </Button>
            <Button onClick={() => setShowIssue(true)} size="sm" className="bg-cyan-700 hover:bg-cyan-600 text-white">
              <Plus className="h-4 w-4 mr-1.5" />Issue Certificate
            </Button>
            <Button onClick={() => { fetchCerts(); fetchKeys(); }} variant="ghost" size="icon" className="text-gray-400 hover:text-white" disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* ── Stats ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Total"         value={stats.total}    icon={FileKey2}      accent="bg-cyan-500/10 text-cyan-400" />
          <StatCard label="Active"        value={stats.active}   icon={CheckCircle2}  accent="bg-emerald-500/10 text-emerald-400" />
          <StatCard label="Expiring Soon" value={stats.expiring} icon={CalendarClock} accent="bg-amber-500/10 text-amber-400" />
          <StatCard label="Expired/Grace" value={stats.expired}  icon={XCircle}       accent="bg-red-500/10 text-red-400" />
        </div>

        {/* ── Requester keys summary ── */}
        {requesterKeys.length > 0 && (
          <div className="flex items-center gap-3 bg-gray-900/50 border border-gray-800 rounded-xl px-4 py-2.5">
            <Key className="h-4 w-4 text-violet-400 shrink-0" />
            <p className="text-xs text-gray-400">
              <span className="text-white font-medium">{requesterKeys.filter((k) => k.is_active).length}</span> active requester key{requesterKeys.filter((k) => k.is_active).length !== 1 ? "s" : ""}
              {requesterKeys.some((k) => k.is_active && differenceInDays(k.expires_at * 1000, Date.now()) <= 30) && (
                <span className="ml-2 text-amber-400">⚠ Some keys expiring soon</span>
              )}
            </p>
            <div className="ml-auto flex gap-1.5">
              {requesterKeys.filter((k) => k.is_active).slice(0, 3).map((k) => (
                <span key={k.id} className="text-xs bg-gray-800 border border-gray-700 text-gray-300 px-2 py-0.5 rounded-full">
                  {k.key_name}
                </span>
              ))}
              {requesterKeys.filter((k) => k.is_active).length > 3 && (
                <span className="text-xs text-gray-600">+{requesterKeys.filter((k) => k.is_active).length - 3} more</span>
              )}
            </div>
          </div>
        )}

        {/* ── Table ── */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3 border-b border-gray-800 px-4 pt-4">
            <div className="flex gap-2">
              <div className="relative flex-1 max-w-sm">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500" />
                <Input
                  placeholder="Search customer, requester, cert ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8 h-8 text-sm bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] h-8 text-sm bg-gray-800 border-gray-700 text-gray-300">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-900 border-gray-800">
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="expiring">Expiring Soon</SelectItem>
                  <SelectItem value="grace">Grace Period</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800 hover:bg-transparent">
                  <TableHead className="text-gray-500 text-xs uppercase pl-4">Customer</TableHead>
                  <TableHead className="text-gray-500 text-xs uppercase">Requester Key</TableHead>
                  <TableHead className="text-gray-500 text-xs uppercase">Signature</TableHead>
                  <TableHead className="text-gray-500 text-xs uppercase">Issued</TableHead>
                  <TableHead className="text-gray-500 text-xs uppercase">Expires</TableHead>
                  <TableHead className="text-gray-500 text-xs uppercase">Status</TableHead>
                  <TableHead className="text-right text-gray-500 text-xs uppercase pr-4">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(4)].map((_, i) => (
                    <TableRow key={i} className="border-gray-800">
                      {[...Array(7)].map((_, j) => <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800 rounded" /></TableCell>)}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-16">
                      <div className="flex flex-col items-center gap-3">
                        <FileKey2 className="h-8 w-8 text-gray-700" />
                        <p className="text-gray-500 text-sm">
                          {search || statusFilter !== "all" ? "No certificates match your filters" : "No certificates issued yet"}
                        </p>
                        {!search && statusFilter === "all" && (
                          <Button onClick={() => setShowIssue(true)} size="sm" variant="outline" className="border-gray-700 text-gray-400 hover:text-white">
                            <Plus className="h-3.5 w-3.5 mr-1.5" />Issue first certificate
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((cert) => {
                    const certStatus = getCertStatus(cert);
                    const cfg        = STATUS_CFG[certStatus];
                    const daysLeft   = differenceInDays(cert.expires_at * 1000, Date.now());
                    // Match requester key for display
                    const matchedKey = requesterKeys.find((k) => k.key_name === cert.requester_id || k.id === cert.requester_id);
                    return (
                      <TableRow
                        key={cert.certificate_id}
                        className="border-gray-800 hover:bg-gray-800/30 cursor-pointer transition-colors"
                        onClick={() => { setSelected(cert); setFullCert(null); }}
                      >
                        <TableCell className="pl-4 py-3.5">
                          <p className="text-white text-sm font-medium">{cert.customer_name || cert.customer_id}</p>
                          <p className="text-gray-500 text-xs font-mono mt-0.5">{cert.customer_id}</p>
                        </TableCell>
                        <TableCell className="py-3.5">
                          {matchedKey ? (
                            <div>
                              <p className="text-gray-200 text-xs font-medium">{matchedKey.key_name}</p>
                              <p className="text-gray-600 text-xs">{matchedKey.organization}</p>
                            </div>
                          ) : (
                            <p className="text-gray-400 text-xs font-mono">{cert.requester_id || "—"}</p>
                          )}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <div className="flex items-center gap-1.5">
                            <Hash className="h-3.5 w-3.5 text-gray-600 shrink-0" />
                            <span className="font-mono text-xs text-cyan-400">
                              {cert.hash ? cert.hash.slice(0, 18) + "…" : cert.certificate_id?.slice(0, 18) + "…"}
                            </span>
                            <button onClick={(e) => { e.stopPropagation(); copy(cert.hash || cert.certificate_id, "Signature"); }} className="text-gray-600 hover:text-gray-300">
                              <Copy className="h-3 w-3" />
                            </button>
                          </div>
                        </TableCell>
                        <TableCell className="py-3.5 text-gray-400 text-sm">
                          {cert.issued_at ? format(new Date(cert.issued_at * 1000), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <p className={`text-sm ${certStatus === "expired" ? "text-red-400" : certStatus === "expiring" || certStatus === "grace" ? "text-amber-400" : "text-gray-300"}`}>
                            {cert.expires_at ? format(new Date(cert.expires_at * 1000), "MMM d, yyyy") : "—"}
                          </p>
                          {cert.expires_at && (
                            <p className="text-xs text-gray-600 mt-0.5">
                              {daysLeft < 0 ? `${Math.abs(daysLeft)}d ago` : `in ${daysLeft}d`}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="py-3.5">
                          <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-0.5 rounded-full border font-medium ${cfg.color}`}>
                            <cfg.Icon className="h-3 w-3" />{cfg.label}
                          </span>
                        </TableCell>
                        <TableCell className="pr-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-white"
                                  onClick={() => { setSelected(cert); setFullCert(null); }}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-gray-800 border-gray-700 text-xs">View details</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7 text-gray-500 hover:text-white"
                                  onClick={() => downloadCert(cert)}>
                                  <Download className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-gray-800 border-gray-700 text-xs">Download JSON</TooltipContent>
                            </Tooltip>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
            {!loading && filtered.length > 0 && (
              <div className="px-4 py-2.5 border-t border-gray-800 flex justify-between items-center">
                <p className="text-xs text-gray-600">{filtered.length} of {certs.length} certificates</p>
                {(search || statusFilter !== "all") && (
                  <button onClick={() => { setSearch(""); setStatusFilter("all"); }} className="text-xs text-cyan-500 hover:text-cyan-400">
                    Clear filters
                  </button>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Dialogs ── */}
      <GenerateKeyDialog
        open={showGenerateKey}
        onClose={() => setShowGenerateKey(false)}
        banks={banks}
        onGenerated={handleKeyGenerated}
      />
      <IssueDialog
        open={showIssue}
        onClose={() => setShowIssue(false)}
        onIssued={handleIssued}
        requesterKeys={requesterKeys}
        banks={banks}
        onOpenGenerateKey={() => { setShowIssue(false); setShowGenerateKey(true); }}
      />
      <VerifyDialog
        open={showVerify}
        initialJson={verifyJson}
        onClose={() => { setShowVerify(false); setVerifyJson(undefined); }}
      />
      <CertDetailDialog
        cert={selected}
        fullCert={fullCert}
        onClose={() => { setSelected(null); setFullCert(null); }}
        onDownload={downloadCert}
        onVerify={(c) => openVerify(c)}
      />
    </TooltipProvider>
  );
}