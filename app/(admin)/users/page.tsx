"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Search, ShieldCheck, Trash2, Lock, TrendingUp, AlertCircle, MoreHorizontal, X, Loader2, Check } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { User } from "@/types/auth";
import api from "@/lib/api";
import { toast } from "@/components/ui/use-toast";
import { format } from "date-fns";

type Bank = { id: string; name: string; code: string };

const ROLE_COLORS: Record<string, string> = {
  admin:        "bg-red-900 text-red-300",
  bank_admin:   "bg-purple-900 text-purple-300",
  bank_officer: "bg-blue-900 text-blue-300",
  auditor:      "bg-green-900 text-green-300",
  integration_service: "bg-cyan-900 text-cyan-300",
  customer:     "bg-gray-700 text-gray-300",
};

const ALL_ROLES: { value: string; label: string }[] = [
  { value: "bank_officer", label: "Bank Officer" },
  { value: "bank_admin",   label: "Bank Admin"   },
  { value: "auditor",      label: "Auditor"       },
  { value: "integration_service", label: "Integration Service" },
  { value: "admin",        label: "Admin"         },
];

const INTERNAL_ROLES = ["bank_admin", "bank_officer", "auditor", "integration_service"] as const;
type InternalRole = typeof INTERNAL_ROLES[number];

// ─── Add User Dialog ─────────────────────────────────────────────────────────
function AddUserDialog({
  banks,
  onClose,
  onCreated,
}: {
  banks: Bank[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = useState({
    username: "", email: "", password: "",
    role: "bank_officer" as InternalRole, bank_id: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsBank = form.role === "bank_admin" || form.role === "bank_officer";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username || !form.email || !form.password || !form.role) {
      setError("All fields are required"); return;
    }
    if (needsBank && !form.bank_id) {
      setError("Bank assignment is required for this role"); return;
    }

    setLoading(true); setError(null);
    try {
      await api.post("/api/v1/users", {
        username: form.username,
        email: form.email,
        password: form.password,
        role: form.role,
        bank_id: needsBank ? form.bank_id : undefined,
      });
      toast({ title: `User "${form.username}" created` });
      onCreated();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to create user");
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogContent className="bg-gray-900 border-gray-800 max-w-md">
      <DialogHeader>
        <DialogTitle className="text-white">Add Internal User</DialogTitle>
        <DialogDescription className="text-gray-400">
          Create a bank_admin, bank_officer, auditor account, or integration_service account.
          The user must change their password on first login.{" "}
          <span className="text-cyan-400">
            integration_service accounts are used by the NextJS gateway — no bank required.
          </span>
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        {error && (
          <Alert variant="destructive" className="bg-red-950 border-red-800">
            <AlertDescription className="text-red-300">{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label className="text-gray-300">Username</Label>
          <Input placeholder="e.g. john.bank" value={form.username}
            onChange={(e) => setForm(f => ({ ...f, username: e.target.value }))}
            className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" />
        </div>

        <div className="space-y-2">
          <Label className="text-gray-300">Email</Label>
          <Input type="email" placeholder="user@bank.com" value={form.email}
            onChange={(e) => setForm(f => ({ ...f, email: e.target.value }))}
            className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" />
        </div>

        <div className="space-y-2">
          <Label className="text-gray-300">Initial Password</Label>
          <Input type="text" placeholder="Temporary password" value={form.password}
            onChange={(e) => setForm(f => ({ ...f, password: e.target.value }))}
            className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" />
          <p className="text-gray-500 text-xs">User must change this on first login.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-gray-300">Role</Label>
          <Select value={form.role} onValueChange={(v) => setForm(f => ({ ...f, role: v as InternalRole, bank_id: "" }))}>
            <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-gray-800 border-gray-700 text-white">
              <SelectItem value="bank_admin">Bank Admin</SelectItem>
              <SelectItem value="bank_officer">Bank Officer</SelectItem>
              <SelectItem value="auditor">Auditor</SelectItem>
              <SelectItem value="integration_service">Integration Service</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {needsBank && (
          <div className="space-y-2">
            <Label className="text-gray-300">Assign Bank <span className="text-red-400">*</span></Label>
            <Select value={form.bank_id} onValueChange={(v) => setForm(f => ({ ...f, bank_id: v }))}>
              <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                <SelectValue placeholder="Select bank..." />
              </SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700 text-white">
                {banks.map(b => (
                  <SelectItem key={b.id} value={b.id}>{b.name} ({b.code})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={loading} className="flex-1 bg-blue-600 hover:bg-blue-700">
            {loading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : "Create User"}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}
            className="border-gray-700 text-gray-300">Cancel</Button>
        </div>
      </form>
    </DialogContent>
  );
}

// ─── Reset Password Result Dialog ────────────────────────────────────────────
function ResetPasswordResultDialog({
  username, tempPassword, onClose,
}: { username: string; tempPassword: string; onClose: () => void }) {
  return (
    <DialogContent className="bg-gray-900 border-gray-800 max-w-sm">
      <DialogHeader>
        <DialogTitle className="text-white">Password Reset</DialogTitle>
        <DialogDescription className="text-gray-400">
          Share this temporary password securely with <strong className="text-white">{username}</strong>.
          They must change it on next login.
        </DialogDescription>
      </DialogHeader>
      <div className="mt-3 p-4 bg-gray-800 rounded-lg border border-gray-700 font-mono text-lg text-yellow-300 text-center tracking-wider">
        {tempPassword}
      </div>
      <p className="text-xs text-gray-500 text-center mt-1">Copy this now — it won't be shown again.</p>
      <Button onClick={onClose} className="w-full mt-2 bg-blue-600 hover:bg-blue-700">Done</Button>
    </DialogContent>
  );
}

// ─── Main Users Page ──────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [resetResult, setResetResult] = useState<{ username: string; tempPassword: string } | null>(null);

  const fetchUsers = async () => {
    setLoading(true); setError(null);
    try {
      const res = await api.get("/api/v1/users/list");
      const payload = res.data?.data;

      console.log("[UsersPage] API response payload:", payload);

      const arr = payload?.users ?? payload ?? [];
      setUsers(Array.isArray(arr) ? arr : []);
    } catch (err: any) {
      setError(err?.response?.data?.message ?? "Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchBanks = async () => {
    try {
      const res = await api.get("/api/v1/banks/list");
      const arr = res.data?.data ?? res.data ?? [];
      setBanks(Array.isArray(arr) ? arr : []);
    } catch {
      setBanks([]);
    }
  };

  useEffect(() => { fetchUsers(); fetchBanks(); }, []);

  const filtered = users.filter((u) =>
    u.username?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase()) ||
    u.role?.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleActive = async (user: User) => {
    try {
      await api.patch("/api/v1/users", { user_id: user.id, is_active: !user.is_active });
      toast({ title: `${user.username} ${!user.is_active ? "enabled" : "disabled"}` });
      fetchUsers();
    } catch (err: any) {
      toast({ title: err?.response?.data?.message ?? "Failed", variant: "destructive" });
    }
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`Soft-delete user "${user.username}"? They cannot log in anymore.`)) return;
    try {
      await api.delete("/api/v1/users", { data: { user_id: user.id } });
      toast({ title: `${user.username} deleted` });
      fetchUsers();
    } catch (err: any) {
      toast({ title: err?.response?.data?.message ?? "Failed", variant: "destructive" });
    }
  };

  const handleResetPassword = async (user: User) => {
    if (!confirm(`Reset password for "${user.username}"?`)) return;
    try {
      const res = await api.post("/api/v1/users/reset-password", { user_id: user.id });
      const tempPassword = res.data?.data?.temp_password;
      setResetResult({ username: user.username, tempPassword });
    } catch (err: any) {
      toast({ title: err?.response?.data?.message ?? "Reset failed", variant: "destructive" });
    }
  };

  const handlePromoteRole = async (user: User, newRole: string) => {
  if (newRole === user.role) { toast({ title: "Already on that role" }); return; }
  if (!confirm(`Change "${user.username}" role from ${user.role} → ${newRole}?`)) return;
  try {
    await api.patch("/api/v1/users", { user_id: user.id, role: newRole });
    toast({ title: `Role changed to ${newRole.replace(/_/g, " ")}` });
    fetchUsers();
  } catch (err: any) {
    toast({ title: err?.response?.data?.message ?? "Failed", variant: "destructive" });
  }
};

  // const handlePromoteRole = async (user: User) => {
  //   const order = ["bank_officer", "bank_admin", "auditor", "admin"];
  //   const idx = order.indexOf(user.role);
  //   const next = order[Math.min(idx + 1, order.length - 1)];
  //   if (next === user.role) { toast({ title: "Already at highest role" }); return; }
  //   if (!confirm(`Promote "${user.username}" from ${user.role} → ${next}?`)) return;
  //   try {
  //     await api.patch("/api/v1/users", { user_id: user.id, role: next });
  //     toast({ title: `Promoted to ${next}` });
  //     fetchUsers();
  //   } catch (err: any) {
  //     toast({ title: err?.response?.data?.message ?? "Failed", variant: "destructive" });
  //   }
  // };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-gray-400 text-sm mt-1">Manage internal users and roles — {users.length} total</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchUsers} variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:bg-gray-800">
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />Add User
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-950 border border-red-800 text-red-300 text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />{error}
        </div>
      )}

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input placeholder="Search by username, email or role..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-gray-800 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800">
                  <TableHead className="text-gray-400">Username</TableHead>
                  <TableHead className="text-gray-400">Email</TableHead>
                  <TableHead className="text-gray-400">Role</TableHead>
                  <TableHead className="text-gray-400">Bank</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400">Last Login</TableHead>
                  <TableHead className="text-right text-gray-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i} className="border-gray-800">
                      {[...Array(7)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-gray-500 py-10">
                      {search ? "No users match your search" : "No users found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((user) => {
                    const bank = banks.find(b => b.id === (user as any).bank_id);
                    const isAdmin = user.username === "admin";
                    return (
                      <TableRow key={user.id} className="border-gray-800 hover:bg-gray-800/50">
                        <TableCell className="text-white font-medium">
                          {user.username}
                          {isAdmin && <span className="ml-2 text-xs text-yellow-500">★ root</span>}
                        </TableCell>
                        <TableCell className="text-gray-400 text-sm">{user.email}</TableCell>
                        <TableCell>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${ROLE_COLORS[user.role] ?? "bg-gray-700 text-gray-300"}`}>
                            {user.role.replace(/_/g, " ")}
                          </span>
                        </TableCell>
                        <TableCell className="text-gray-400 text-sm">
                          {bank ? `${bank.name}` : <span className="text-gray-600">—</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={user.is_active
                            ? "bg-green-900 text-green-300 text-xs"
                            : "bg-gray-700 text-gray-400 text-xs"}>
                            {user.is_active ? "Active" : "Inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-gray-400 text-sm">
                          {user.last_login
                            ? format(new Date(user.last_login), "MMM d, HH:mm")
                            : <span className="text-gray-600">Never</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700 text-gray-300">
                              <DropdownMenuItem
                                disabled={isAdmin}
                                onClick={() => handleToggleActive(user)}
                                className="cursor-pointer hover:bg-gray-700">
                                <ShieldCheck className="mr-2 h-4 w-4" />
                                {user.is_active ? "Disable" : "Enable"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => handleResetPassword(user)}
                                className="cursor-pointer hover:bg-gray-700">
                                <Lock className="mr-2 h-4 w-4" />Reset Password
                              </DropdownMenuItem>
                              
                              {/* <DropdownMenuItem
                                disabled={isAdmin}
                                onClick={() => handlePromoteRole(user)}
                                className="cursor-pointer hover:bg-gray-700">
                                <TrendingUp className="mr-2 h-4 w-4" />Promote Role
                              </DropdownMenuItem> */}
                              <DropdownMenuSub>
                                <DropdownMenuSubTrigger
                                  disabled={isAdmin}
                                  className="cursor-pointer hover:bg-gray-700 focus:bg-gray-700 data-[state=open]:bg-gray-700">
                                  <TrendingUp className="mr-2 h-4 w-4" />Assign Role
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="bg-gray-800 border-gray-700 text-gray-200">
                                  {ALL_ROLES.map((r) => {
                                    const isCurrent = user.role === r.value;
                                    return (
                                      <DropdownMenuItem
                                        key={r.value}
                                        disabled={isCurrent}
                                        onClick={() => handlePromoteRole(user, r.value)}  // ✅ both args
                                        className={`cursor-pointer hover:bg-gray-700 focus:bg-gray-700 ${
                                          isCurrent ? "opacity-50 cursor-not-allowed" : ""
                                        }`}
                                      >
                                        {isCurrent
                                          ? <Check className="mr-2 h-4 w-4 text-green-400" />
                                          : <span className="mr-6 inline-block" />
                                        }
                                        {r.label}
                                        {isCurrent && <span className="ml-auto text-xs text-gray-500">current</span>}
                                      </DropdownMenuItem>
                                    );
                                  })}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>

                              <DropdownMenuSeparator className="bg-gray-700" />
                              <DropdownMenuItem
                                disabled={isAdmin}
                                onClick={() => handleDelete(user)}
                                className="cursor-pointer text-red-400 hover:bg-red-900/30 focus:text-red-400">
                                <Trash2 className="mr-2 h-4 w-4" />Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {!loading && (
            <p className="text-gray-500 text-xs mt-3">{filtered.length} of {users.length} users</p>
          )}
        </CardContent>
      </Card>

      {/* Add User Dialog */}
      {showAddDialog && (
        <Dialog open onOpenChange={() => setShowAddDialog(false)}>
          <AddUserDialog
            banks={banks}
            onClose={() => setShowAddDialog(false)}
            onCreated={() => { setShowAddDialog(false); fetchUsers(); }}
          />
        </Dialog>
      )}

      {/* Reset Password Result */}
      {resetResult && (
        <Dialog open onOpenChange={() => setResetResult(null)}>
          <ResetPasswordResultDialog
            username={resetResult.username}
            tempPassword={resetResult.tempPassword}
            onClose={() => setResetResult(null)}
          />
        </Dialog>
      )}
    </div>
  );
}