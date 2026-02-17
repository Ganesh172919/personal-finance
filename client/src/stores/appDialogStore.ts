import { create } from "zustand";

import type { ApiError } from "@/lib/apiError";

type FeatureLimitCode = "FEATURE_LIMIT_REACHED" | "FEATURE_NOT_AVAILABLE";

export type FeatureLimitDialogState = {
  open: boolean;
  message: string;
  code: FeatureLimitCode;
  requestId?: string;
  details?: unknown;
};

type AppDialogState = {
  featureLimit: FeatureLimitDialogState | null;
  planAndUsageOpen: boolean;
  showFeatureLimit: (error: ApiError) => void;
  closeFeatureLimit: () => void;
  openPlanAndUsage: () => void;
  closePlanAndUsage: () => void;
};

export const useAppDialogStore = create<AppDialogState>((set) => ({
  featureLimit: null,
  planAndUsageOpen: false,
  showFeatureLimit: (error) => {
    const code = error.code as FeatureLimitCode | undefined;
    if (code !== "FEATURE_LIMIT_REACHED" && code !== "FEATURE_NOT_AVAILABLE") return;

    set({
      featureLimit: {
        open: true,
        message: error.message,
        code,
        requestId: error.requestId,
        details: error.details,
      },
    });
  },
  closeFeatureLimit: () => set({ featureLimit: null }),
  openPlanAndUsage: () => set({ planAndUsageOpen: true }),
  closePlanAndUsage: () => set({ planAndUsageOpen: false }),
}));

