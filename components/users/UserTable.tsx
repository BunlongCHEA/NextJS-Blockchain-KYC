"use client";

import { User } from "@/types/auth";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MoreHorizontal, ShieldCheck, Trash2, Lock, TrendingUp, Check,
} from "lucide-react";
import { format } from "date-fns";

interface UserTableProps {
  users: User[];
  onToggleActive: (user: User) => void;
  onDelete: (user: User) => void;
  onResetPassword: (user: User) => void;
  onPromoteRole: (user: User, newRole: string) => void;  // matches real page.tsx
}

const roleColors: Record<string, string> = {
  admin:        "bg-red-900 text-red-300",
  bank_admin:   "bg-purple-900 text-purple-300",
  bank_officer: "bg-blue-900 text-blue-300",
  auditor:      "bg-green-900 text-green-300",
  customer:     "bg-gray-700 text-gray-300",
};

const ALL_ROLES: { value: string; label: string }[] = [
  { value: "bank_officer", label: "Bank Officer" },
  { value: "bank_admin",   label: "Bank Admin"   },
  { value: "auditor",      label: "Auditor"       },
  { value: "admin",        label: "Admin"         },
];

export default function UserTable({
  users, onToggleActive, onDelete, onResetPassword, onPromoteRole,
}: UserTableProps) {
  return (
    <div className="rounded-md border border-gray-800">
      <Table>
        <TableHeader>
          <TableRow className="border-gray-800 hover:bg-gray-800/50">
            <TableHead className="text-gray-400">Username</TableHead>
            <TableHead className="text-gray-400">Email</TableHead>
            <TableHead className="text-gray-400">Role</TableHead>
            <TableHead className="text-gray-400">Status</TableHead>
            <TableHead className="text-gray-400">Created</TableHead>
            <TableHead className="text-gray-400">Last Login</TableHead>
            <TableHead className="text-right text-gray-400">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-gray-500 py-8">
                No users found
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.id} className="border-gray-800 hover:bg-gray-800/50">
                <TableCell className="font-medium text-white">{user.username}</TableCell>
                <TableCell className="text-gray-400">{user.email}</TableCell>
                <TableCell>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                    roleColors[user.role] ?? "bg-gray-700 text-gray-300"
                  }`}>
                    {user.role.replace(/_/g, " ")}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={user.is_active ? "default" : "secondary"}
                    className={user.is_active
                      ? "bg-green-900 text-green-300"
                      : "bg-gray-700 text-gray-400"}
                  >
                    {user.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-gray-400 text-sm">
                  {user.created_at
                    ? format(new Date(user.created_at), "MMM d, yyyy")
                    : "-"}
                </TableCell>
                <TableCell className="text-gray-400 text-sm">
                  {user.last_login
                    ? format(new Date(user.last_login), "MMM d, yyyy")
                    : "Never"}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-400 hover:text-white hover:bg-gray-700"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700 text-gray-200">

                      {/* Enable / Disable */}
                      <DropdownMenuItem
                        onClick={() => onToggleActive(user)}
                        className="cursor-pointer hover:bg-gray-700 focus:bg-gray-700"
                      >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        {user.is_active ? "Disable" : "Enable"}
                      </DropdownMenuItem>

                      {/* Reset Password */}
                      <DropdownMenuItem
                        onClick={() => onResetPassword(user)}
                        className="cursor-pointer hover:bg-gray-700 focus:bg-gray-700"
                      >
                        <Lock className="mr-2 h-4 w-4" />
                        Reset Password
                      </DropdownMenuItem>

                      <DropdownMenuSeparator className="bg-gray-700" />

                      {/* Assign Role — submenu, admin picks any role directly */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="cursor-pointer hover:bg-gray-700 focus:bg-gray-700 data-[state=open]:bg-gray-700">
                          <TrendingUp className="mr-2 h-4 w-4" />
                          Assign Role
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="bg-gray-800 border-gray-700 text-gray-200">
                          {ALL_ROLES.map((r) => {
                            const isCurrent = user.role === r.value;
                            return (
                              <DropdownMenuItem
                                key={r.value}
                                disabled={isCurrent}
                                onClick={() => onPromoteRole(user, r.value)}
                                className={`cursor-pointer hover:bg-gray-700 focus:bg-gray-700 ${
                                  isCurrent ? "opacity-50 cursor-not-allowed" : ""
                                }`}
                              >
                                {isCurrent
                                  ? <Check className="mr-2 h-4 w-4 text-green-400" />
                                  : <span className="mr-6 inline-block" />
                                }
                                {r.label}
                                {isCurrent && (
                                  <span className="ml-auto text-xs text-gray-500">current</span>
                                )}
                              </DropdownMenuItem>
                            );
                          })}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>

                      <DropdownMenuSeparator className="bg-gray-700" />

                      {/* Delete — disabled for root admin */}
                      <DropdownMenuItem
                        onClick={() => onDelete(user)}
                        disabled={user.username === "admin"}
                        className="text-red-400 cursor-pointer hover:bg-gray-700 focus:bg-gray-700 focus:text-red-400 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>

                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}