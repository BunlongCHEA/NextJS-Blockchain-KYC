"use client";

import { useEffect, useState } from "react";
import { Key, Plus, RefreshCw, Eye, EyeOff, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { format } from "date-fns";

interface ApiKey {
  id: string;
  name: string;
  key: string;
  created_at: string;
  last_used: string;
  is_active: boolean;
}

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/api-keys/list");
      const data = res.data?.data || res.data || [];
      setKeys(Array.isArray(data) ? data : []);
    } catch {
      setKeys([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchKeys(); }, []);

  const toggleVisible = (id: string) => {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const maskKey = (key: string) => key ? key.substring(0, 8) + "••••••••••••••••" : "••••••••";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">API Keys</h1>
          <p className="text-gray-400 text-sm mt-1">Manage API keys for system integrations</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchKeys} variant="outline" size="sm" className="border-gray-700 text-gray-300">
            <RefreshCw className="h-4 w-4 mr-2" />Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />Generate Key
          </Button>
        </div>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="pt-6">
          <div className="rounded-md border border-gray-800">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800">
                  <TableHead className="text-gray-400">Name</TableHead>
                  <TableHead className="text-gray-400">Key</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400">Created</TableHead>
                  <TableHead className="text-gray-400">Last Used</TableHead>
                  <TableHead className="text-right text-gray-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(3)].map((_, i) => (
                    <TableRow key={i} className="border-gray-800">
                      {[...Array(6)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                      No API keys found
                    </TableCell>
                  </TableRow>
                ) : (
                  keys.map((k) => (
                    <TableRow key={k.id} className="border-gray-800 hover:bg-gray-800/50">
                      <TableCell className="text-white font-medium">{k.name}</TableCell>
                      <TableCell className="font-mono text-sm text-cyan-400">
                        {visibleKeys.has(k.id) ? k.key : maskKey(k.key)}
                      </TableCell>
                      <TableCell>
                        <Badge className={k.is_active ? "bg-green-900 text-green-300" : "bg-gray-800 text-gray-400"}>
                          {k.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {k.created_at ? format(new Date(k.created_at), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {k.last_used ? format(new Date(k.last_used), "MMM d, yyyy") : "Never"}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400" onClick={() => toggleVisible(k.id)}>
                            {visibleKeys.has(k.id) ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-400 hover:text-red-300">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
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
