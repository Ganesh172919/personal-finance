/**
 * @fileoverview Email verification page with 6-digit OTP input.
 *
 * Displayed after registration to confirm the user's email address.
 * Reads the email from sessionStorage (set by the Register page) and
 * submits the 6-digit OTP to POST /api/auth/verify-email.  On success,
 * refreshes the auth context and navigates to the dashboard or the
 * stored post-auth redirect path.
 *
 * Key data flows:
 * - POST /api/auth/verify-email with { email, otp } confirms the code.
 * - checkAuthStatus() refreshes the auth context so the router recognises
 *   the user as verified.
 * - In development mode, the OTP is auto-populated from sessionStorage
 *   (devOtpForVerification) for faster local testing.
 *
 * A "Resend code" action re-triggers the server-side OTP email.
 * Users without an email in sessionStorage are redirected to /register.
 *
 * Routed at /verify-email; the next step in the registration flow.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, MailCheck, ShieldCheck, Sparkles } from "lucide-react";
import { useLocation } from "wouter";

import { useToast } from "@/hooks/useToast";
import { ApiError, apiClient } from "@/lib/apiClient";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { SimpleOTPInput } from "@/components/ui/InputOtp";
import { useAuth } from "@/hooks/useAuth";
import { sanitizeNextPath } from "@/lib/url";

const POST_AUTH_REDIRECT_KEY = "finwise.post_auth_redirect";

const steps = [
  "Account created and secured with email authentication.",
  "Verification unlocks the full dashboard, chat, and workflow surface.",
  "Development mode keeps the OTP visible so local testing stays fast.",
];

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
        title: "Invalid code",
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
        title: "Email verified",
        description: "Your workspace is ready.",
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
        title: "Verification failed",
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
        title: "Code resent",
        description: response?.dev_otp
          ? `Development OTP: ${response.dev_otp}`
          : "A fresh verification code has been sent.",
      });
    } catch (error: unknown) {
      const requestId = error instanceof ApiError ? error.requestId : undefined;
      const message = error instanceof Error ? error.message : "Failed to resend verification code.";
      toast({
        title: "Resend failed",
        description: requestId ? `${message} (Request ID: ${requestId})` : message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <motion.section
          initial={{ opacity: 0, x: -32 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          className="space-y-8"
        >
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Final onboarding step
            </div>

            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-[0_22px_50px_-28px_rgba(255,255,255,0.5)]">
                <MailCheck className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-4xl font-bold tracking-tight text-foreground">Verify your email</h1>
                <p className="text-lg text-muted-foreground">One quick check before the full workspace opens.</p>
              </div>
            </div>

            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              We sent a 6-digit code to <span className="font-semibold text-foreground">{email}</span>.
              Finish verification to unlock the dashboard, AI chat, workflows, and the rest of the local demo.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {steps.map((step, index) => (
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.08 + index * 0.08 }}
                className="rounded-[calc(var(--radius)-2px)] border border-border/70 bg-card/80 p-5 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.85)]"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/75 text-primary">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <p className="text-sm leading-6 text-muted-foreground">{step}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.08 }}
        >
          <Card className="mx-auto w-full max-w-md border-border/80 bg-card/92 shadow-[0_32px_80px_-48px_rgba(15,23,42,0.95)]">
            <CardHeader className="space-y-2 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-border/70 bg-background/80 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <CardTitle className="text-2xl">Enter your verification code</CardTitle>
              <CardDescription>
                The code is six digits long and expires automatically after a short window.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit} className="grid gap-5">
                <div className="grid gap-3">
                  <SimpleOTPInput
                    maxLength={6}
                    value={otp}
                    onChange={(value: string) => setOtp(value)}
                    className="justify-center"
                  />
                  <p className="text-center text-xs text-muted-foreground">
                    Paste the code from email or use the development value shown below.
                  </p>
                </div>

                {devOtp ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 p-4 text-center">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Development OTP
                    </p>
                    <p className="mt-2 font-mono text-2xl font-semibold tracking-[0.42em] text-foreground">
                      {devOtp}
                    </p>
                  </div>
                ) : null}

                <Button type="submit" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Verifying..." : "Verify account"}
                </Button>
              </form>

              <div className="mt-4 rounded-2xl border border-border/70 bg-background/65 p-3 text-xs leading-5 text-muted-foreground">
                Local mode keeps verification easy to test while preserving the real email verification flow.
              </div>

              <div className="mt-5 text-center text-sm text-muted-foreground">
                Didn&apos;t receive a code?{" "}
                <Button variant="link" className="h-auto p-0 text-primary" onClick={handleResendCode} type="button">
                  Resend it
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.section>
      </div>
    </div>
  );
}
