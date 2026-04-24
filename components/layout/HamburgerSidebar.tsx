"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  LayoutDashboard,
  Users,
  Shield,
  Link as LinkIcon,
  Building2,
  FileCheck,
  Activity,
  Lock,
  Key,
  AlertTriangle,
  Settings,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Role } from "@/types/auth";

interface MenuItem {
  label: string;
  href: string;
  icon: React.ElementType;
  roles: Role[];
}

const menuItems: MenuItem[] = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    roles: ["admin", "bank_admin", "bank_officer", "auditor"],
  },
  {
    label: "KYC Management",
    href: "/kyc",
    icon: Shield,
    roles: ["admin", "bank_admin", "bank_officer"],
  },
  {
    label: "Users",
    href: "/users",
    icon: Users,
    roles: ["admin", "bank_admin"],
  },
  {
    label: "Blockchain",
    href: "/blockchain",
    icon: LinkIcon,
    roles: ["admin", "bank_admin", "auditor"],
  },
  {
    label: "Banks",
    href: "/banks",
    icon: Building2,
    roles: ["admin"],
  },
  {
    label: "Certificates",
    href: "/certificates",
    icon: FileCheck,
    roles: ["admin", "bank_admin", "bank_officer", "auditor"],
  },
  {
    label: "Audit Logs",
    href: "/audit",
    icon: Activity,
    roles: ["admin", "auditor"],
  },
  // {
  //   label: "Security",
  //   href: "/security",
  //   icon: Lock,
  //   roles: ["admin"],
  // },
  {
    label: "API Keys",
    href: "/keys",
    icon: Key,
    roles: ["admin", "bank_admin"],
  },
  {
    label: "Alerts",
    href: "/alerts",
    icon: AlertTriangle,
    roles: ["admin", "bank_admin", "bank_officer"],
  },
  {
    label: "Settings",
    href: "/settings",
    icon: Settings,
    roles: ["admin", "bank_admin"],
  },
];

function SidebarContent({ role, onClose }: { role: Role; onClose?: () => void }) {
  const pathname = usePathname();
  const filtered = menuItems.filter((item) => item.roles.includes(role));

  return (
    <nav className="flex flex-col gap-1 px-3 py-4">
      {filtered.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
              isActive
                ? "bg-blue-600 text-white shadow-sm"
                : "text-gray-400 hover:bg-gray-800 hover:text-white"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {isActive && <ChevronRight className="h-3 w-3 opacity-70" />}
          </Link>
        );
      })}
    </nav>
  );
}

export default function HamburgerSidebar() {
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = (session?.user as any)?.role as Role;

  return (
    <>
      {/* Mobile hamburger button */}
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden fixed top-4 left-4 z-50 bg-gray-900 text-white hover:bg-gray-800"
        onClick={() => setMobileOpen(true)}
      >
        <Menu className="h-5 w-5" />
      </Button>

      {/* Mobile sheet */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="bg-gray-900 border-gray-800 p-0 w-64">
          <SheetHeader className="px-4 py-4 border-b border-gray-800">
            <SheetTitle className="text-white text-left flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-400" />
              KYC Blockchain
            </SheetTitle>
          </SheetHeader>
          {role && <SidebarContent role={role} onClose={() => setMobileOpen(false)} />}
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 min-h-screen bg-gray-900 border-r border-gray-800 fixed top-0 left-0">
        <div className="flex items-center gap-2 px-4 py-5 border-b border-gray-800">
          <div className="p-2 bg-blue-600 rounded-lg">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <div>
            <span className="text-white font-bold text-sm">KYC Blockchain</span>
            <p className="text-gray-500 text-xs">Admin Portal</p>
          </div>
        </div>
        {role && <SidebarContent role={role} />}
        <div className="mt-auto p-4 border-t border-gray-800">
          <Badge variant="outline" className="text-gray-400 border-gray-700 text-xs capitalize">
            {role}
          </Badge>
        </div>
      </aside>
    </>
  );
}
