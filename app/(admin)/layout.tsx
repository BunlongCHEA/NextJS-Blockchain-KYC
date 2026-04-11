import HamburgerSidebar from "@/components/layout/HamburgerSidebar";
import TopBar from "@/components/layout/TopBar";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gray-950">
      <HamburgerSidebar />
      <TopBar />
      <main className="lg:pl-64 pt-16">
        <div className="p-6">{children}</div>
      </main>
    </div>
  );
}
