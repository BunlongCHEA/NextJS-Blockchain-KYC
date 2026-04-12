"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Shield, Eye, EyeOff, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
// import { changePasswordSchema, ChangePasswordFormData } from "@/lib/validations/password";
// import api from "@/lib/api";

const changePasswordSchema = z.object({
  old_password: z.string().min(1, "Current password is required"),
  new_password: z
    .string()
    .min(15, "Minimum 15 characters")
    .regex(/[A-Z]/, "At least 1 capital letter")
    .regex(/[0-9]/, "At least 1 number")
    .regex(/[^A-Za-z0-9]/, "At least 1 special character"),
  confirm_password: z.string().min(1, "Please confirm your new password"),
}).refine((data) => data.new_password === data.confirm_password, {
  message: "Passwords do not match",
  path: ["confirm_password"],
});

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

export default function ChangePasswordForm() {
  const { data: session } = useSession();
  const router = useRouter();
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
  });

  const onSubmit = async (data: ChangePasswordFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/v1/auth/change-password`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // JWT from NextAuth session
            Authorization: `Bearer ${(session as any)?.accessToken}`,
          },
          body: JSON.stringify({
            old_password: data.old_password,
            new_password: data.new_password,
          }),
        }
      );

      const json = await res.json();

      if (!res.ok) {
        setError(json?.message ?? json?.error ?? "Failed to change password");
        return;
      }

      setSuccess(true);

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh(); // re-fetch session so passwordChangeRequired updates
      }, 2000);

    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-gray-950">
        <Card className="bg-gray-900 border-gray-800 w-full max-w-md mx-4">
          <CardContent className="pt-6 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
            <h2 className="text-xl font-semibold text-white">Password Changed!</h2>
            <p className="text-gray-400 text-sm">Redirecting to dashboard...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-md px-4">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-600 rounded-xl">
              <Shield className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">KYC Blockchain</h1>
              <p className="text-gray-400 text-sm">Security Update Required</p>
            </div>
          </div>
        </div>

        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-white">Change Password</CardTitle>
            <CardDescription className="text-gray-400">
              You must change your password before continuing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Password policy notice */}
            <div className="mb-4 p-3 rounded-lg bg-blue-950 border border-blue-800">
              <p className="text-blue-300 text-xs font-medium mb-1">Password Requirements:</p>
              <ul className="text-blue-400 text-xs space-y-0.5 list-disc list-inside">
                <li>Minimum 15 characters</li>
                <li>At least 1 capital letter (A–Z)</li>
                <li>At least 1 number (0–9)</li>
                <li>At least 1 special character (!@#$...)</li>
              </ul>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <Alert variant="destructive" className="bg-red-950 border-red-800">
                  <AlertDescription className="text-red-300">{error}</AlertDescription>
                </Alert>
              )}

              {/* Current Password */}
              <div className="space-y-2">
                <Label htmlFor="old_password" className="text-gray-300">Current Password</Label>
                <div className="relative">
                  <Input
                    id="old_password"
                    type={showOld ? "text" : "password"}
                    placeholder="Enter current password"
                    className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 pr-10"
                    {...register("old_password")}
                  />
                  <button type="button" onClick={() => setShowOld(!showOld)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                    {showOld ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.old_password && <p className="text-red-400 text-sm">{errors.old_password.message}</p>}
              </div>

              {/* New Password */}
              <div className="space-y-2">
                <Label htmlFor="new_password" className="text-gray-300">New Password</Label>
                <div className="relative">
                  <Input
                    id="new_password"
                    type={showNew ? "text" : "password"}
                    placeholder="Enter new password (min 15 chars)"
                    className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 pr-10"
                    {...register("new_password")}
                  />
                  <button type="button" onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.new_password && <p className="text-red-400 text-sm">{errors.new_password.message}</p>}
              </div>

              {/* Confirm Password */}
              <div className="space-y-2">
                <Label htmlFor="confirm_password" className="text-gray-300">Confirm New Password</Label>
                <div className="relative">
                  <Input
                    id="confirm_password"
                    type={showConfirm ? "text" : "password"}
                    placeholder="Confirm new password"
                    className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500 pr-10"
                    {...register("confirm_password")}
                  />
                  <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.confirm_password && <p className="text-red-400 text-sm">{errors.confirm_password.message}</p>}
              </div>

              <Button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white" disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Changing Password...</>
                ) : (
                  "Change Password"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}