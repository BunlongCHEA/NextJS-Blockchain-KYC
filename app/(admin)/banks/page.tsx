"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Building2, Plus, RefreshCw, CheckCircle, XCircle,
  Pencil, Trash2, MapPin, Phone, Mail, Globe,
  Search, Shield, Loader2, X, ChevronDown, ChevronUp,
} from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "@/components/ui/use-toast";
import api from "@/lib/api";
import { format } from "date-fns";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Address {
  street:      string;
  city:        string;
  state:       string;
  postal_code: string;
  country:     string;
}

interface Bank {
  id:            string;
  name:          string;
  code:          string;
  country:       string;
  license_no:    string;
  is_active:     boolean;
  contact_email: string;
  contact_phone: string;
  address:       Address;
  created_at:    string;
  updated_at:    string;
}

const emptyForm = (): Partial<Bank> & { address: Address } => ({
  name: "", code: "", country: "", license_no: "",
  contact_email: "", contact_phone: "",
  address: { street: "", city: "", state: "", postal_code: "", country: "" },
});

// ─── Bank Form Dialog ─────────────────────────────────────────────────────────

function BankFormDialog({
  mode, bank, open, onClose, onSaved,
}: {
  mode:    "create" | "edit";
  bank:    Bank | null;
  open:    boolean;
  onClose: () => void;
  onSaved: (b: Bank) => void;
}) {
  const [form,    setForm]    = useState(emptyForm());
  const [saving,  setSaving]  = useState(false);
  const [showAddr, setShowAddr] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(bank
        ? { ...bank, address: bank.address ?? emptyForm().address }
        : emptyForm()
      );
      setShowAddr(false);
    }
  }, [open, bank]);

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));
  const setAddr = (k: string, v: string) =>
    setForm(p => ({ ...p, address: { ...p.address!, [k]: v } }));

  const handleSubmit = async () => {
    if (!form.name?.trim()) { toast({ title: "Bank name is required", variant: "destructive" }); return; }
    if (!form.code?.trim()) { toast({ title: "Bank code is required", variant: "destructive" }); return; }

    setSaving(true);
    try {
      if (mode === "create") {
        const res = await api.post("/api/v1/banks", form);
        onSaved(res.data?.data ?? res.data);
        toast({ title: "Bank registered successfully" });
      } else {
        const res = await api.put("/api/v1/banks", { bank_id: bank!.id, ...form });
        onSaved(res.data?.data ?? res.data);
        toast({ title: "Bank updated successfully" });
      }
      onClose();
    } catch (err: any) {
      toast({ title: err?.response?.data?.error ?? "Failed to save bank", variant: "destructive" });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-900 border-gray-800 text-white max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-blue-400"/>
            {mode === "create" ? "Register New Bank" : `Edit — ${bank?.name}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Core fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-gray-400 text-xs">Bank Name <span className="text-red-400">*</span></Label>
              <Input value={form.name ?? ""} onChange={e=>set("name",e.target.value)}
                placeholder="National Bank of Cambodia"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 text-sm"/>
            </div>
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs">Bank Code <span className="text-red-400">*</span></Label>
              <Input value={form.code ?? ""} onChange={e=>set("code",e.target.value.toUpperCase())}
                placeholder="NBC" maxLength={10}
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 text-sm font-mono"/>
            </div>
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs">Country</Label>
              <Input value={form.country ?? ""} onChange={e=>set("country",e.target.value)}
                placeholder="Cambodia"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 text-sm"/>
            </div>
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs">License No.</Label>
              <Input value={form.license_no ?? ""} onChange={e=>set("license_no",e.target.value)}
                placeholder="C.B.14"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 text-sm"/>
            </div>
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs">Contact Email</Label>
              <Input type="email" value={form.contact_email ?? ""} onChange={e=>set("contact_email",e.target.value)}
                placeholder="info@bank.com"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 text-sm"/>
            </div>
            <div className="space-y-1">
              <Label className="text-gray-400 text-xs">Contact Phone</Label>
              <Input value={form.contact_phone ?? ""} onChange={e=>set("contact_phone",e.target.value)}
                placeholder="+855 23 xxxxxx"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 text-sm"/>
            </div>
          </div>

          {/* Address — collapsible */}
          <button
            onClick={()=>setShowAddr(p=>!p)}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300 transition-colors w-full"
          >
            <MapPin className="h-3.5 w-3.5"/>
            Address (optional)
            {showAddr ? <ChevronUp className="h-3 w-3 ml-auto"/> : <ChevronDown className="h-3 w-3 ml-auto"/>}
          </button>
          {showAddr && (
            <div className="grid grid-cols-2 gap-3 pl-1 border-l border-gray-800">
              <div className="col-span-2 space-y-1">
                <Label className="text-gray-400 text-xs">Street</Label>
                <Input value={form.address?.street ?? ""} onChange={e=>setAddr("street",e.target.value)}
                  placeholder="88 Street 102" className="bg-gray-800 border-gray-700 text-white text-sm"/>
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">City</Label>
                <Input value={form.address?.city ?? ""} onChange={e=>setAddr("city",e.target.value)}
                  placeholder="Phnom Penh" className="bg-gray-800 border-gray-700 text-white text-sm"/>
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">State / Province</Label>
                <Input value={form.address?.state ?? ""} onChange={e=>setAddr("state",e.target.value)}
                  placeholder="Phnom Penh" className="bg-gray-800 border-gray-700 text-white text-sm"/>
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">Postal Code</Label>
                <Input value={form.address?.postal_code ?? ""} onChange={e=>setAddr("postal_code",e.target.value)}
                  placeholder="12000" className="bg-gray-800 border-gray-700 text-white text-sm"/>
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">Country</Label>
                <Input value={form.address?.country ?? ""} onChange={e=>setAddr("country",e.target.value)}
                  placeholder="Cambodia" className="bg-gray-800 border-gray-700 text-white text-sm"/>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving} className="border-gray-700 text-gray-300 text-xs">Cancel</Button>
            <Button onClick={handleSubmit} disabled={saving} className="bg-blue-600 hover:bg-blue-700 text-white text-xs">
              {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin"/>Saving…</> : mode === "create" ? "Register Bank" : "Save Changes"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Bank detail panel (expandable row) ──────────────────────────────────────

function BankDetailRow({ bank, onEdit, onToggle, onDelete }: {
  bank: Bank;
  onEdit:   (b: Bank) => void;
  onToggle: (b: Bank) => void;
  onDelete: (b: Bank) => void;
}) {
  const [open, setOpen] = useState(false);

  const addr = bank.address;
  const hasAddr = addr?.street || addr?.city || addr?.country;

  return (
    <>
      <TableRow
        className="border-gray-800/60 hover:bg-gray-800/20 cursor-pointer"
        onClick={() => setOpen(p => !p)}
      >
        <TableCell className="py-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-blue-900/40 border border-blue-800/40 flex items-center justify-center shrink-0">
              <Building2 className="h-4 w-4 text-blue-400"/>
            </div>
            <div>
              <p className="text-white text-sm font-medium">{bank.name}</p>
              <p className="text-gray-500 text-xs font-mono">{bank.id}</p>
            </div>
          </div>
        </TableCell>
        <TableCell className="py-3 font-mono text-gray-400 text-sm">{bank.code}</TableCell>
        <TableCell className="py-3 text-gray-400 text-sm">{bank.country || "—"}</TableCell>
        <TableCell className="py-3">
          {bank.is_active
            ? <span className="flex items-center gap-1 text-emerald-400 text-xs"><CheckCircle className="h-3.5 w-3.5"/>Active</span>
            : <span className="flex items-center gap-1 text-red-400 text-xs"><XCircle className="h-3.5 w-3.5"/>Inactive</span>}
        </TableCell>
        <TableCell className="py-3 text-gray-500 text-xs">
          {bank.created_at ? (() => {
            try { return format(new Date(bank.created_at), "MMM d, yyyy"); } catch { return "—"; }
          })() : "—"}
        </TableCell>
        <TableCell className="py-3 text-right" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1 justify-end">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={()=>onEdit(bank)}
                  className="h-7 w-7 p-0 text-gray-500 hover:text-white hover:bg-gray-800">
                  <Pencil className="h-3.5 w-3.5"/>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-gray-800 border-gray-700 text-xs">Edit</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={()=>onToggle(bank)}
                  className={`h-7 w-7 p-0 hover:bg-gray-800 ${bank.is_active?"text-amber-500 hover:text-amber-400":"text-emerald-500 hover:text-emerald-400"}`}>
                  {bank.is_active ? <XCircle className="h-3.5 w-3.5"/> : <CheckCircle className="h-3.5 w-3.5"/>}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-gray-800 border-gray-700 text-xs">
                {bank.is_active ? "Deactivate" : "Activate"}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={()=>onDelete(bank)}
                  className="h-7 w-7 p-0 text-red-500 hover:text-red-400 hover:bg-red-950/30">
                  <Trash2 className="h-3.5 w-3.5"/>
                </Button>
              </TooltipTrigger>
              <TooltipContent className="bg-gray-800 border-gray-700 text-xs">Deactivate & Hide</TooltipContent>
            </Tooltip>
          </div>
        </TableCell>
      </TableRow>

      {/* Expanded detail */}
      {open && (
        <TableRow className="border-gray-800/30 bg-gray-900/40">
          <TableCell colSpan={6} className="py-3 px-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Contact */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-medium">Contact</p>
                <div className="space-y-1.5">
                  {bank.contact_email && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Mail className="h-3 w-3 text-gray-600 shrink-0"/>
                      {bank.contact_email}
                    </div>
                  )}
                  {bank.contact_phone && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Phone className="h-3 w-3 text-gray-600 shrink-0"/>
                      {bank.contact_phone}
                    </div>
                  )}
                  {bank.license_no && (
                    <div className="flex items-center gap-2 text-xs text-gray-400">
                      <Shield className="h-3 w-3 text-gray-600 shrink-0"/>
                      License: {bank.license_no}
                    </div>
                  )}
                  {!bank.contact_email && !bank.contact_phone && !bank.license_no && (
                    <p className="text-xs text-gray-600">No contact details</p>
                  )}
                </div>
              </div>

              {/* Address */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-medium">Address</p>
                {hasAddr ? (
                  <div className="text-xs text-gray-400 space-y-0.5">
                    {addr.street     && <p>{addr.street}</p>}
                    {addr.city       && <p>{addr.city}{addr.state ? `, ${addr.state}` : ""}</p>}
                    {addr.postal_code&& <p>{addr.postal_code}</p>}
                    {addr.country    && <p className="text-gray-500">{addr.country}</p>}
                  </div>
                ) : (
                  <p className="text-xs text-gray-600">No address on file</p>
                )}
              </div>

              {/* Meta */}
              <div>
                <p className="text-xs text-gray-500 uppercase tracking-wide mb-2 font-medium">Meta</p>
                <div className="space-y-1.5 text-xs text-gray-400">
                  <div><span className="text-gray-600">ID: </span><span className="font-mono">{bank.id}</span></div>
                  {bank.updated_at && (() => {
                    try { return <div><span className="text-gray-600">Updated: </span>{format(new Date(bank.updated_at), "MMM d, yyyy HH:mm")}</div>; }
                    catch { return null; }
                  })()}
                </div>
              </div>
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BanksPage() {
  const [banks,     setBanks]     = useState<Bank[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create"|"edit">("create");
  const [editBank,  setEditBank]  = useState<Bank | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const fetchBanks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/banks/list");
      const data = res.data?.data ?? res.data ?? [];
      setBanks(Array.isArray(data) ? data : []);
    } catch { setBanks([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchBanks(); }, [fetchBanks]);

  const filtered = banks.filter(b =>
    (showInactive ? true : b.is_active) &&
    (
      b.name?.toLowerCase().includes(search.toLowerCase()) ||
      b.code?.toLowerCase().includes(search.toLowerCase()) ||
      b.country?.toLowerCase().includes(search.toLowerCase()) ||
      b.id?.toLowerCase().includes(search.toLowerCase())
    )
  );

  const openCreate = () => { setDialogMode("create"); setEditBank(null); setDialogOpen(true); };
  const openEdit   = (b: Bank) => { setDialogMode("edit"); setEditBank(b); setDialogOpen(true); };

  const handleSaved = (saved: Bank) => {
    setBanks(prev => {
      const idx = prev.findIndex(b => b.id === saved.id);
      return idx >= 0
        ? prev.map(b => b.id === saved.id ? saved : b)
        : [saved, ...prev];
    });
  };

  const handleToggle = async (bank: Bank) => {
    try {
      const res = await api.put("/api/v1/banks", {
        bank_id:   bank.id,
        is_active: !bank.is_active,
      });
      handleSaved(res.data?.data ?? { ...bank, is_active: !bank.is_active });
      toast({ title: bank.is_active ? "Bank deactivated" : "Bank activated" });
    } catch (err: any) {
      toast({ title: err?.response?.data?.error ?? "Failed to toggle bank", variant: "destructive" });
    }
  };

  const handleDelete = async (bank: Bank) => {
    if (!confirm(`Deactivate "${bank.name}"? This will prevent new KYC registrations under this bank.`)) return;
    try {
      await api.delete(`/api/v1/banks?bank_id=${bank.id}`);
      setBanks(prev => prev.map(b => b.id === bank.id ? { ...b, is_active: false } : b));
      toast({ title: "Bank deactivated" });
    } catch (err: any) {
      toast({ title: err?.response?.data?.error ?? "Failed to deactivate bank", variant: "destructive" });
    }
  };

  // Stats
  const active   = banks.filter(b => b.is_active).length;
  const inactive = banks.filter(b => !b.is_active).length;

  return (
    <TooltipProvider>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Building2 className="h-6 w-6 text-blue-400"/>Banks
            </h1>
            <p className="text-gray-400 text-sm mt-1">Manage registered partner banks in the KYC network</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={fetchBanks} variant="outline" size="sm" className="border-gray-700 text-gray-300">
              <RefreshCw className="h-4 w-4 mr-1.5"/>Refresh
            </Button>
            <Button onClick={openCreate} size="sm" className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-1.5"/>Register Bank
            </Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Total",    value: banks.length, color: "text-white",         bg: "border-gray-700 bg-gray-800/40" },
            { label: "Active",   value: active,       color: "text-emerald-400",    bg: "border-emerald-900/40 bg-emerald-950/20" },
            { label: "Inactive", value: inactive,     color: "text-red-400",        bg: "border-red-900/40 bg-red-950/10" },
          ].map(s => (
            <div key={s.label} className={`rounded-xl border px-4 py-3 ${s.bg}`}>
              <p className={`text-2xl font-bold ${s.color}`}>{loading ? "—" : s.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        <Card className="bg-gray-900 border-gray-800">
          {/* Filter bar */}
          <div className="flex items-center gap-2 px-4 pt-4 pb-3 border-b border-gray-800">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500"/>
              <Input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Search name, code, country…"
                className="pl-8 h-8 text-xs bg-gray-800 border-gray-700 text-white placeholder:text-gray-600"/>
            </div>
            <button
              onClick={()=>setShowInactive(p=>!p)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                showInactive
                  ? "bg-gray-700 border-gray-600 text-gray-300"
                  : "bg-gray-800 border-gray-700 text-gray-500 hover:border-gray-600 hover:text-gray-300"
              }`}
            >
              {showInactive ? "Showing All" : "Active Only"}
            </button>
            <p className="text-xs text-gray-600 ml-auto">{filtered.length} banks · click row to expand</p>
          </div>

          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800">
                  <TableHead className="text-gray-400 text-xs">Bank</TableHead>
                  <TableHead className="text-gray-400 text-xs">Code</TableHead>
                  <TableHead className="text-gray-400 text-xs">Country</TableHead>
                  <TableHead className="text-gray-400 text-xs">Status</TableHead>
                  <TableHead className="text-gray-400 text-xs">Created</TableHead>
                  <TableHead className="text-right text-gray-400 text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(4)].map((_,i) => (
                    <TableRow key={i} className="border-gray-800">
                      {[...Array(6)].map((_,j) => <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800"/></TableCell>)}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 py-12">
                      {search ? "No banks match your search" : "No banks registered"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(bank => (
                    <BankDetailRow
                      key={bank.id}
                      bank={bank}
                      onEdit={openEdit}
                      onToggle={handleToggle}
                      onDelete={handleDelete}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <BankFormDialog
        mode={dialogMode}
        bank={editBank}
        open={dialogOpen}
        onClose={()=>setDialogOpen(false)}
        onSaved={handleSaved}
      />
    </TooltipProvider>
  );
}