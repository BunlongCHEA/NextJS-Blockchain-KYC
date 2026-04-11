"use client";

import { useEffect, useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import UserTable from "@/components/users/UserTable";
import { User } from "@/types/auth";
import api from "@/lib/api";
import { toast } from "@/components/ui/use-toast";

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/users/list");
      const data = res.data?.data || res.data || [];
      setUsers(Array.isArray(data) ? data : []);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filtered = users.filter(
    (u) =>
      u.username?.toLowerCase().includes(search.toLowerCase()) ||
      u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleActive = async (userId: string, isActive: boolean) => {
    try {
      await api.patch(`/api/v1/users/${userId}`, { is_active: isActive });
      toast({ title: `User ${isActive ? "enabled" : "disabled"} successfully` });
      fetchUsers();
    } catch {
      toast({ title: "Failed to update user", variant: "destructive" });
    }
  };

  const handleDelete = async (userId: string) => {
    try {
      await api.delete(`/api/v1/users/${userId}`);
      toast({ title: "User deleted successfully" });
      fetchUsers();
    } catch {
      toast({ title: "Failed to delete user", variant: "destructive" });
    }
  };

  const handleResetPassword = async (userId: string) => {
    try {
      await api.post(`/api/v1/users/${userId}/reset-password`);
      toast({ title: "Password reset email sent" });
    } catch {
      toast({ title: "Failed to reset password", variant: "destructive" });
    }
  };

  const handlePromoteRole = async (userId: string, currentRole: string) => {
    const roleOrder = ["bank_officer", "bank_admin", "auditor", "admin"];
    const currentIndex = roleOrder.indexOf(currentRole);
    const nextRole = roleOrder[Math.min(currentIndex + 1, roleOrder.length - 1)];
    try {
      await api.patch(`/api/v1/users/${userId}`, { role: nextRole });
      toast({ title: `User promoted to ${nextRole}` });
      fetchUsers();
    } catch {
      toast({ title: "Failed to promote user", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Users</h1>
          <p className="text-gray-400 text-sm mt-1">Manage system users and roles</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchUsers} variant="outline" size="sm" className="border-gray-700 text-gray-300">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Add User
          </Button>
        </div>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
            />
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full bg-gray-800" />
              ))}
            </div>
          ) : (
            <div className="[&_table]:border-gray-800 [&_tr]:border-gray-800 [&_th]:text-gray-400 [&_td]:text-gray-300">
              <UserTable
                users={filtered}
                onToggleActive={handleToggleActive}
                onDelete={handleDelete}
                onResetPassword={handleResetPassword}
                onPromoteRole={handlePromoteRole}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
