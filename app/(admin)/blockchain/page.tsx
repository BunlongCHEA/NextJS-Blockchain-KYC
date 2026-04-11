"use client";

import { useEffect, useState } from "react";
import { Link as LinkIcon, RefreshCw, CheckCircle, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Block, BlockchainStats } from "@/types/blockchain";
import api from "@/lib/api";
import { format } from "date-fns";

export default function BlockchainPage() {
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [stats, setStats] = useState<BlockchainStats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [blocksRes, statsRes] = await Promise.all([
        api.get("/api/v1/blockchain/blocks").catch(() => ({ data: [] })),
        api.get("/api/v1/blockchain/stats").catch(() => ({ data: {} })),
      ]);
      const blocksData = blocksRes.data?.data || blocksRes.data || [];
      const statsData = statsRes.data?.data || statsRes.data || {};
      setBlocks(Array.isArray(blocksData) ? blocksData : []);
      setStats(statsData);
    } catch {
      setBlocks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Blockchain Explorer</h1>
          <p className="text-gray-400 text-sm mt-1">View blocks and transactions on the KYC blockchain</p>
        </div>
        <Button onClick={fetchData} variant="outline" size="sm" className="border-gray-700 text-gray-300">
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Blocks", value: stats?.total_blocks ?? 0, color: "text-blue-400" },
          { label: "Total Transactions", value: stats?.total_transactions ?? 0, color: "text-green-400" },
          { label: "Pending Tx", value: stats?.pending_transactions ?? 0, color: "text-yellow-400" },
          {
            label: "Chain Valid",
            value: stats?.is_valid ? "Yes" : "No",
            color: stats?.is_valid ? "text-green-400" : "text-red-400",
          },
        ].map((s) => (
          <Card key={s.label} className="bg-gray-900 border-gray-800">
            <CardContent className="p-4">
              <p className="text-gray-400 text-xs">{s.label}</p>
              {loading ? (
                <Skeleton className="h-6 w-12 mt-1 bg-gray-800" />
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
            <LinkIcon className="h-4 w-4 text-cyan-400" />
            Blocks
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-gray-800">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800">
                  <TableHead className="text-gray-400">Index</TableHead>
                  <TableHead className="text-gray-400">Hash</TableHead>
                  <TableHead className="text-gray-400">Previous Hash</TableHead>
                  <TableHead className="text-gray-400">Nonce</TableHead>
                  <TableHead className="text-gray-400">Timestamp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i} className="border-gray-800">
                      {[...Array(5)].map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full bg-gray-800" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : blocks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                      No blocks found
                    </TableCell>
                  </TableRow>
                ) : (
                  blocks.map((block) => (
                    <TableRow key={block.index} className="border-gray-800 hover:bg-gray-800/50">
                      <TableCell className="text-white font-mono">#{block.index}</TableCell>
                      <TableCell className="font-mono text-xs text-cyan-400">
                        {block.hash ? block.hash.substring(0, 16) + "..." : "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs text-gray-400">
                        {block.previous_hash
                          ? block.previous_hash.substring(0, 16) + "..."
                          : "Genesis"}
                      </TableCell>
                      <TableCell className="text-gray-400">{block.nonce}</TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {block.timestamp
                          ? format(new Date(block.timestamp * 1000), "MMM d, yyyy HH:mm")
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
