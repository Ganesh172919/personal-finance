import { useEffect, useState } from "react";
import { useToast } from "@/hooks/useToast";
import { ApiError, apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { SimpleOTPInput } from "@/components/ui/InputOtp";
import { useAuth } from "@/hooks/useAuth";
import { useLocation } from "wouter";
import { sanitizeNextPath } from "@/lib/url";

const POST_AUTH_REDIRECT_KEY = "finwise.post_auth_redirect";

export default function VerifyEmail() {
  const { checkAuthStatus } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [otp, setOtp] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const email = sessionStorage.getItem("emailForVerification");
  const devOtp = sessionStorage.getItem("devOtpForVerification");

  useEffect(() => {
    if (!email) {
      navigate("/register");
    }
  }, [email, navigate]);

  useEffect(() => {
    if (!otp && devOtp && devOtp.length === 6) {
      setOtp(devOtp);
    }
  }, [devOtp, otp]);

  if (!email) {
    return null;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (otp.length !== 6) {
      toast({
        title: "Invalid Code",
        description: "Please enter a 6-digit verification code.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await apiClient("/auth/verify-email", {
        method: "POST",
        body: JSON.stringify({ email, otp }),
      });

      await checkAuthStatus();

      toast({
        title: "Email Verified!",
        description: "Welcome to Personal Finance. You are now logged in.",
      });
      sessionStorage.removeItem("devOtpForVerification");

      const stored = sanitizeNextPath(sessionStorage.getItem(POST_AUTH_REDIRECT_KEY));
      if (stored) {
        sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
        navigate(stored);
      } else {
        navigate("/dashboard");
      }
    } catch (error: unknown) {
      const requestId = error instanceof ApiError ? error.requestId : undefined;
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast({
        title: "Verification Failed",
        description: requestId ? `${message} (Request ID: ${requestId})` : message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendCode = async () => {
    try {
      const response = await apiClient<{ message?: string; dev_otp?: string }>("/auth/resend-verification", {
        method: "POST",
        body: JSON.stringify({ email }),
      });

      if (response?.dev_otp) {
        sessionStorage.setItem("devOtpForVerification", response.dev_otp);
        setOtp(response.dev_otp);
      }
      toast({
        title: "Code Resent",
        description: response?.dev_otp
          ? `Dev mode OTP: ${response.dev_otp}`
          : "A new verification code has been sent to your email.",
      });
    } catch (error: unknown) {
      const requestId = error instanceof ApiError ? error.requestId : undefined;
      const message = error instanceof Error ? error.message : "Failed to resend verification code.";
      toast({
        title: "Resend Failed",
        description: requestId ? `${message} (Request ID: ${requestId})` : message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="mx-auto max-w-sm">
        <CardHeader>
          <CardTitle className="text-2xl">Check your email</CardTitle>
          <CardDescription>
            We've sent a 6-digit verification code to{" "}
            <span className="font-semibold text-foreground">{email}</span>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <SimpleOTPInput
                maxLength={6}
                value={otp}
                onChange={(value: string) => setOtp(value)}
                className="justify-center"
              />
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Verifying..." : "Verify Account"}
            </Button>
          </form>
          <div className="mt-4 text-center text-sm">
            Didn't receive a code?{" "}
            <Button
              variant="link"
              className="p-0 h-auto"
              onClick={handleResendCode}
              type="button"
            >
              Resend
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
