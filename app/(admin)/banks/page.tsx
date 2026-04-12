"use client";

import { useEffect, useState } from "react";
import { Building2, Plus, RefreshCw, CheckCircle, XCircle } from "lucide-react";
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
import { Bank } from "@/types/bank";
import api from "@/lib/api";
import { format } from "date-fns";

export default function BanksPage() {
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBanks = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/banks/list");
      const data = res.data?.data || res.data || [];

      // console.log("[BanksPage] API response data:", data);

      setBanks(Array.isArray(data) ? data : []);
    } catch {
      setBanks([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBanks();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Banks</h1>
          <p className="text-gray-400 text-sm mt-1">Manage partner banks in the KYC system</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchBanks} variant="outline" size="sm" className="border-gray-700 text-gray-300">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            Add Bank
          </Button>
        </div>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="pt-6">
          <div className="rounded-md border border-gray-800">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800">
                  <TableHead className="text-gray-400">Bank Name</TableHead>
                  <TableHead className="text-gray-400">Code</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-gray-400">Created</TableHead>
                  <TableHead className="text-right text-gray-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(4)].map((_, i) => (
                    <TableRow key={i} className="border-gray-800">
                      {[...Array(5)].map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full bg-gray-800" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : banks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                      No banks registered
                    </TableCell>
                  </TableRow>
                ) : (
                  banks.map((bank) => (
                    <TableRow key={bank.id} className="border-gray-800 hover:bg-gray-800/50">
                      <TableCell className="text-white font-medium flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gray-500" />
                        {bank.name}
                      </TableCell>
                      <TableCell className="font-mono text-gray-400 text-sm">{bank.code}</TableCell>
                      <TableCell>
                        {bank.is_active ? (
                          <span className="flex items-center gap-1 text-green-400 text-sm">
                            <CheckCircle className="h-3.5 w-3.5" /> Active
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-400 text-sm">
                            <XCircle className="h-3.5 w-3.5" /> Inactive
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {bank.created_at
                          ? format(new Date(bank.created_at), "MMM d, yyyy")
                          : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-gray-400 hover:text-white hover:bg-gray-800"
                        >
                          Edit
                        </Button>
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
