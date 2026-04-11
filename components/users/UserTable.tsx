"use client";

import { useState } from "react";
import { User } from "@/types/auth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, ShieldCheck, Trash2, Lock, TrendingUp } from "lucide-react";
import { format } from "date-fns";

interface UserTableProps {
  users: User[];
  onToggleActive: (userId: string, isActive: boolean) => void;
  onDelete: (userId: string) => void;
  onResetPassword: (userId: string) => void;
  onPromoteRole: (userId: string, currentRole: string) => void;
}

const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-800",
  bank_admin: "bg-purple-100 text-purple-800",
  bank_officer: "bg-blue-100 text-blue-800",
  auditor: "bg-green-100 text-green-800",
  customer: "bg-gray-100 text-gray-800",
};

export default function UserTable({
  users,
  onToggleActive,
  onDelete,
  onResetPassword,
  onPromoteRole,
}: UserTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Username</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Last Login</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                No users found
              </TableCell>
            </TableRow>
          ) : (
            users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">{user.username}</TableCell>
                <TableCell className="text-muted-foreground">{user.email}</TableCell>
                <TableCell>
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      roleColors[user.role] || "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {user.role.replace("_", " ")}
                  </span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant={user.is_active ? "default" : "secondary"}
                    className={
                      user.is_active
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                    }
                  >
                    {user.is_active ? "Active" : "Inactive"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {user.created_at
                    ? format(new Date(user.created_at), "MMM d, yyyy")
                    : "-"}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {user.last_login
                    ? format(new Date(user.last_login), "MMM d, yyyy")
                    : "Never"}
                </TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => onToggleActive(user.id, !user.is_active)}
                        className="cursor-pointer"
                      >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        {user.is_active ? "Disable" : "Enable"}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onResetPassword(user.id)}
                        className="cursor-pointer"
                      >
                        <Lock className="mr-2 h-4 w-4" />
                        Reset Password
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onPromoteRole(user.id, user.role)}
                        className="cursor-pointer"
                      >
                        <TrendingUp className="mr-2 h-4 w-4" />
                        Promote Role
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => onDelete(user.id)}
                        className="text-red-600 cursor-pointer focus:text-red-600"
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
