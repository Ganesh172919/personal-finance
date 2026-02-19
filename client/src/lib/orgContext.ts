const STORAGE_KEY = "finwise.active_org_id";

export const getActiveOrgId = (): string | null => {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value && value.trim().length > 0 ? value : null;
  } catch {
    return null;
  }
};

export const setActiveOrgId = (orgId: string | null) => {
  if (typeof window === "undefined") return;
  try {
    if (!orgId) {
      window.localStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(STORAGE_KEY, orgId);
  } catch {
    // ignore storage failures
  }
};

export const clearActiveOrgId = () => setActiveOrgId(null);

