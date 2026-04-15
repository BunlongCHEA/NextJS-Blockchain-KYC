"use client";

import { useEffect, useState } from "react";
import { Users, ShieldCheck, Link as LinkIcon, Building2, TrendingUp, Clock, CircleDashed } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";

interface DashboardStats {
  total_customers: number;
  pending_kyc: number;
  verified_kyc: number;
  rejected_kyc: number;
  total_banks: number;
  pending_txs: number;
  total_blocks: number;
}

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  loading,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  loading: boolean;
}) {
  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-400 text-sm">{title}</p>
            {loading ? (
              <Skeleton className="h-8 w-16 mt-2 bg-gray-800" />
            ) : (
              <p className="text-3xl font-bold text-white mt-1">{value}</p>
            )}
          </div>
          <div className={`p-3 rounded-xl ${color}`}>
            <Icon className="h-6 w-6 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [kycRes, banksRes, blockchainRes] = await Promise.all([
          api.get("/api/v1/kyc/stats").catch(() => ({ data: {} })),
          api.get("/api/v1/banks/list").catch(() => ({ data: [] })),
          api.get("/api/v1/blockchain/stats").catch(() => ({ data: {} })),
        ]);

        const kycData = kycRes.data?.data || kycRes.data || {};
        const banksData = banksRes.data?.data || banksRes.data || [];
        const bcData = blockchainRes.data?.data || blockchainRes.data || {};

        console.log("Fetched KYC Stats:", kycData);
        console.log("Fetched Banks Data:", banksData);
        console.log("Fetched Blockchain Stats:", bcData);

        setStats({
          total_customers: kycData.total || 0,
          pending_kyc: kycData.pending || 0,
          verified_kyc: kycData.verified || 0,
          rejected_kyc: kycData.rejected || 0,
          total_banks: Array.isArray(banksData) ? banksData.length : 0,
          pending_txs: bcData.pending_txs || 0,
          total_blocks: bcData.total_blocks || 0,
        });
      } catch {
        // Use empty stats on error
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400 text-sm mt-1">Overview of the KYC Blockchain system</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          title="Total Customers"
          value={stats?.total_customers ?? 0}
          icon={Users}
          color="bg-blue-600"
          loading={loading}
        />
        <StatCard
          title="Pending KYC"
          value={stats?.pending_kyc ?? 0}
          icon={Clock}
          color="bg-yellow-600"
          loading={loading}
        />
        <StatCard
          title="Verified KYC"
          value={stats?.verified_kyc ?? 0}
          icon={ShieldCheck}
          color="bg-green-600"
          loading={loading}
        />
        <StatCard
          title="Rejected KYC"
          value={stats?.rejected_kyc ?? 0}
          icon={TrendingUp}
          color="bg-red-600"
          loading={loading}
        />
        <StatCard
          title="Banks"
          value={stats?.total_banks ?? 0}
          icon={Building2}
          color="bg-purple-600"
          loading={loading}
        />
        <StatCard
          title="Pending Transactions Blockchain"
          value={stats?.pending_txs ?? 0}
          icon={CircleDashed}
          color="bg-orange-600"
          loading={loading}
        />
        <StatCard
          title="Blockchain Blocks"
          value={stats?.total_blocks ?? 0}
          icon={LinkIcon}
          color="bg-cyan-600"
          loading={loading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full bg-gray-800" />
                ))}
              </div>
            ) : (
              <p className="text-gray-500 text-sm text-center py-4">
                No recent activity to display
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base">System Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-800">
                <span className="text-gray-400 text-sm">API Server</span>
                <span className="text-green-400 text-sm flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-400 rounded-full inline-block" />
                  Online
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-800">
                <span className="text-gray-400 text-sm">Blockchain Node</span>
                <span className="text-green-400 text-sm flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-400 rounded-full inline-block" />
                  Active
                </span>
              </div>
              <div className="flex items-center justify-between py-2">
                <span className="text-gray-400 text-sm">AI KYC Scanner</span>
                <span className="text-green-400 text-sm flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-400 rounded-full inline-block" />
                  Ready
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
