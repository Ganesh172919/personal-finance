/**
 * @fileoverview FeatureLimitDialog — modal shown when a user hits a plan usage cap
 * or attempts to use a feature not included in their current subscription tier.
 *
 * WHAT IT DOES
 *  - Reads limit details from `useAppDialogStore` (global Zustand store) and renders
 *    either a "FEATURE_LIMIT_REACHED" view with used/remaining counts, or a
 *    "FEATURE_NOT_AVAILABLE" view explaining the plan gap.
 *  - Provides a quick-link button to open the full PlanAndUsageDialog for more detail.
 *
 * KEY PROPS & DATA FLOW
 *  - No explicit props — all data comes from the `featureLimit` slice of `appDialogStore`.
 *  - Uses `useAppConfig` to resolve locale-aware number formatting.
 *  - `closeFeatureLimit()` and `openPlanAndUsage()` are Zustand actions wired to footer buttons.
 *
 * ARCHITECTURE NOTES
 *  - Companion to `PlanAndUsageDialog`; this one is a lightweight nudge, the other is the
 *    full entitlements table.
 *  - Controlled entirely through the global dialog store — any service layer code (API
 *    error handlers, middleware) can trigger it by calling `openFeatureLimit()` on the store.
 */
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { useMemo } from "react";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useAppDialogStore } from "@/stores/appDialogStore";

const formatFeature = (feature: unknown) => {
  if (!feature) return "This feature";
  return String(feature).replace(/_/g, " ");
};

export function FeatureLimitDialog() {
  const featureLimit = useAppDialogStore((s) => s.featureLimit);
  const closeFeatureLimit = useAppDialogStore((s) => s.closeFeatureLimit);
  const openPlanAndUsage = useAppDialogStore((s) => s.openPlanAndUsage);

  const open = Boolean(featureLimit?.open);
  const configQuery = useAppConfig({ enabled: open });
  const locale = configQuery.data?.org?.locale || "en-US";
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const formatNumber = (value: unknown) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return "—";
    return numberFormatter.format(num);
  };

  const details = (featureLimit?.details || {}) as any;

  const feature = details.feature;
  const limit = details.limit;
  const used = details.used;
  const requested = details.requested_units;
  const remaining =
    typeof limit === "number" && typeof used === "number" ? Math.max(0, Number(limit) - Number(used)) : null;

  const plan = details.plan;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeFeatureLimit();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Plan & usage limit</DialogTitle>
          <DialogDescription>{featureLimit?.message || "This action isn't available right now."}</DialogDescription>
        </DialogHeader>

        {featureLimit?.code === "FEATURE_LIMIT_REACHED" ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div className="font-medium text-foreground">{formatFeature(feature)}</div>
            <div className="mt-1 text-muted-foreground">
              Limit: {formatNumber(limit)} • Used: {formatNumber(used)} • Remaining:{" "}
              {remaining === null ? "—" : formatNumber(remaining)}
            </div>
            {requested ? (
              <div className="mt-1 text-muted-foreground">Requested: {formatNumber(requested)}</div>
            ) : null}
          </div>
        ) : null}

        {featureLimit?.code === "FEATURE_NOT_AVAILABLE" ? (
          <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
            <div className="font-medium text-foreground">{formatFeature(feature)}</div>
            <div className="mt-1 text-muted-foreground">
              Not available on your current plan{plan ? ` (${String(plan)})` : ""}.
            </div>
          </div>
        ) : null}

        {featureLimit?.requestId ? (
          <div className="text-xs text-muted-foreground">Request ID: {featureLimit.requestId}</div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={closeFeatureLimit}>
            Close
          </Button>
          <Button
            onClick={() => {
              closeFeatureLimit();
              openPlanAndUsage();
            }}
          >
            View plan & usage
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
