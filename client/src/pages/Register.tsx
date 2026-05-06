/**
 * @fileoverview Registration page with name, email, phone, referral code, and password.
 *
 * Collects new user credentials through a validated form (react-hook-form
 * + zod) and submits to POST /api/auth/register.  On success, stores
 * the email (and dev OTP when present) in sessionStorage and navigates
 * to /verify-email for the OTP confirmation step.
 *
 * Key data flows:
 * - POST /api/auth/register creates the account; the server returns
 *   a dev_otp in development mode for local testing.
 * - ?next= query param is preserved across registration so the
 *   post-verification redirect lands on the intended page.
 *
 * Password rules: min 8 chars, upper + lower + digit required.
 * Phone is optional (regex-validated when provided).
 * Referral code is optional (6-16 alphanumeric, uppercased).
 *
 * Feature highlights (multi-agent guidance, security, referral-ready)
 * are shown on the left side of the split layout.
 *
 * Routed at /register; linked from Login page and public marketing.
 */

import { useEffect } from "react";
import { motion } from "framer-motion";
import { Brain, Gift, ShieldCheck, Sparkles } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { ApiError, apiClient } from "@/lib/apiClient";
import { useToast } from "@/hooks/useToast";
import { getSearchParam, sanitizeNextPath } from "@/lib/url";

const POST_AUTH_REDIRECT_KEY = "finwise.post_auth_redirect";

const phoneRegex = /^[+]?[0-9]{10,15}$/;
const emptyStringToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim().length === 0 ? undefined : value;

const registerSchema = z.object({
  name: z.string().min(2, { message: "Name must be at least 2 characters" }),
  email: z.string().email({ message: "Please enter a valid email" }),
  phoneNumber: z.preprocess(
    emptyStringToUndefined,
    z.string().trim().regex(phoneRegex, { message: "Invalid phone number" }).optional()
  ),
  referralCode: z.preprocess(
    emptyStringToUndefined,
    z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9]{6,16}$/, {
        message: "Referral code must be 6-16 alphanumeric characters",
      })
      .optional()
  ),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .max(128, { message: "Password is too long" })
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, {
      message: "Password must include upper, lower, and numeric characters",
    }),
});

const highlights = [
  {
    icon: Brain,
    title: "Multi-agent guidance",
    description: "Budgeting, debt, investing, and education agents work from the same financial context.",
  },
  {
    icon: ShieldCheck,
    title: "Local-first security",
    description: "JWT auth, org isolation, rate limits, and audit-aware workflows are already wired in.",
  },
  {
    icon: Gift,
    title: "Referral-ready onboarding",
    description: "Sign up with an optional referral code and keep the verification step inside the same flow.",
  },
];

export default function Register() {
  const { toast } = useToast();
  const [location, navigate] = useLocation();

  useEffect(() => {
    const next = sanitizeNextPath(getSearchParam(location, "next"));
    if (!next) return;
    try {
      sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, next);
    } catch {
      // ignore
    }
  }, [location]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
  });

  useEffect(() => {
    const ref = getSearchParam(location, "ref");
    if (!ref) return;
    setValue("referralCode", ref.trim().toUpperCase());
  }, [location, setValue]);

  const onSubmit = async (data: z.infer<typeof registerSchema>) => {
    try {
      const response = await apiClient<{ message?: string; dev_otp?: string }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(data),
      });

      if (response?.dev_otp) {
        sessionStorage.setItem("devOtpForVerification", response.dev_otp);
      }

      toast({
        title: "Registration successful",
        description: response?.dev_otp
          ? `Development OTP: ${response.dev_otp}`
          : "We sent a 6-digit verification code to your email.",
      });

      sessionStorage.setItem("emailForVerification", data.email);
      navigate("/verify-email");
    } catch (error: unknown) {
      const requestId = error instanceof ApiError ? error.requestId : undefined;
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast({
        title: "Registration failed",
        description: requestId ? `${message} (Request ID: ${requestId})` : message,
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 items-center gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <motion.section
          initial={{ opacity: 0, x: -32 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55 }}
          className="space-y-8"
        >
          <div className="space-y-5">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Build your AI finance workspace
            </div>

            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-primary text-primary-foreground shadow-[0_22px_50px_-28px_rgba(255,255,255,0.5)]">
                <Brain className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-4xl font-bold tracking-tight text-foreground">Personal Finance</h1>
                <p className="text-lg text-muted-foreground">From raw money data to an actionable plan.</p>
              </div>
            </div>

            <p className="max-w-2xl text-base leading-7 text-muted-foreground">
              Create your account, verify your email, and move straight into a workspace built for
              transactions, AI analysis, workflows, exports, and collaborative planning.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {highlights.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.08 }}
                className="rounded-[calc(var(--radius)-2px)] border border-border/70 bg-card/80 p-5 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.85)]"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-border/70 bg-background/75 text-primary">
                  <item.icon className="h-5 w-5" />
                </div>
                <h2 className="text-sm font-semibold text-foreground">{item.title}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
              </motion.div>
            ))}
          </div>

          <div className="rounded-[calc(var(--radius)+6px)] border border-border/70 bg-card/70 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              What happens next
            </p>
            <div className="mt-3 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                Create the account with your basic details and an optional referral code.
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                Verify your email with the one-time code shown in development or sent by email.
              </div>
              <div className="rounded-2xl border border-border/60 bg-background/60 p-4">
                Land in the dashboard and start using chat, workflows, receipts, and analytics.
              </div>
            </div>
          </div>
        </motion.section>

        <motion.section
          initial={{ opacity: 0, x: 32 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.55, delay: 0.08 }}
        >
          <Card className="mx-auto w-full max-w-md border-border/80 bg-card/92 shadow-[0_32px_80px_-48px_rgba(15,23,42,0.95)]">
            <CardHeader className="space-y-2 text-center">
              <CardTitle className="text-2xl">Create your account</CardTitle>
              <CardDescription>
                Start the local demo with real auth, verification, and AI-ready workspace setup.
              </CardDescription>
            </CardHeader>

            <CardContent>
              <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" placeholder="Ravi Prakash" autoComplete="name" {...register("name")} />
                  {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    autoComplete="email"
                    {...register("email")}
                  />
                  {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="phoneNumber">Phone number (optional)</Label>
                  <Input id="phoneNumber" autoComplete="tel" {...register("phoneNumber")} />
                  {errors.phoneNumber && <p className="text-xs text-destructive">{errors.phoneNumber.message}</p>}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="referralCode">Referral code (optional)</Label>
                  <Input id="referralCode" placeholder="8JQ2K7M9PA" {...register("referralCode")} />
                  {errors.referralCode && <p className="text-xs text-destructive">{errors.referralCode.message}</p>}
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
                  {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                </div>

                <Button type="submit" className="mt-2 w-full" disabled={isSubmitting}>
                  {isSubmitting ? "Creating account..." : "Create account"}
                </Button>
              </form>

              <div className="mt-4 rounded-2xl border border-border/70 bg-background/65 p-3 text-xs leading-5 text-muted-foreground">
                Verification is part of the product flow. In development, the one-time code is surfaced
                immediately so you can keep moving without leaving the app.
              </div>

              <div className="mt-5 text-center text-sm">
                Already have an account?{" "}
                <Link href="/login" className="font-medium text-primary underline">
                  Sign in
                </Link>
              </div>
            </CardContent>
          </Card>
        </motion.section>
      </div>
    </div>
  );
}
