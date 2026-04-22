"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, Shield, FileCheck, LogOut, User, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { label: "Dashboard",   href: "/customer/dashboard",   icon: LayoutDashboard },
  { label: "My KYC",      href: "/customer/kyc",         icon: Shield          },
  { label: "Certificate", href: "/customer/certificate", icon: FileCheck       },
];

export default function CustomerLayout({ children }: { children: React.ReactNode }) {
  const pathname  = usePathname();
  const { data: session } = useSession();
  const router    = useRouter();

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login/customer");
  };

  // Breadcrumb label from pathname
  const current = navItems.find(n => pathname.startsWith(n.href))?.label ?? "Portal";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Nav */}
      <header className="bg-white border-b border-slate-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between gap-4">

          {/* Logo */}
          <Link href="/customer/dashboard" className="flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Shield className="h-4 w-4 text-white"/>
            </div>
            <span className="font-bold text-slate-800 text-sm hidden sm:block">KYC Portal</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-0.5">
            {navItems.map(item => {
              const Icon    = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link key={item.href} href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-blue-50 text-blue-700"
                      : "text-slate-600 hover:bg-slate-100 hover:text-slate-800"
                  )}
                >
                  <Icon className="h-3.5 w-3.5"/>{item.label}
                </Link>
              );
            })}
          </nav>

          {/* User + logout */}
          <div className="flex items-center gap-2 shrink-0">
            {session?.user?.name && (
              <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-100 rounded-lg px-2.5 py-1.5">
                <User className="h-3 w-3"/>
                <span className="max-w-[100px] truncate">{session.user.name}</span>
              </div>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}
              className="text-red-500 hover:text-red-600 hover:bg-red-50 text-xs h-8 px-2">
              <LogOut className="h-3.5 w-3.5 mr-1"/>Logout
            </Button>
          </div>
        </div>

        {/* Mobile tab bar */}
        <div className="md:hidden border-t border-slate-100 flex">
          {navItems.map(item => {
            const Icon    = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href}
                className={cn(
                  "flex-1 flex flex-col items-center gap-0.5 py-2 text-xs font-medium transition-colors",
                  isActive
                    ? "text-blue-600 border-t-2 border-blue-600 -mt-px"
                    : "text-slate-400 border-t-2 border-transparent"
                )}
              >
                <Icon className="h-4 w-4"/>{item.label}
              </Link>
            );
          })}
        </div>
      </header>

      {/* Breadcrumb */}
      <div className="max-w-5xl mx-auto px-4 py-2.5 flex items-center gap-1.5 text-xs text-slate-400">
        <span>Portal</span>
        <ChevronRight className="h-3 w-3"/>
        <span className="text-slate-600 font-medium">{current}</span>
      </div>

      <main className="max-w-5xl mx-auto px-4 pb-8">
        {children}
      </main>
    </div>
  );
}