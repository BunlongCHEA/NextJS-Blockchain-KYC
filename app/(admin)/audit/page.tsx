"use client";

import { useEffect, useState } from "react";
import { Activity, RefreshCw, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  id: string;
  action: string;
  user_id: string;
  username: string;
  resource: string;
  resource_id: string;
  timestamp: number;
  ip_address: string;
  status: string;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/audit/logs");
      const data = res.data?.data || res.data || [];
      setLogs(Array.isArray(data) ? data : []);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLogs(); }, []);

  const filtered = logs.filter(
    (l) =>
      l.action?.toLowerCase().includes(search.toLowerCase()) ||
      l.username?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Audit Logs</h1>
          <p className="text-gray-400 text-sm mt-1">Track all system activities and changes</p>
        </div>
        <Button onClick={fetchLogs} variant="outline" size="sm" className="border-gray-700 text-gray-300">
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
            <Input
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-gray-800">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800">
                  <TableHead className="text-gray-400">Action</TableHead>
                  <TableHead className="text-gray-400">User</TableHead>
                  <TableHead className="text-gray-400">Resource</TableHead>
                  <TableHead className="text-gray-400">IP Address</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(6)].map((_, i) => (
                    <TableRow key={i} className="border-gray-800">
                      {[...Array(6)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                      No audit logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((log) => (
                    <TableRow key={log.id} className="border-gray-800 hover:bg-gray-800/50">
                      <TableCell className="text-white font-mono text-sm">{log.action}</TableCell>
                      <TableCell className="text-gray-400">{log.username || log.user_id}</TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {log.resource}/{log.resource_id}
                      </TableCell>
                      <TableCell className="text-gray-400 font-mono text-xs">{log.ip_address}</TableCell>
                      <TableCell>
                        <Badge
                          className={
                            log.status === "success"
                              ? "bg-green-900 text-green-300"
                              : "bg-red-900 text-red-300"
                          }
                        >
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {log.timestamp
                          ? format(new Date(log.timestamp * 1000), "MMM d, HH:mm:ss")
                          : "-"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
