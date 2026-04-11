"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LogOut, User, Bell, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const roleColors: Record<string, string> = {
  admin: "bg-red-100 text-red-800",
  bank_admin: "bg-purple-100 text-purple-800",
  bank_officer: "bg-blue-100 text-blue-800",
  auditor: "bg-green-100 text-green-800",
  customer: "bg-gray-100 text-gray-800",
};

export default function TopBar() {
  const { data: session } = useSession();
  const router = useRouter();

  const user = session?.user;
  const role = (user as any)?.role as string;
  const username = user?.name || user?.email || "User";

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login/admin");
  };

  return (
    <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 fixed top-0 right-0 left-0 lg:left-64 z-40">
      <div className="flex items-center gap-3">
        <h2 className="text-white font-semibold text-sm hidden sm:block">
          KYC Management System
        </h2>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="text-gray-400 hover:text-white hover:bg-gray-800"
        >
          <Bell className="h-5 w-5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="flex items-center gap-2 text-gray-300 hover:text-white hover:bg-gray-800"
            >
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-white" />
              </div>
              <div className="hidden sm:block text-left">
                <p className="text-sm font-medium leading-none">{username}</p>
                <p className="text-xs text-gray-500 mt-0.5 capitalize">{role}</p>
              </div>
              <ChevronDown className="h-4 w-4 text-gray-500" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 bg-gray-900 border-gray-700"
          >
            <DropdownMenuLabel className="text-gray-300">
              <div>
                <p className="font-medium">{username}</p>
                {role && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-normal capitalize ${
                      roleColors[role] || "bg-gray-100 text-gray-800"
                    }`}
                  >
                    {role.replace("_", " ")}
                  </span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-gray-700" />
            <DropdownMenuItem
              className="text-gray-300 hover:bg-gray-800 cursor-pointer"
              onClick={() => router.push("/change-password")}
            >
              Change Password
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-gray-700" />
            <DropdownMenuItem
              className="text-red-400 hover:bg-gray-800 hover:text-red-300 cursor-pointer"
              onClick={handleLogout}
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
