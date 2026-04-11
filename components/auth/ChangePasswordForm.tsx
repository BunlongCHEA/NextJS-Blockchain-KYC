"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Lock, Loader2, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { changePasswordSchema, ChangePasswordFormData } from "@/lib/validations/password";
import api from "@/lib/api";

export default function ChangePasswordForm() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
  });

  const isForced = (session as any)?.passwordChangeRequired;

  const onSubmit = async (data: ChangePasswordFormData) => {
    setIsLoading(true);
    setError(null);

    try {
      await api.post("/api/v1/auth/change-password", {
        current_password: data.currentPassword,
        new_password: data.newPassword,
      });

      // Update session to clear passwordChangeRequired
      await update({ passwordChangeRequired: false });

      const role = (session?.user as any)?.role;
      if (role === "customer") {
        router.push("/customer/dashboard");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          "Failed to change password. Please try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md px-4">
      <Card className="shadow-lg">
        <CardHeader className="text-center">
          <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Lock className="h-6 w-6 text-orange-600" />
          </div>
          <CardTitle className="text-xl">
            {isForced ? "Password Change Required" : "Change Password"}
          </CardTitle>
          <CardDescription>
            {isForced
              ? "For security reasons, you must set a new password before continuing."
              : "Update your account password."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <Input
                id="currentPassword"
                type="password"
                placeholder="Enter current password"
                {...register("currentPassword")}
              />
              {errors.currentPassword && (
                <p className="text-red-500 text-sm">{errors.currentPassword.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                placeholder="Min 15 chars, 1 uppercase, 1 number, 1 special"
                {...register("newPassword")}
              />
              {errors.newPassword && (
                <p className="text-red-500 text-sm">{errors.newPassword.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="Repeat new password"
                {...register("confirmPassword")}
              />
              {errors.confirmPassword && (
                <p className="text-red-500 text-sm">{errors.confirmPassword.message}</p>
              )}
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-md p-3">
              <p className="text-xs text-amber-800 font-medium mb-1">Password Requirements:</p>
              <ul className="text-xs text-amber-700 space-y-0.5 list-disc list-inside">
                <li>Minimum 15 characters</li>
                <li>At least 1 uppercase letter</li>
                <li>At least 1 number</li>
                <li>At least 1 special character</li>
              </ul>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Changing Password...
                </>
              ) : (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Change Password
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
