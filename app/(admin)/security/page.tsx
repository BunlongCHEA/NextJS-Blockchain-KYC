"use client";

import { Lock, Shield, RefreshCw, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function SecurityPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Security</h1>
        <p className="text-gray-400 text-sm mt-1">System security settings and monitoring</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-blue-400" />
              Security Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { label: "Two-Factor Auth", status: "Enabled", ok: true },
              { label: "SSL/TLS Encryption", status: "Active", ok: true },
              { label: "Rate Limiting", status: "Enabled", ok: true },
              { label: "IP Whitelist", status: "Configured", ok: true },
              { label: "Failed Login Attempts (24h)", status: "3", ok: true },
              { label: "Last Security Scan", status: "2 hours ago", ok: true },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between py-1">
                <span className="text-gray-400 text-sm">{item.label}</span>
                <Badge
                  className={item.ok ? "bg-green-900 text-green-300" : "bg-red-900 text-red-300"}
                >
                  {item.status}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <Lock className="h-4 w-4 text-orange-400" />
              Password Policy
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="bg-gray-800 rounded-lg p-4 space-y-2">
              <p className="text-gray-300 text-sm font-medium">Current Policy</p>
              <ul className="text-gray-400 text-sm space-y-1 list-disc list-inside">
                <li>Minimum 15 characters</li>
                <li>At least 1 uppercase letter</li>
                <li>At least 1 number</li>
                <li>At least 1 special character</li>
                <li>Cannot reuse last 5 passwords</li>
                <li>Password expires every 90 days</li>
              </ul>
            </div>
            <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 w-full">
              Edit Policy
            </Button>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-400" />
              Recent Security Events
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-500 text-sm text-center py-4">No security events in the last 24 hours</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-green-400" />
              Security Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button variant="outline" className="w-full justify-start border-gray-700 text-gray-300 hover:bg-gray-800">
              Force all users to change passwords
            </Button>
            <Button variant="outline" className="w-full justify-start border-gray-700 text-gray-300 hover:bg-gray-800">
              Invalidate all active sessions
            </Button>
            <Button variant="outline" className="w-full justify-start border-gray-700 text-gray-300 hover:bg-gray-800">
              Run security audit
            </Button>
            <Button variant="outline" className="w-full justify-start border-red-900 text-red-400 hover:bg-red-900/20">
              Lock system (emergency)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
