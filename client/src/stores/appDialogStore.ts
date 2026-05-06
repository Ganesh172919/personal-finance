/**
 * @fileoverview Application Dialog State Store (Zustand)
 *
 * Manages global dialog state for feature-limit modals and plan/usage dialogs.
 * These dialogs are triggered by API responses (402 status codes) and need
 * to be accessible from anywhere in the component tree.
 *
 * WHY A STORE FOR DIALOGS?
 * Feature limit errors can occur from any API call (transactions, AI, exports).
 * Instead of handling 402 errors in every component, the API client triggers
 * this store, and a global dialog component reads from it.
 *
 * FLOW:
 * 1. API client receives 402 with FEATURE_LIMIT_REACHED code
 * 2. apiClient calls useAppDialogStore.getState().showFeatureLimit(error)
 * 3. Global FeatureLimitDialog reads featureLimit state and renders
 * 4. User closes dialog or navigates to upgrade page
 *
 * @module stores/appDialogStore
 */

import { create } from "zustand";

import type { ApiError } from "@/lib/apiError";

/** Valid feature limit error codes from the server */
type FeatureLimitCode = "FEATURE_LIMIT_REACHED" | "FEATURE_NOT_AVAILABLE";

/** State for the feature limit dialog */
export type FeatureLimitDialogState = {
  open: boolean;
  message: string;
  code: FeatureLimitCode;
  requestId?: string;
  details?: unknown;
};

/** App dialog store state and actions */
type AppDialogState = {
  featureLimit: FeatureLimitDialogState | null;
  planAndUsageOpen: boolean;
  showFeatureLimit: (error: ApiError) => void;
  closeFeatureLimit: () => void;
  openPlanAndUsage: () => void;
  closePlanAndUsage: () => void;
};

/**
 * Global dialog state store.
 * Opened programmatically from API error handlers (not from UI components).
 */
export const useAppDialogStore = create<AppDialogState>((set) => ({
  featureLimit: null,
  planAndUsageOpen: false,

  // Show feature limit dialog if the error code matches
  showFeatureLimit: (error) => {
    const code = error.code as FeatureLimitCode | undefined;
    // Guard: only handle feature-limit related errors
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

