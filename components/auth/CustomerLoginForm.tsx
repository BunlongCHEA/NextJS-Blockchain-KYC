"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { UserCircle, Eye, EyeOff, Loader2, AlertCircle, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
 
const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
 
type LoginFormData = z.infer<typeof loginSchema>;
 
// Detect errors that mean "account exists but KYC not yet approved"
function isPendingKYC(errMsg: string): boolean {
  const msg = errMsg.toLowerCase();
  return (
    msg.includes("not verified") ||
    msg.includes("pending") ||
    msg.includes("not active") ||
    msg.includes("inactive") ||
    msg.includes("disabled") ||
    msg.includes("account is not active")
  );
}
 
export default function CustomerLoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [pendingKYC, setPendingKYC]     = useState(false);
  const [isLoading, setIsLoading]       = useState(false);
 
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({ resolver: zodResolver(loginSchema) });
 
  const onSubmit = async (data: LoginFormData) => {
    setIsLoading(true);
    setError(null);
    setPendingKYC(false);
 
    try {
      const result = await signIn("credentials", {
        username: data.username,
        password: data.password,
        redirect: false,
      });
 
      if (result?.error) {
        if (isPendingKYC(result.error)) {
          setPendingKYC(true);
          setError(
            "Your account is pending KYC verification. " +
            "An admin will activate your portal access once your KYC is approved."
          );
        } else {
          setError("Invalid username or password. Please check your credentials.");
        }
        return;
      }
 
      // Check if password change is required
      const session = await fetch("/api/auth/session").then((r) => r.json());
      if ((session as any)?.passwordChangeRequired) {
        router.push("/change-password");
      } else {
        router.push("/customer/dashboard");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };
 
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="w-full max-w-md px-4">
 
        {/* Logo */}
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-500 rounded-xl shadow-lg">
              <UserCircle className="h-8 w-8 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">KYC Portal</h1>
              <p className="text-gray-500 text-sm">Customer Access</p>
            </div>
          </div>
        </div>
 
        <Card className="shadow-lg border-0">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl text-gray-800">Welcome back</CardTitle>
            <CardDescription>Sign in to your customer account</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
 
              {/* ── Error alert ──────────────────────────────────────────── */}
              {/* FIX: explicit bg-red-50 / text-red-700 instead of          */}
              {/*      variant="destructive" (broken CSS vars in light theme)  */}
              {error && !pendingKYC && (
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
                  <span>{error}</span>
                </div>
              )}
 
              {/* ── Pending KYC banner (amber, not red) ──────────────────── */}
              {pendingKYC && (
                <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  <Clock className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                  <span>{error}</span>
                </div>
              )}
 
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  {...register("username")}
                />
                {errors.username && (
                  <p className="text-red-500 text-sm">{errors.username.message}</p>
                )}
              </div>
 
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    className="pr-10"
                    {...register("password")}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-red-500 text-sm">{errors.password.message}</p>
                )}
              </div>
 
              <div className="flex items-center justify-end">
                <Link href="/forgot-password" className="text-sm text-blue-600 hover:text-blue-500">
                  Forgot password?
                </Link>
              </div>
 
              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={isLoading}
              >
                {isLoading ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</>
                ) : "Sign in"}
              </Button>
            </form>
 
            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="text-blue-600 hover:text-blue-500 font-medium">
                  Register for KYC
                </Link>
              </p>
            </div>
 
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700 text-center">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                You can only login after your KYC is verified
              </p>
            </div>
          </CardContent>
        </Card>
 
        <div className="mt-4 text-center">
          <Link href="/login/admin" className="text-sm text-gray-400 hover:text-gray-600">
            Admin / Staff Login →
          </Link>
        </div>
      </div>
    </div>
  );
}