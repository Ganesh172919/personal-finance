/**
 * @fileoverview Login page with email/password form and Google OAuth.
 *
 * Presents a split layout: left side shows feature highlights (multi-agent
 * guidance, local-first security, team-ready auth), right side contains
 * the login form with email/password fields and an optional Google
 * sign-in button (shown only when the provider is enabled).
 *
 * Key data flows:
 * - POST /api/auth/login authenticates with email and password.
 * - GET /api/auth/providers checks whether Google OAuth is available.
 * - checkAuthStatus() refreshes the auth context after successful login.
 * - Post-auth redirect: reads ?next= query param or a stored
 *   sessionStorage key (finwise.post_auth_redirect) to navigate the
 *   user to their intended destination, defaulting to /dashboard.
 *
 * Form validation uses react-hook-form with zod (email format, non-empty
 * password).  Already-authenticated users are redirected immediately
 * via a useEffect guard.
 *
 * Routed at /login; linked from NotFound, sidebar, and registration.
 */

import { motion } from "framer-motion";
import { Brain, Shield, TrendingUp, Users } from "lucide-react";
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
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useSearch, Link } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { ApiError, apiClient } from "@/lib/apiClient";
import { useToast } from "@/hooks/useToast";
import { getSearchParam, sanitizeNextPath } from "@/lib/url";
import { buildGoogleAuthUrl, getAuthErrorMessage } from "@/lib/googleAuth";

// Storage key for preserving post-authentication destination URLs.
// Enables seamless deep-link redirection after successful user login.
// Read and cleared upon authentication cycle completion.
const POST_AUTH_REDIRECT_KEY = "finwise.post_auth_redirect";

// Zod validation schema for credentials-based user authentication.
// Enforces proper email formatting and non-empty password entry.
// Powers client-side form validation before submitting login requests.
const loginSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address" }),
  password: z.string().min(1, { message: "Password cannot be empty" }),
});

// User authentication page supporting password and Google OAuth login.
// Handles multi-factor authentication (MFA) challenges and recovery codes.
// Manages post-login routing and session initialization workflows.
export default function Login() {
  const { user, loading, checkAuthStatus } = useAuth();
  const [, navigate] = useLocation();
  // wouter v3: useLocation() is pathname-only; the query string comes from useSearch().
  const search = useSearch();
  const { toast } = useToast();
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [needsMfa, setNeedsMfa] = useState(false);
  const [code, setCode] = useState("");
  const [oauthSubmitting, setOauthSubmitting] = useState(false);
  const [evaluatorSubmitting, setEvaluatorSubmitting] = useState(false);
  const oauthMfa = getSearchParam(`?${search}`, "mfa") === "required";

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
  });

  const nextFromQuery = useMemo(
    () => sanitizeNextPath(getSearchParam(`?${search}`, "next")),
    [search]
  );

  useEffect(() => {
    if (!user || loading) return;

    const stored = sanitizeNextPath(sessionStorage.getItem(POST_AUTH_REDIRECT_KEY));
    if (stored) {
      sessionStorage.removeItem(POST_AUTH_REDIRECT_KEY);
      navigate(stored);
      return;
    }

    if (nextFromQuery) {
      navigate(nextFromQuery);
      return;
    }

    navigate("/dashboard");
  }, [user, loading, navigate, nextFromQuery]);

  // Check available auth providers on mount (email is always available)
  useEffect(() => {
    (async () => {
      try {
        const providers = await apiClient<{ email: boolean; google: boolean }>("/auth/providers", { method: "GET" });
        setGoogleEnabled(Boolean(providers.google));
        if (import.meta.env.DEV) {
          console.log(`[Login] Auth providers: email=${providers.email}, google=${providers.google}`);
        }
      } catch (err) {
        setGoogleEnabled(false);
        if (import.meta.env.DEV) {
          console.warn("[Login] Failed to fetch auth providers:", err);
        }
      }
    })();
  }, []);

  // Failed OAuth round trips come back as /login?error=<code>.
  const oauthError = useMemo(
    () => getAuthErrorMessage(getSearchParam(`?${search}`, "error")),
    [search]
  );

  const handleGoogleSignIn = () => {
    const stored = sanitizeNextPath(sessionStorage.getItem(POST_AUTH_REDIRECT_KEY));
    window.location.href = buildGoogleAuthUrl({ next: nextFromQuery ?? stored });
  };

  const handleEvaluatorDemoLogin = async () => {
    setEvaluatorSubmitting(true);
    try {
      await apiClient<{ success: boolean; data: unknown }>("/auth/demo-evaluator", {
        method: "POST",
      });
      await checkAuthStatus();
      toast({
        title: "Evaluator Session Active",
        description: "Welcome J Ganesh Kumar Reddy! Navigating to Dashboard...",
      });
      navigate("/dashboard");
    } catch (error: unknown) {
      toast({
        title: "Demo Login Failed",
        description: error instanceof Error ? error.message : "Failed to sign in as evaluator.",
        variant: "destructive",
      });
    } finally {
      setEvaluatorSubmitting(false);
    }
  };

  const onSubmit = async (data: z.infer<typeof loginSchema>) => {
    try {
      const response = await apiClient<{ two_factor_required?: boolean }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ ...data, ...(needsMfa ? { twoFactorCode: code.trim() } : {}) }),
      });
      if (response.two_factor_required) {
        setNeedsMfa(true);
        return;
      }
      setCode("");
      await checkAuthStatus();
      toast({ title: "Login Successful", description: "Welcome back!" });
      // The navigate logic is now inside the useEffect, which is more reliable
    } catch (error: unknown) {
      const requestId = error instanceof ApiError ? error.requestId : undefined;
      const message = error instanceof Error ? error.message : "An unexpected error occurred.";
      toast({
        title: "Login Failed",
        description: requestId ? `${message} (Request ID: ${requestId})` : message,
        variant: "destructive",
      });
    }
  };

  const submitOAuthMfa = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setOauthSubmitting(true);
    try {
      const result = await apiClient<{ next: string }>("/auth/2fa/complete", {
        method: "POST",
        body: JSON.stringify({ code: code.trim() }),
      });
      const destination = sanitizeNextPath(result.next);
      if (destination) sessionStorage.setItem(POST_AUTH_REDIRECT_KEY, destination);
      setCode("");
      await checkAuthStatus();
    } catch (error: unknown) {
      toast({ title: "Verification failed", description: error instanceof Error ? error.message : "Try signing in again.", variant: "destructive" });
    } finally {
      setOauthSubmitting(false);
    }
  };

  const features = [
    { icon: Brain, title: "Finance assistant", description: "Ask questions about your saved finances." },
    { icon: TrendingUp, title: "Transactions and goals", description: "Track expenses, investments, and savings goals." },
    { icon: Shield, title: "Your workspace", description: "Keep your records in your signed-in account." },
    { icon: Users, title: "Planning tools", description: "Try budgets, reminders, and what-if scenarios." },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }}>
          <Brain className="w-8 h-8 text-primary" />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        <motion.div initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6 }} className="text-center lg:text-left">
          <div className="flex items-center justify-center lg:justify-start mb-8">
            <motion.div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mr-4" whileHover={{ scale: 1.1 }}>
              <Brain className="w-8 h-8 text-primary-foreground" />
            </motion.div>
            <div>
              <h1 className="text-4xl font-bold text-foreground">Personal Finance</h1>
              <p className="text-lg text-muted-foreground">Personal finance tracker</p>
            </div>
          </div>
          <p className="text-xl text-muted-foreground mb-8">
            A simple place to track your money and plan your next steps.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
            {features.map((feature, index) => (
              <motion.div key={feature.title} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.1 + 0.3 }} className="flex items-start space-x-3">
                <div className="w-10 h-10 bg-accent rounded-lg flex items-center justify-center flex-shrink-0">
                  <feature.icon className="w-5 h-5 text-accent-foreground" />
                </div>
                <div>
                  <h3 className="font-medium text-sm text-foreground">{feature.title}</h3>
                  <p className="text-xs text-muted-foreground">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.6, delay: 0.2 }}>
          <Card className="w-full max-w-md mx-auto">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Welcome to Personal Finance</CardTitle>
              <CardDescription>Sign in to access your personalized dashboard</CardDescription>
            </CardHeader>
            <CardContent>
              {oauthError ? (
                <div
                  role="alert"
                  className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {oauthError}
                </div>
              ) : null}
              {oauthMfa ? (
                <form onSubmit={submitOAuthMfa} className="grid gap-4">
                  <p className="text-sm text-muted-foreground">Complete Google sign-in with your authenticator code or a recovery code.</p>
                  <Label htmlFor="oauth-code">Authentication code</Label>
                  <Input id="oauth-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="one-time-code" required maxLength={9} />
                  <Button type="submit" disabled={oauthSubmitting}>{oauthSubmitting ? "Verifying..." : "Verify and sign in"}</Button>
                  <Button variant="outline" type="button" onClick={handleGoogleSignIn}>Start Google sign-in again</Button>
                </form>
              ) : <form onSubmit={handleSubmit(onSubmit)} className="grid gap-4">
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
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" autoComplete="current-password" {...register("password")} />
                  {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
                </div>
                {needsMfa && (
                  <div className="grid gap-2">
                    <p className="text-sm text-muted-foreground">Enter your authenticator code or a recovery code to finish signing in.</p>
                    <Label htmlFor="login-code">Authentication code</Label>
                    <Input id="login-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="one-time-code" required maxLength={9} />
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={isSubmitting}>{isSubmitting ? "Signing in..." : needsMfa ? "Verify and sign in" : "Login"}</Button>
                {googleEnabled ? (
                  <>
                    <div className="relative my-2">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                      <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">Or continue with</span></div>
                    </div>
                    <Button variant="outline" className="w-full" type="button" onClick={handleGoogleSignIn}>Continue with Google</Button>
                  </>
                ) : null}
              </form>}

              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-[10px] tracking-wider uppercase font-mono"><span className="bg-card px-2 text-muted-foreground font-semibold">Gnani AI Internship Evaluator Mode</span></div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full border-emerald-500/50 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium py-2.5 flex items-center justify-center gap-2 transition-all shadow-sm"
                disabled={evaluatorSubmitting}
                onClick={handleEvaluatorDemoLogin}
                id="btn-evaluator-demo-login"
              >
                <Shield className="w-4 h-4 text-emerald-500" />
                {evaluatorSubmitting ? "Launching Evaluator Session..." : "⚡ Evaluator Instant Access (1-Click)"}
              </Button>

              <div className="mt-4 text-center text-sm">
                Don&apos;t have an account? <Link href="/register" className="underline text-primary">Sign up</Link>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
