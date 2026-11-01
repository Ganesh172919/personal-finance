/**
 * @fileoverview Billing and subscription management page.
 *
 * Lets users inspect their active plan tier, track monthly quota usage
 * (AI calls, scenario depth, OCR scans, exports), upgrade between
 * Free, Pro, and Team subscriptions, and open the Stripe Customer Portal
 * for invoice management.
 *
 * Key data flows:
 * - Reads plan, status, and usage meters from useAppConfig() entitlements.
 * - Calls createBillingCheckout({ plan_tier }) for upgrades; redirects
 *   to Stripe checkout or instantly activates in local stub billing mode.
 * - Calls getBillingPortal() to open the Stripe customer management portal.
 * - Refetches config after successful upgrades.
 *
 * Tenant-scoped: billing entitlements govern organization-level capabilities.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Progress } from "@/components/ui/Progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useToast } from "@/hooks/useToast";
import {
  createBillingCheckout,
  getBillingPortal,
  purchaseCreditPack,
  getBillingInvoices,
  downloadInvoicePdf,
  getDunningStatus,
  retryDunningPayment,
  simulateDunningFailure,
} from "@/lib/apiClient";
import type { BillingInvoice } from "@/lib/apiClient";
import {
  formatBillingCurrency,
  CURRENCY_LABELS,
  type SupportedCurrency,
  normalizeCurrency,
} from "@/lib/currencyFx";
import {
  Check,
  Zap,
  ShieldCheck,
  Sparkles,
  ExternalLink,
  AlertCircle,
  Building,
  CheckCircle2,
  AlertTriangle,
  Coins,
  PackagePlus,
  FileText,
  Download,
  Loader2,
  RefreshCw,
  CreditCard,
} from "lucide-react";

interface CreditPackOption {
  id: "ai_pack_250" | "ocr_pack_100" | "scenarios_pack_100" | "flex_bundle";
  name: string;
  price: number;
  tag: string;
  description: string;
  highlight: string;
  creditsSummary: string;
  badgeVariant?: "default" | "secondary" | "outline";
}

const CREDIT_PACKS: CreditPackOption[] = [
  {
    id: "ai_pack_250",
    name: "AI Power Pack",
    price: 5,
    tag: "Intelligence",
    description: "250 extra on-demand AI copilot and agent intelligence calls.",
    highlight: "+250 AI Calls",
    creditsSummary: "Instant quota extension for research and advice",
    badgeVariant: "secondary",
  },
  {
    id: "ocr_pack_100",
    name: "OCR Document Pack",
    price: 4,
    tag: "Receipts",
    description: "100 receipt and invoice scans with structured field extraction.",
    highlight: "+100 OCR Scans",
    creditsSummary: "Automated line-item & merchant extraction",
    badgeVariant: "secondary",
  },
  {
    id: "scenarios_pack_100",
    name: "Simulation Pack",
    price: 3,
    tag: "Stress-Testing",
    description: "100 What-If scenario runs with Monte Carlo stochastic bounds.",
    highlight: "+100 Simulations",
    creditsSummary: "Deep retirement & shock scenario analysis",
    badgeVariant: "secondary",
  },
  {
    id: "flex_bundle",
    name: "All-in-One Flex Bundle",
    price: 10,
    tag: "Best Value",
    description: "Comprehensive multi-feature booster for power planners.",
    highlight: "+500 AI • +200 OCR • +200 Scenarios",
    creditsSummary: "Save 40% vs purchasing individual packs",
    badgeVariant: "default",
  },
];

export default function Billing() {
  const queryClient = useQueryClient();
  const configQuery = useAppConfig();
  const { toast } = useToast();

  const [busy, setBusy] = useState<null | "pro" | "team" | "portal">(null);
  const [selectedPack, setSelectedPack] = useState<CreditPackOption | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("monthly");
  const [downloadingInvoiceId, setDownloadingInvoiceId] = useState<string | null>(null);

  const entitlements = configQuery.data?.entitlements;
  const currentPlan = (entitlements?.plan || "free").toLowerCase();
  const planStatus = entitlements?.status || "active";

  const orgCurrency = normalizeCurrency(configQuery.data?.org?.currency);
  const [selectedCurrency, setSelectedCurrency] = useState<SupportedCurrency>(orgCurrency);

  const dunningQuery = useQuery({
    queryKey: ["/api/billing/dunning"],
    queryFn: getDunningStatus,
    staleTime: 30 * 1000,
  });

  const dunningState = dunningQuery.data?.dunning;
  const isDunningActive = Boolean(dunningState?.in_dunning || planStatus === "past_due");

  const retryPaymentMutation = useMutation({
    mutationFn: retryDunningPayment,
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/config/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/dunning"] });
      await configQuery.refetch();
      await dunningQuery.refetch();
      toast({
        title: "Subscription Restored",
        description: data.message || "Your payment was processed and your plan is active.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Retry Failed",
        description: err?.message || "Payment retry failed. Please update your card in the portal.",
        variant: "destructive",
      });
    },
  });

  const simulateFailureMutation = useMutation({
    mutationFn: (reason?: string) => simulateDunningFailure(reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/config/me"] });
      await queryClient.invalidateQueries({ queryKey: ["/api/billing/dunning"] });
      await configQuery.refetch();
      await dunningQuery.refetch();
      toast({
        title: "Payment Failure Simulated",
        description: "Subscription transitioned to past_due under 7-day grace period.",
      });
    },
  });

  const invoicesQuery = useQuery({
    queryKey: ["/api/billing/invoices", selectedCurrency],
    queryFn: () => getBillingInvoices(selectedCurrency),
    staleTime: 60 * 1000,
  });

  const handleDownloadInvoice = async (invoice: BillingInvoice) => {
    try {
      setDownloadingInvoiceId(invoice.id);
      await downloadInvoicePdf(invoice.id, invoice.invoice_number);
      toast({
        title: "Invoice Downloaded",
        description: `Receipt for ${invoice.invoice_number} saved.`,
      });
    } catch (err: any) {
      toast({
        title: "Download Failed",
        description: err?.message || "Failed to download invoice PDF.",
        variant: "destructive",
      });
    } finally {
      setDownloadingInvoiceId(null);
    }
  };

  const usageMeters = useMemo(() => {
    if (!entitlements) return null;
    const usage = entitlements.usage || {};
    const limits = entitlements.limits || entitlements.base_limits || {};

    const aiUsed = Number(usage.monthly_ai_calls) || 0;
    const aiLimit = Number(limits.monthly_ai_calls) || 60;
    const aiPct = Math.min(100, Math.round((aiUsed / Math.max(1, aiLimit)) * 100));

    const scenariosUsed = Number(usage.scenarios) || 0;
    const scenariosLimit = Number(limits.scenarios) || 30;
    const scenariosPct = Math.min(100, Math.round((scenariosUsed / Math.max(1, scenariosLimit)) * 100));

    const ocrUsed = Number(usage.ocr_receipts) || 0;
    const ocrLimit = Number(limits.ocr_receipts) || 20;
    const ocrPct = Math.min(100, Math.round((ocrUsed / Math.max(1, ocrLimit)) * 100));

    const exportAccess = Boolean(limits.export_access ?? (entitlements as any)?.features?.export ?? currentPlan !== "free");

    return {
      ai: { used: aiUsed, limit: aiLimit, pct: aiPct },
      scenarios: { used: scenariosUsed, limit: scenariosLimit, pct: scenariosPct },
      ocr: { used: ocrUsed, limit: ocrLimit, pct: ocrPct },
      exportAccess,
    };
  }, [entitlements, currentPlan]);

  const quotaWarnings = useMemo(() => {
    if (!usageMeters) return [];
    const warnings: { label: string; pct: number; used: number; limit: number }[] = [];
    if (usageMeters.ai.pct >= 80) warnings.push({ label: "AI Intelligence Calls", ...usageMeters.ai });
    if (usageMeters.scenarios.pct >= 80) warnings.push({ label: "What-If Simulations", ...usageMeters.scenarios });
    if (usageMeters.ocr.pct >= 80) warnings.push({ label: "Receipt OCR Scans", ...usageMeters.ocr });
    return warnings;
  }, [usageMeters]);

  const creditsMutation = useMutation({
    mutationFn: async (packId: "ai_pack_250" | "ocr_pack_100" | "scenarios_pack_100" | "flex_bundle") => {
      setError(null);
      return purchaseCreditPack({ pack_id: packId });
    },
    onSuccess: async (resp) => {
      await queryClient.invalidateQueries({ queryKey: ["/api/config/me"] });
      await configQuery.refetch();
      toast({
        title: "Credit Pack Activated",
        description: `Successfully added ${resp.pack.name} to your organization balance.`,
      });
      setSelectedPack(null);
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to purchase credit booster.";
      setError(msg);
      toast({
        title: "Purchase Failed",
        description: msg,
        variant: "destructive",
      });
    },
  });

  const checkoutMutation = useMutation({
    mutationFn: async (tier: "pro" | "team") => {
      setBusy(tier);
      setError(null);
      return createBillingCheckout({ plan_tier: tier, billing_cycle: billingCycle });
    },
    onSuccess: async (resp, tier) => {
      if (resp.activated) {
        await queryClient.invalidateQueries({ queryKey: ["/api/config/me"] });
        await queryClient.invalidateQueries({ queryKey: ["/api/billing/invoices"] });
        await configQuery.refetch();
        toast({
          title: "Plan Upgraded Successfully",
          description: `Your organization is now active on the ${tier.toUpperCase()} tier (${billingCycle === "annual" ? "Annual" : "Monthly"}).`,
        });
        return;
      }
      if (resp.checkout_url) {
        window.location.assign(resp.checkout_url);
        return;
      }
      throw new Error("Checkout URL missing");
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to start checkout process.";
      setError(msg);
      toast({
        title: "Checkout Error",
        description: msg,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setBusy(null);
    },
  });

  const portalMutation = useMutation({
    mutationFn: async () => {
      setBusy("portal");
      setError(null);
      return getBillingPortal(window.location.origin + "/billing");
    },
    onSuccess: (resp) => {
      if (resp.portal_url) {
        window.location.assign(resp.portal_url);
        return;
      }
      throw new Error("Portal URL missing");
    },
    onError: (err: any) => {
      const msg = err?.message || "Failed to open billing portal.";
      setError(msg);
      toast({
        title: "Billing Portal Unavailable",
        description: msg,
        variant: "destructive",
      });
    },
    onSettled: () => {
      setBusy(null);
    },
  });

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto" data-testid="billing-page">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3 mb-1">
            <h1 className="text-3xl font-bold text-foreground">Subscription & Billing</h1>
            <Badge
              variant={currentPlan === "free" ? "secondary" : "default"}
              className="text-xs capitalize font-semibold"
              data-testid="badge-current-plan"
            >
              {currentPlan} Plan
            </Badge>
            <Badge variant="outline" className="text-xs border-emerald-500/40 text-emerald-600 dark:text-emerald-400 capitalize">
              {planStatus}
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm">
            Manage your organization tier, quota limits, and Stripe payment credentials.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
            <span>Currency:</span>
            <Select value={selectedCurrency} onValueChange={(v) => setSelectedCurrency(v as SupportedCurrency)}>
              <SelectTrigger className="w-[125px] h-8 text-xs font-semibold" data-testid="select-billing-currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CURRENCY_LABELS).map(([code, label]) => (
                  <SelectItem key={code} value={code} className="text-xs">
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            onClick={() => portalMutation.mutate()}
            disabled={busy !== null}
            className="text-xs h-8"
            data-testid="button-open-portal"
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            {busy === "portal" ? "Connecting…" : "Manage Invoices & Payment"}
          </Button>

          {currentPlan !== "free" && !isDunningActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => simulateFailureMutation.mutate("card_declined")}
              disabled={simulateFailureMutation.isPending}
              className="text-[11px] h-8 text-muted-foreground hover:text-amber-600"
              title="Simulate recurring payment failure to verify grace period notification"
              data-testid="btn-simulate-dunning-failure"
            >
              Simulate Failure
            </Button>
          )}
        </div>
      </div>

      {/* Dunning Grace Period Alert */}
      {isDunningActive && (
        <Alert
          className="border-amber-500/60 bg-amber-500/10 text-amber-900 dark:text-amber-200"
          data-testid="alert-dunning-grace-period"
        >
          <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTitle className="text-sm font-semibold m-0">
                  Subscription Payment Past Due — 7-Day Grace Period Active
                </AlertTitle>
                <Badge
                  variant="outline"
                  className="border-amber-500/50 text-amber-700 dark:text-amber-300 text-xs font-bold"
                  data-testid="badge-grace-period-days"
                >
                  {dunningState?.grace_period_days_remaining ?? 7} Days Left
                </Badge>
                <Badge
                  variant="secondary"
                  className="text-xs font-medium"
                  data-testid="badge-dunning-next-retry"
                >
                  Attempt {dunningState?.current_attempt ?? 1} of {dunningState?.max_attempts ?? 3}
                </Badge>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  className="h-8 text-xs bg-amber-600 hover:bg-amber-700 text-white font-medium"
                  onClick={() => retryPaymentMutation.mutate()}
                  disabled={retryPaymentMutation.isPending}
                  data-testid="btn-retry-payment-now"
                >
                  {retryPaymentMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                  ) : (
                    <RefreshCw className="w-3.5 h-3.5 mr-1" />
                  )}
                  Retry Payment Now
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs border-amber-500/50"
                  onClick={() => portalMutation.mutate()}
                  disabled={busy !== null}
                  data-testid="btn-dunning-portal"
                >
                  <CreditCard className="w-3.5 h-3.5 mr-1" />
                  Update Payment Method
                </Button>
              </div>
            </div>
            <AlertDescription className="text-xs leading-relaxed text-muted-foreground">
              Your latest subscription payment could not be completed ({dunningState?.last_failure_reason?.replace(/_/g, " ") || "card declined"}).
              Your plan features remain protected under our 7-day grace period. Automatic retry is scheduled for{" "}
              <strong>{dunningState?.next_retry_at ? new Date(dunningState.next_retry_at).toLocaleDateString() : "tomorrow"}</strong>.
            </AlertDescription>
          </div>
        </Alert>
      )}

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Billing Action Failed</AlertTitle>
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Proactive Quota Warning Alert */}
      {quotaWarnings.length > 0 && (
        <Alert
          variant={quotaWarnings.some((w) => w.pct >= 100) ? "destructive" : "default"}
          className={quotaWarnings.some((w) => w.pct >= 100) ? "" : "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200"}
          data-testid="alert-quota-warning"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle className="font-semibold text-sm">
            {quotaWarnings.some((w) => w.pct >= 100) ? "Monthly Quota Limit Reached" : "Approaching Monthly Quota Limit"}
          </AlertTitle>
          <AlertDescription className="text-xs space-y-1 mt-1">
            <div>
              You have reached or are approaching your monthly allocation for{" "}
              <span className="font-semibold">{quotaWarnings.map((w) => `${w.label} (${w.pct}%)`).join(", ")}</span>.
            </div>
            <div className="text-[11px] opacity-90">
              Need extra volume without switching your monthly subscription? Choose an instant on-demand Credit Pack below or upgrade your tier for sustained limits.
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Quota Usage Meters */}
      {usageMeters && (
        <Card className="p-6" data-testid="card-quota-meters">
          <h3 className="text-base font-semibold text-foreground mb-4 flex items-center">
            <Sparkles className="w-4 h-4 mr-2 text-primary" />
            Monthly Entitlement Usage
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* AI Calls */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">AI Intelligence Calls</span>
                <div className="flex items-center space-x-1.5">
                  {usageMeters.ai.pct >= 100 ? (
                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Exhausted</Badge>
                  ) : usageMeters.ai.pct >= 80 ? (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 border border-amber-500/40 text-amber-600 dark:text-amber-400">80%+ Used</Badge>
                  ) : null}
                  <span className="font-bold text-foreground" data-testid="meter-ai-calls">
                    {usageMeters.ai.used} / {usageMeters.ai.limit}
                  </span>
                </div>
              </div>
              <Progress value={usageMeters.ai.pct} className="h-2" />
              <div className="text-[11px] text-muted-foreground">{usageMeters.ai.pct}% consumed</div>
            </div>

            {/* Scenarios */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">What-If Simulations</span>
                <div className="flex items-center space-x-1.5">
                  {usageMeters.scenarios.pct >= 100 ? (
                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Exhausted</Badge>
                  ) : usageMeters.scenarios.pct >= 80 ? (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 border border-amber-500/40 text-amber-600 dark:text-amber-400">80%+ Used</Badge>
                  ) : null}
                  <span className="font-bold text-foreground" data-testid="meter-scenarios">
                    {usageMeters.scenarios.used} / {usageMeters.scenarios.limit}
                  </span>
                </div>
              </div>
              <Progress value={usageMeters.scenarios.pct} className="h-2" />
              <div className="text-[11px] text-muted-foreground">{usageMeters.scenarios.pct}% consumed</div>
            </div>

            {/* OCR Scans */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-muted-foreground">Receipt OCR Scans</span>
                <div className="flex items-center space-x-1.5">
                  {usageMeters.ocr.pct >= 100 ? (
                    <Badge variant="destructive" className="text-[9px] px-1.5 py-0">Exhausted</Badge>
                  ) : usageMeters.ocr.pct >= 80 ? (
                    <Badge variant="secondary" className="text-[9px] px-1.5 py-0 border border-amber-500/40 text-amber-600 dark:text-amber-400">80%+ Used</Badge>
                  ) : null}
                  <span className="font-bold text-foreground" data-testid="meter-ocr">
                    {usageMeters.ocr.used} / {usageMeters.ocr.limit}
                  </span>
                </div>
              </div>
              <Progress value={usageMeters.ocr.pct} className="h-2" />
              <div className="text-[11px] text-muted-foreground">{usageMeters.ocr.pct}% consumed</div>
            </div>
          </div>
        </Card>
      )}

      {/* Billing Cycle Selector */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 py-1" data-testid="toggle-billing-cycle">
        <div className="bg-muted p-1 rounded-xl inline-flex items-center space-x-1 border border-border/60">
          <Button
            type="button"
            size="sm"
            variant={billingCycle === "monthly" ? "default" : "ghost"}
            className="text-xs h-8 px-4 rounded-lg font-medium"
            onClick={() => setBillingCycle("monthly")}
            data-testid="btn-billing-monthly"
          >
            Monthly Billing
          </Button>
          <Button
            type="button"
            size="sm"
            variant={billingCycle === "annual" ? "default" : "ghost"}
            className="text-xs h-8 px-4 rounded-lg font-medium flex items-center gap-1.5"
            onClick={() => setBillingCycle("annual")}
            data-testid="btn-billing-annual"
          >
            <span>Annual Billing</span>
            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-[10px] px-1.5 py-0" data-testid="badge-annual-savings">
              Save 20%
            </Badge>
          </Button>
        </div>
      </div>

      {/* Plan Tier Comparison Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Free Tier */}
        <Card className={`flex flex-col justify-between ${currentPlan === "free" ? "border-primary/50 shadow-sm" : ""}`}>
          <div>
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-lg font-bold">Free</CardTitle>
                {currentPlan === "free" && (
                  <Badge variant="secondary" className="text-[10px]">
                    Current Plan
                  </Badge>
                )}
              </div>
              <div className="text-2xl font-extrabold text-foreground mb-1" data-testid="price-free">
                {selectedCurrency === "USD" ? "$0" : formatBillingCurrency(0, selectedCurrency)}{" "}
                <span className="text-xs font-normal text-muted-foreground">/ month</span>
              </div>
              <CardDescription className="text-xs">
                Essential personal financial tracking and basic vital signs.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center">
                  <Check className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                  <span>60 AI calls / month</span>
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                  <span>30 What-if simulations</span>
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                  <span>20 Receipt OCR scans</span>
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                  <span>Transaction ledger & categories</span>
                </li>
                <li className="flex items-center text-muted-foreground/60">
                  <span className="w-4 mr-2 text-center">—</span>
                  <span className="line-through">Data exports (CSV/PDF)</span>
                </li>
              </ul>
            </CardContent>
          </div>
          <CardFooter>
            <Button
              variant="outline"
              className="w-full text-xs"
              disabled={currentPlan === "free"}
              data-testid="button-plan-free"
            >
              {currentPlan === "free" ? "Current Plan" : "Downgrade to Free"}
            </Button>
          </CardFooter>
        </Card>

        {/* Pro Tier (Featured) */}
        <Card className={`flex flex-col justify-between relative border-2 ${currentPlan === "pro" ? "border-primary" : "border-primary/60"} shadow-md`}>
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="bg-primary text-primary-foreground text-[10px] px-2.5 py-0.5 font-semibold uppercase tracking-wider">
              Most Popular
            </Badge>
          </div>
          <div>
            <CardHeader className="pt-6">
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-lg font-bold flex items-center">
                  <Zap className="w-4 h-4 mr-1.5 text-primary" />
                  Pro
                </CardTitle>
                {currentPlan === "pro" && (
                  <Badge variant="default" className="text-[10px]">
                    Current Plan
                  </Badge>
                )}
              </div>
              <div className="text-2xl font-extrabold text-foreground mb-1" data-testid="price-pro">
                {billingCycle === "annual" ? (
                  <>
                    {selectedCurrency === "USD" ? "$15" : formatBillingCurrency(15, selectedCurrency)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">/ month</span>
                    <span className="block text-xs font-normal text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {selectedCurrency === "USD" ? "$180" : formatBillingCurrency(180, selectedCurrency)} billed annually (Save {selectedCurrency === "USD" ? "$48/yr" : `${formatBillingCurrency(48, selectedCurrency)}/yr`})
                    </span>
                  </>
                ) : (
                  <>
                    {selectedCurrency === "USD" ? "$19" : formatBillingCurrency(19, selectedCurrency)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">/ month</span>
                  </>
                )}
              </div>
              <CardDescription className="text-xs">
                Complete AI financial copilot and reporting intelligence for individuals.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center font-medium text-foreground">
                  <CheckCircle2 className="w-4 h-4 mr-2 text-primary flex-shrink-0" />
                  <span>600 AI calls / month (10x Free)</span>
                </li>
                <li className="flex items-center font-medium text-foreground">
                  <CheckCircle2 className="w-4 h-4 mr-2 text-primary flex-shrink-0" />
                  <span>300 What-if simulations</span>
                </li>
                <li className="flex items-center font-medium text-foreground">
                  <CheckCircle2 className="w-4 h-4 mr-2 text-primary flex-shrink-0" />
                  <span>200 Receipt OCR scans</span>
                </li>
                <li className="flex items-center font-medium text-foreground">
                  <CheckCircle2 className="w-4 h-4 mr-2 text-primary flex-shrink-0" />
                  <span>Full CSV & PDF data exports</span>
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                  <span>Multi-agent Financial Copilot</span>
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                  <span>Priority AI inference failover</span>
                </li>
              </ul>
            </CardContent>
          </div>
          <CardFooter>
            <Button
              className="w-full text-xs"
              variant={currentPlan === "pro" ? "outline" : "default"}
              disabled={currentPlan === "pro" || busy !== null}
              onClick={() => checkoutMutation.mutate("pro")}
              data-testid="button-upgrade-pro"
            >
              {busy === "pro" ? "Upgrading…" : currentPlan === "pro" ? "Current Plan" : "Upgrade to Pro"}
            </Button>
          </CardFooter>
        </Card>

        {/* Team Tier */}
        <Card className={`flex flex-col justify-between ${currentPlan === "team" ? "border-primary/50 shadow-sm" : ""}`}>
          <div>
            <CardHeader>
              <div className="flex items-center justify-between mb-2">
                <CardTitle className="text-lg font-bold flex items-center">
                  <Building className="w-4 h-4 mr-1.5 text-primary" />
                  Team
                </CardTitle>
                {currentPlan === "team" && (
                  <Badge variant="default" className="text-[10px]">
                    Current Plan
                  </Badge>
                )}
              </div>
              <div className="text-2xl font-extrabold text-foreground mb-1" data-testid="price-team">
                {billingCycle === "annual" ? (
                  <>
                    {selectedCurrency === "USD" ? "$39" : formatBillingCurrency(39, selectedCurrency)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">/ month</span>
                    <span className="block text-xs font-normal text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {selectedCurrency === "USD" ? "$468" : formatBillingCurrency(468, selectedCurrency)} billed annually (Save {selectedCurrency === "USD" ? "$120/yr" : `${formatBillingCurrency(120, selectedCurrency)}/yr`})
                    </span>
                  </>
                ) : (
                  <>
                    {selectedCurrency === "USD" ? "$49" : formatBillingCurrency(49, selectedCurrency)}{" "}
                    <span className="text-xs font-normal text-muted-foreground">/ month</span>
                  </>
                )}
              </div>
              <CardDescription className="text-xs">
                Organization-wide collaborative financial control with multi-seat governance.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-xs text-muted-foreground">
                <li className="flex items-center font-medium text-foreground">
                  <CheckCircle2 className="w-4 h-4 mr-2 text-primary flex-shrink-0" />
                  <span>3,000 AI calls / month (50x Free)</span>
                </li>
                <li className="flex items-center font-medium text-foreground">
                  <CheckCircle2 className="w-4 h-4 mr-2 text-primary flex-shrink-0" />
                  <span>1,500 What-if simulations</span>
                </li>
                <li className="flex items-center font-medium text-foreground">
                  <CheckCircle2 className="w-4 h-4 mr-2 text-primary flex-shrink-0" />
                  <span>1,000 Receipt OCR scans</span>
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                  <span>Up to 10 organization seats</span>
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                  <span>Cron workflow automations</span>
                </li>
                <li className="flex items-center">
                  <Check className="w-4 h-4 mr-2 text-emerald-500 flex-shrink-0" />
                  <span>Workspace knowledge chunk indexing</span>
                </li>
              </ul>
            </CardContent>
          </div>
          <CardFooter>
            <Button
              className="w-full text-xs"
              variant={currentPlan === "team" ? "outline" : "secondary"}
              disabled={currentPlan === "team" || busy !== null}
              onClick={() => checkoutMutation.mutate("team")}
              data-testid="button-upgrade-team"
            >
              {busy === "team" ? "Upgrading…" : currentPlan === "team" ? "Current Plan" : "Upgrade to Team"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      {/* On-Demand Credit Packs */}
      <Card className="p-6 space-y-6" data-testid="card-credit-packs">
        <div>
          <div className="flex items-center space-x-2 mb-1">
            <Coins className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold text-foreground">On-Demand Credit Packs</h2>
            <Badge variant="outline" className="text-xs border-primary/40 text-primary">
              Non-Expiring Boosters
            </Badge>
          </div>
          <p className="text-muted-foreground text-xs">
            Instantly extend your organization capacity without altering your recurring subscription plan. Credits stack directly on top of your plan allowance and remain active until fully utilized.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CREDIT_PACKS.map((pack) => (
            <div
              key={pack.id}
              className={`rounded-xl border p-4 flex flex-col justify-between transition-all hover:border-primary/60 hover:shadow-sm ${
                pack.id === "flex_bundle" ? "border-primary/60 bg-primary/5" : "border-border/60 bg-card"
              }`}
              data-testid={`pack-card-${pack.id}`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Badge variant={pack.badgeVariant || "secondary"} className="text-[10px]">
                    {pack.tag}
                  </Badge>
                  <span className="text-lg font-bold text-foreground" data-testid={`pack-price-${pack.id}`}>
                    {selectedCurrency === "USD" ? `$${pack.price}` : formatBillingCurrency(pack.price, selectedCurrency)}
                  </span>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">{pack.name}</h4>
                  <div className="text-xs font-semibold text-primary mt-0.5">{pack.highlight}</div>
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{pack.description}</p>
                <div className="text-[10px] text-muted-foreground/80 flex items-center pt-1 border-t border-border/40">
                  <Check className="w-3 h-3 mr-1 text-emerald-500 flex-shrink-0" />
                  <span>{pack.creditsSummary}</span>
                </div>
              </div>

              <div className="pt-4 mt-2">
                <Button
                  variant={pack.id === "flex_bundle" ? "default" : "outline"}
                  className="w-full text-xs h-8"
                  onClick={() => setSelectedPack(pack)}
                  disabled={creditsMutation.isPending}
                  data-testid={`button-buy-${pack.id}`}
                >
                  <PackagePlus className="w-3.5 h-3.5 mr-1.5" />
                  Buy Pack ({selectedCurrency === "USD" ? `$${pack.price}` : formatBillingCurrency(pack.price, selectedCurrency)})
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Credit Pack Confirmation Dialog */}
      <Dialog open={selectedPack !== null} onOpenChange={(open) => !open && setSelectedPack(null)}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-credit-pack-confirm">
          <DialogHeader>
            <div className="flex items-center space-x-2">
              <Coins className="w-5 h-5 text-primary" />
              <DialogTitle className="text-lg font-bold">
                Confirm {selectedPack?.name} Purchase
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Review your on-demand quota booster details before activation.
            </DialogDescription>
          </DialogHeader>

          {selectedPack && (
            <div className="space-y-4 py-2">
              <div className="rounded-lg border border-border/60 bg-muted/40 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Selected Booster</span>
                  <span className="text-sm font-semibold text-foreground">{selectedPack.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Credit Addition</span>
                  <span className="text-xs font-bold text-primary">{selectedPack.highlight}</span>
                </div>
                <div className="flex items-center justify-between border-t border-border/40 pt-2">
                  <span className="text-xs font-semibold text-foreground">One-Time Amount</span>
                  <span className="text-base font-extrabold text-foreground" data-testid="credit-pack-confirm-price">
                    {formatBillingCurrency(selectedPack.price, selectedCurrency)} {selectedCurrency}
                  </span>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Credits will be added immediately to your current organization ({selectedCurrency} billing profile). Unused credits roll over automatically across monthly billing cycles.
              </p>
            </div>
          )}

          <DialogFooter className="flex space-x-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setSelectedPack(null)}
              disabled={creditsMutation.isPending}
              data-testid="button-cancel-credit-pack"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => selectedPack && creditsMutation.mutate(selectedPack.id)}
              disabled={creditsMutation.isPending || !selectedPack}
              data-testid="button-confirm-credit-purchase"
            >
              {creditsMutation.isPending ? "Activating Booster…" : "Confirm & Apply Booster"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invoices & Tax Receipts */}
      <Card className="p-6 space-y-4" data-testid="card-billing-invoices">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center space-x-2">
              <FileText className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-bold text-foreground">Invoices & Receipts</h2>
              <Badge variant="outline" className="text-xs border-primary/40 text-primary">
                PDF Tax Receipts
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs mt-1">
              Download itemized, branded PDF invoices and tax receipts for your organization records.
            </p>
          </div>
        </div>

        {invoicesQuery.isLoading ? (
          <div className="flex items-center justify-center p-8 text-sm text-muted-foreground" data-testid="invoices-loading">
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
            Loading invoices…
          </div>
        ) : !invoicesQuery.data?.invoices || invoicesQuery.data.invoices.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 p-8 text-center text-xs text-muted-foreground" data-testid="invoices-empty">
            No invoices generated yet. Receipts will appear here automatically upon plan upgrades and renewals.
          </div>
        ) : (
          <div className="rounded-lg border border-border/60 overflow-hidden" data-testid="table-billing-invoices">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs font-semibold">Invoice #</TableHead>
                  <TableHead className="text-xs font-semibold">Date</TableHead>
                  <TableHead className="text-xs font-semibold">Plan & Cycle</TableHead>
                  <TableHead className="text-xs font-semibold">Coverage Period</TableHead>
                  <TableHead className="text-xs font-semibold">Total (USD)</TableHead>
                  <TableHead className="text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold text-right">Receipt</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoicesQuery.data.invoices.map((inv) => (
                  <TableRow key={inv.id} data-testid={`row-invoice-${inv.id}`}>
                    <TableCell className="font-mono text-xs font-medium text-foreground">
                      {inv.invoice_number}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(inv.issued_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-xs font-medium capitalize">
                      {inv.plan_tier} ({inv.billing_cycle})
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(inv.period_start).toLocaleDateString()} – {new Date(inv.period_end).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-xs font-bold text-foreground" data-testid={`invoice-amount-${inv.id}`}>
                      {inv.formatted_total || (selectedCurrency === "USD" ? `$${inv.total_usd.toFixed(2)}` : formatBillingCurrency(inv.total_usd, selectedCurrency))}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className="text-[10px] border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 capitalize"
                        data-testid={`badge-invoice-status-${inv.id}`}
                      >
                        {inv.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2.5"
                        disabled={downloadingInvoiceId === inv.id}
                        onClick={() => handleDownloadInvoice(inv)}
                        data-testid={`btn-download-invoice-${inv.id}`}
                      >
                        {downloadingInvoiceId === inv.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5 mr-1" />
                            PDF
                          </>
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Developer Stub Notice */}
      <div className="rounded-xl border border-border/60 bg-accent/40 p-4 text-xs text-muted-foreground flex items-center space-x-3">
        <ShieldCheck className="w-5 h-5 text-primary flex-shrink-0" />
        <div>
          <span className="font-semibold text-foreground">Stripe & Local Billing Support: </span>
          In local development mode, plan changes apply instantly with zero friction. In production environments, checkout securely routes through Stripe Hosted Checkout with SSL encryption.
        </div>
      </div>
    </div>
  );
}
