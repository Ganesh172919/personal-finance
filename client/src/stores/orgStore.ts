import { create } from "zustand";
import { persist } from "zustand/middleware";

interface OrgStore {
  /** Currently active organization ID */
  activeOrgId: string | null;
  /** Set the active org (persisted to localStorage) */
  setActiveOrg: (orgId: string | null) => void;
}

/**
 * Persisted org context store.
 * Survives page refreshes so users don't need to re-select their org.
 */
export const useOrgStore = create<OrgStore>()(
  persist(
    (set) => ({
      activeOrgId: null,
      setActiveOrg: (orgId) => set({ activeOrgId: orgId }),
    }),
    { name: "finwise-org" },
  ),
);
