"use client";

import { useState } from "react";
import { Settings, Save, Globe, Bell, Shield, Database } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/components/ui/use-toast";

export default function SettingsPage() {
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise((r) => setTimeout(r, 800));
    setSaving(false);
    toast({ title: "Settings saved successfully" });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-gray-400 text-sm mt-1">Configure system settings and preferences</p>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="bg-gray-800 border border-gray-700">
          <TabsTrigger value="general" className="data-[state=active]:bg-gray-700 text-gray-400 data-[state=active]:text-white">General</TabsTrigger>
          <TabsTrigger value="notifications" className="data-[state=active]:bg-gray-700 text-gray-400 data-[state=active]:text-white">Notifications</TabsTrigger>
          <TabsTrigger value="api" className="data-[state=active]:bg-gray-700 text-gray-400 data-[state=active]:text-white">API</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4 space-y-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-400" />General Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-gray-300">System Name</Label>
                  <Input defaultValue="KYC Blockchain System" className="bg-gray-800 border-gray-700 text-white" />
                </div>
                <div className="space-y-1">
                  <Label className="text-gray-300">Support Email</Label>
                  <Input defaultValue="support@kyc.bunlong.uk" className="bg-gray-800 border-gray-700 text-white" />
                </div>
                <div className="space-y-1">
                  <Label className="text-gray-300">Default Language</Label>
                  <Input defaultValue="en" className="bg-gray-800 border-gray-700 text-white" />
                </div>
                <div className="space-y-1">
                  <Label className="text-gray-300">Timezone</Label>
                  <Input defaultValue="Asia/Phnom_Penh" className="bg-gray-800 border-gray-700 text-white" />
                </div>
              </div>
              <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700" disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Bell className="h-4 w-4 text-yellow-400" />Notification Settings
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-gray-300">SMTP Host</Label>
                <Input placeholder="smtp.gmail.com" className="bg-gray-800 border-gray-700 text-white" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-gray-300">SMTP Port</Label>
                  <Input placeholder="587" className="bg-gray-800 border-gray-700 text-white" />
                </div>
                <div className="space-y-1">
                  <Label className="text-gray-300">From Email</Label>
                  <Input placeholder="noreply@kyc.bunlong.uk" className="bg-gray-800 border-gray-700 text-white" />
                </div>
              </div>
              <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700" disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="api" className="mt-4">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Database className="h-4 w-4 text-green-400" />API Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label className="text-gray-300">Go API URL</Label>
                <Input defaultValue={process.env.NEXT_PUBLIC_API_URL || "https://kycapi.bunlong.uk"} className="bg-gray-800 border-gray-700 text-white" readOnly />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-300">Python AI KYC API URL</Label>
                <Input defaultValue={process.env.NEXT_PUBLIC_PYTHON_API_URL || "https://kyc-python-api.bunlong.uk"} className="bg-gray-800 border-gray-700 text-white" readOnly />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
