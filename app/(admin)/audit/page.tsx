"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Search, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { format } from "date-fns";

interface AuditLog {
  id: number;
  user_id: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: Record<string, any>;
  ip_address: string;
  user_agent: string;
  created_at: string; // ISO timestamp from DB
}

const ACTION_COLORS: Record<string, string> = {
  PASSWORD_CHANGED:             "bg-blue-900 text-blue-300",
  CERTIFICATE_ISSUED:           "bg-purple-900 text-purple-300",
  KYC_PERIODIC_REVIEW:          "bg-yellow-900 text-yellow-300",
  REQUESTER_KEY_REVOKED:        "bg-red-900 text-red-300",
  REQUESTER_KEYPAIR_GENERATED:  "bg-green-900 text-green-300",
};

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await api.get("/api/v1/audit/logs", {
        params: { limit: 200 },
      });

      // Go response shape: { success, message, data: { logs: [...], count, start_date, end_date } }
      const payload = res.data?.data;
      const logsArray = payload?.logs ?? payload ?? [];
      setLogs(Array.isArray(logsArray) ? logsArray : []);
    } catch (err: any){
      console.error("[AuditPage] fetch error:", err?.response?.data ?? err?.message);
      setError(err?.response?.data?.message ?? "Failed to load audit logs");
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const filtered = logs.filter((l) =>
    l.action?.toLowerCase().includes(search.toLowerCase()) ||
    l.user_id?.toLowerCase().includes(search.toLowerCase()) ||
    l.resource_type?.toLowerCase().includes(search.toLowerCase()) ||
    l.ip_address?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
          <p className="text-gray-400 text-sm mt-1">
            Track all system activities — {logs.length} entries loaded
          </p>
        </div>
        <Button onClick={fetchLogs} variant="outline" size="sm"
          className="border-gray-700 text-gray-300 hover:bg-gray-800">
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-red-950 border border-red-800 text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search by action, user, resource, IP..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-gray-800 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800">
                  <TableHead className="text-gray-400">Action</TableHead>
                  <TableHead className="text-gray-400">User ID</TableHead>
                  <TableHead className="text-gray-400">Resource</TableHead>
                  <TableHead className="text-gray-400">IP Address</TableHead>
                  <TableHead className="text-gray-400">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(8)].map((_, i) => (
                    <TableRow key={i} className="border-gray-800">
                      {[...Array(5)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-500 py-12">
                      {search ? "No logs match your search" : "No audit logs found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((log, idx) => (
                    <TableRow key={log.id ?? idx} className="border-gray-800 hover:bg-gray-800/50">
                      <TableCell>
                        <Badge className={ACTION_COLORS[log.action] ?? "bg-gray-800 text-gray-300"}>
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-400 font-mono text-xs">
                        {log.user_id || "—"}
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        <span className="text-gray-500">{log.resource_type}</span>
                        {log.resource_id ? (
                          <span className="text-gray-400">/{log.resource_id}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-gray-400 font-mono text-xs">
                        {log.ip_address || "—"}
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm whitespace-nowrap">
                        {log.created_at
                          ? format(new Date(log.created_at), "MMM d yyyy, HH:mm:ss")
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {!loading && filtered.length > 0 && (
            <p className="text-gray-500 text-xs mt-3">
              Showing {filtered.length} of {logs.length} entries
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
