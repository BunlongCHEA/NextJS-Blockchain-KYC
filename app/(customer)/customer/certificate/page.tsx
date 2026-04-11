"use client";

import { useEffect, useState } from "react";
import { FileCheck, Download, Share2, Shield, Calendar, Hash } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
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

export default function CustomerCertificatePage() {
  const [cert, setCert] = useState<Certificate | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCert = async () => {
      try {
        const res = await api.get("/api/v1/certificates/me");
        setCert(res.data?.data || res.data);
      } catch {
        setCert(null);
      } finally {
        setLoading(false);
      }
    };
    fetchCert();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (!cert) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <FileCheck className="h-16 w-16 text-gray-200 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 mb-2">No Certificate Available</h2>
        <p className="text-gray-500 mb-1">Your KYC certificate is not yet available.</p>
        <p className="text-gray-400 text-sm">
          Certificate will be issued once your KYC is verified.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">KYC Certificate</h1>
        <p className="text-gray-500 mt-1">Your verified identity certificate</p>
      </div>

      {/* Certificate Card */}
      <Card className="border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-100 rounded-full -translate-y-16 translate-x-16 opacity-50" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-indigo-100 rounded-full translate-y-12 -translate-x-12 opacity-50" />

        <CardContent className="p-8 relative">
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-500 rounded-xl shadow-md">
                <Shield className="h-7 w-7 text-white" />
              </div>
              <div>
                <p className="text-blue-700 text-xs font-semibold uppercase tracking-wider">
                  KYC Blockchain System
                </p>
                <h2 className="text-lg font-bold text-gray-800">
                  Verification Certificate
                </h2>
              </div>
            </div>
            <Badge className="bg-green-100 text-green-700 border-green-200">
              {cert.status || "Active"}
            </Badge>
          </div>

          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm w-28">Certificate ID</span>
              <span className="font-mono text-sm text-gray-800 font-medium">{cert.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-sm w-28">Issued To</span>
              <span className="text-gray-800 font-semibold">{cert.customer_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500 text-sm w-24">Issued On</span>
              <span className="text-gray-800 text-sm">
                {cert.issued_at
                  ? format(new Date(cert.issued_at * 1000), "MMMM d, yyyy")
                  : "-"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500 text-sm w-24">Valid Until</span>
              <span className="text-gray-800 text-sm">
                {cert.expires_at
                  ? format(new Date(cert.expires_at * 1000), "MMMM d, yyyy")
                  : "-"}
              </span>
            </div>
          </div>

          <div className="bg-white/70 rounded-lg p-3 mb-6">
            <div className="flex items-start gap-2">
              <Hash className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-gray-500 text-xs mb-1">Blockchain Hash</p>
                <p className="font-mono text-xs text-gray-700 break-all">{cert.hash}</p>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button className="flex-1 bg-blue-600 hover:bg-blue-700">
              <Download className="h-4 w-4 mr-2" />
              Download PDF
            </Button>
            <Button variant="outline" className="border-blue-300 text-blue-600 hover:bg-blue-50">
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 text-center">
          <p className="text-gray-500 text-sm">
            This certificate is cryptographically secured on the blockchain.
            <br />
            Anyone can verify its authenticity using the certificate hash above.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
