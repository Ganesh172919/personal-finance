import { useMemo } from "react";

import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { useAuth } from "@/hooks/useAuth";
import { useAppConfig } from "@/hooks/useAppConfig";
import { useAppDialogStore } from "@/stores/appDialogStore";

const formatBoolean = (value: boolean) => (value ? "Yes" : "No");

const formatNumber = (value: unknown) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString("en-IN");
};

export function PlanAndUsageDialog() {
  const { user } = useAuth();
  const open = useAppDialogStore((s) => s.planAndUsageOpen);
  const close = useAppDialogStore((s) => s.closePlanAndUsage);

  const configQuery = useAppConfig({ enabled: open && !!user });
  const config = configQuery.data;

  const plan = config?.entitlements?.plan || "free";
  const status = config?.entitlements?.status;

  const rows = useMemo(() => {
    const entitlements = config?.entitlements;
    if (!entitlements) return [];
    return [
      ["Monthly AI calls", formatNumber(entitlements.usage.monthly_ai_calls), formatNumber(entitlements.limits.monthly_ai_calls), formatNumber(entitlements.remaining.monthly_ai_calls)],
      ["Scenario depth", formatNumber(entitlements.usage.scenario_depth), formatNumber(entitlements.limits.scenario_depth), formatNumber(entitlements.remaining.scenario_depth)],
      ["Receipt OCR quota", formatNumber(entitlements.usage.ocr_quota), formatNumber(entitlements.limits.ocr_quota), formatNumber(entitlements.remaining.ocr_quota)],
      ["Export access", formatNumber(entitlements.usage.export_access), formatBoolean(entitlements.limits.export_access), formatBoolean(entitlements.remaining.export_access)],
    ] as const;
  }, [config?.entitlements]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Plan & usage</DialogTitle>
          <DialogDescription>Limits and current usage for this billing period.</DialogDescription>
        </DialogHeader>

        {configQuery.isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : !config ? (
          <div className="text-sm text-muted-foreground">Unable to load config.</div>
        ) : !config.entitlements ? (
          <div className="text-sm text-muted-foreground">Monetization is disabled on this server.</div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <div className="font-medium text-foreground">
                Plan: {plan} {status ? <span className="text-muted-foreground">({status})</span> : null}
              </div>
              <div className="text-muted-foreground">Period: {config.entitlements.period_key}</div>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="min-w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="px-3 py-2 text-left">Feature</th>
                    <th className="px-3 py-2 text-left">Used</th>
                    <th className="px-3 py-2 text-left">Limit</th>
                    <th className="px-3 py-2 text-left">Remaining</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row[0]} className="border-t border-border">
                      <td className="px-3 py-2">{row[0]}</td>
                      <td className="px-3 py-2">{row[1]}</td>
                      <td className="px-3 py-2">{row[2]}</td>
                      <td className="px-3 py-2">{row[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

