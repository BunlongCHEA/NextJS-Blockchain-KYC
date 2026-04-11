"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, CheckCircle, Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import api from "@/lib/api";
import { format } from "date-fns";

interface Alert {
  id: string;
  type: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  created_at: number;
  resolved: boolean;
}

const severityColors: Record<string, string> = {
  critical: "bg-red-900 text-red-300 border-red-800",
  high: "bg-orange-900 text-orange-300 border-orange-800",
  medium: "bg-yellow-900 text-yellow-300 border-yellow-800",
  low: "bg-blue-900 text-blue-300 border-blue-800",
};

export default function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/alerts/list");
      const data = res.data?.data || res.data || [];
      setAlerts(Array.isArray(data) ? data : []);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAlerts(); }, []);

  const unresolved = alerts.filter((a) => !a.resolved);
  const resolved = alerts.filter((a) => a.resolved);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Alerts</h1>
          <p className="text-gray-400 text-sm mt-1">System alerts and notifications</p>
        </div>
        <Button onClick={fetchAlerts} variant="outline" size="sm" className="border-gray-700 text-gray-300">
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Alerts", value: alerts.length, color: "text-white" },
          { label: "Unresolved", value: unresolved.length, color: "text-red-400" },
          { label: "Critical", value: alerts.filter((a) => a.severity === "critical").length, color: "text-red-400" },
          { label: "Resolved", value: resolved.length, color: "text-green-400" },
        ].map((s) => (
          <Card key={s.label} className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <p className="text-gray-400 text-xs">{s.label}</p>
              {loading ? (
                <Skeleton className="h-6 w-8 mt-1 bg-gray-800" />
              ) : (
                <p className={`text-xl font-bold mt-1 ${s.color}`}>{s.value}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader>
          <CardTitle className="text-white text-base flex items-center gap-2">
            <Bell className="h-4 w-4 text-yellow-400" />
            Active Alerts
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full bg-gray-800" />
              ))}
            </div>
          ) : unresolved.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-10 w-10 text-green-400 mx-auto mb-3" />
              <p className="text-gray-400">No active alerts. System is healthy.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {unresolved.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-gray-800 border border-gray-700"
                >
                  <AlertTriangle
                    className={`h-4 w-4 mt-0.5 shrink-0 ${
                      alert.severity === "critical" ? "text-red-400" :
                      alert.severity === "high" ? "text-orange-400" :
                      alert.severity === "medium" ? "text-yellow-400" : "text-blue-400"
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`text-xs ${severityColors[alert.severity]}`}>
                        {alert.severity}
                      </Badge>
                      <span className="text-gray-500 text-xs">
                        {alert.created_at ? format(new Date(alert.created_at * 1000), "MMM d, HH:mm") : ""}
                      </span>
                    </div>
                    <p className="text-gray-300 text-sm">{alert.message}</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-green-400 hover:text-green-300 shrink-0"
                    onClick={() => fetchAlerts()}
                  >
                    Resolve
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
