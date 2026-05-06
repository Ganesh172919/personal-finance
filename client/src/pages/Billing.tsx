/**
 * @fileoverview Billing and subscription management page.
 *
 * Lets the user view their current plan, upgrade to Pro or Team tiers,
 * and open the Stripe billing portal for payment management. In local
 * stub billing mode, upgrades apply immediately without Stripe checkout.
 *
 * Key data flows:
 * - Reads plan and status from useAppConfig() entitlements.
 * - Calls createBillingCheckout({ plan_tier }) for upgrades; if the
 *   response contains a checkout_url the browser redirects to Stripe.
 * - Calls getBillingPortal() to open the Stripe customer portal.
 * - Refetches config after successful upgrades.
 *
 * Tied to the Stripe integration and the server-side billing module.
 */

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/Button";
import { useAppConfig } from "@/hooks/useAppConfig";
import { createBillingCheckout, getBillingPortal } from "@/lib/apiClient";

export default function Billing() {
  const configQuery = useAppConfig();
  const [busy, setBusy] = useState<null | "pro" | "team" | "portal">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const plan = configQuery.data?.entitlements?.plan || "free";
  const status = configQuery.data?.entitlements?.status || "active";

  const summary = useMemo(() => {
    if (configQuery.isLoading) return "Loading...";
    if (!configQuery.data) return "Unable to load your plan.";
    if (!configQuery.data.entitlements) return "Billing is disabled on this server.";
    return `Current plan: ${plan} (${status})`;
  }, [configQuery.data, configQuery.isLoading, plan, status]);

  const startCheckout = async (tier: "pro" | "team") => {
    setError(null);
    setNotice(null);
    setBusy(tier);
    try {
      const resp = await createBillingCheckout({ plan_tier: tier });
      if (resp.activated) {
        await configQuery.refetch();
        setNotice("Plan updated.");
        return;
      }
      if (resp.checkout_url) {
        window.location.assign(resp.checkout_url);
        return;
      }
      throw new Error("Checkout URL missing");
    } catch (e: any) {
      setError(e?.message || "Failed to start checkout");
    } finally {
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setError(null);
    setNotice(null);
    setBusy("portal");
    try {
      const resp = await getBillingPortal(window.location.origin + "/billing");
      if (resp.portal_url) {
        window.location.assign(resp.portal_url);
        return;
      }
      throw new Error("Portal URL missing");
    } catch (e: any) {
      setError(e?.message || "Failed to open billing portal");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <div className="text-xl font-semibold text-foreground">Billing</div>
        <div className="text-sm text-muted-foreground">{summary}</div>
      </div>

      {error ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground">{notice}</div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => startCheckout("pro")} disabled={busy !== null}>
          {busy === "pro" ? "Starting..." : "Upgrade to Pro"}
        </Button>
        <Button onClick={() => startCheckout("team")} disabled={busy !== null} variant="secondary">
          {busy === "team" ? "Starting..." : "Upgrade to Team"}
        </Button>
        <Button onClick={openPortal} disabled={busy !== null} variant="outline">
          {busy === "portal" ? "Opening..." : "Manage billing"}
        </Button>
      </div>

      <div className="text-xs text-muted-foreground">
        Note: In local stub billing mode, upgrades apply immediately without Stripe checkout.
      </div>
    </div>
  );
}
