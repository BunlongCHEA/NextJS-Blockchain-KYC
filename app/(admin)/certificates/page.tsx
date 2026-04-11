"use client";

import { useEffect, useState } from "react";
import { FileCheck, RefreshCw, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import api from "@/lib/api";
import { format } from "date-fns";

interface Certificate {
  id: string;
  customer_id: string;
  customer_name: string;
  issued_at: number;
  expires_at: number;
  hash: string;
  status: string;
}

export default function CertificatesPage() {
  const [certs, setCerts] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCerts = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/v1/certificates/list");
      const data = res.data?.data || res.data || [];
      setCerts(Array.isArray(data) ? data : []);
    } catch {
      setCerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCerts(); }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Certificates</h1>
          <p className="text-gray-400 text-sm mt-1">KYC verification certificates</p>
        </div>
        <Button onClick={fetchCerts} variant="outline" size="sm" className="border-gray-700 text-gray-300">
          <RefreshCw className="h-4 w-4 mr-2" />Refresh
        </Button>
      </div>

      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="pt-6">
          <div className="rounded-md border border-gray-800">
            <Table>
              <TableHeader>
                <TableRow className="border-gray-800">
                  <TableHead className="text-gray-400">Customer</TableHead>
                  <TableHead className="text-gray-400">Certificate Hash</TableHead>
                  <TableHead className="text-gray-400">Issued</TableHead>
                  <TableHead className="text-gray-400">Expires</TableHead>
                  <TableHead className="text-gray-400">Status</TableHead>
                  <TableHead className="text-right text-gray-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(4)].map((_, i) => (
                    <TableRow key={i} className="border-gray-800">
                      {[...Array(6)].map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full bg-gray-800" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : certs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                      No certificates found
                    </TableCell>
                  </TableRow>
                ) : (
                  certs.map((cert) => (
                    <TableRow key={cert.id} className="border-gray-800 hover:bg-gray-800/50">
                      <TableCell className="text-white">{cert.customer_name || cert.customer_id}</TableCell>
                      <TableCell className="font-mono text-xs text-cyan-400">
                        {cert.hash ? cert.hash.substring(0, 20) + "..." : "-"}
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {cert.issued_at ? format(new Date(cert.issued_at * 1000), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell className="text-gray-400 text-sm">
                        {cert.expires_at ? format(new Date(cert.expires_at * 1000), "MMM d, yyyy") : "-"}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-green-900 text-green-300 border-green-700 text-xs">
                          {cert.status || "active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                          <Download className="h-4 w-4" />
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
