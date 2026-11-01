import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { createQueryClient } from "@/lib/queryClient";
import { getActiveOrgId, subscribeActiveOrgId } from "@/lib/orgContext";
import { useChatStore } from "@/stores/chatStore";
import { useCommandBarStore } from "@/stores/commandBarStore";
import { useAIStore } from "@/stores/aiStore";
import { useAppDialogStore } from "@/stores/appDialogStore";
import { retireRequestContext } from "@/lib/requestContext";

function PrivateQueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  useEffect(() => () => {
    void client.cancelQueries();
    client.clear();
  }, [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** Retire private caches and component drafts whenever the data owner changes. */
export function ScopedDataProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const orgId = useSyncExternalStore(subscribeActiveOrgId, getActiveOrgId, () => null);
  const scope = user ? JSON.stringify([user.id, orgId]) : null;
  const chatScope = useChatStore(state => state.dataScope);

  useLayoutEffect(() => {
    // Preserve a persisted selection while the first authentication check runs.
    if (loading || useChatStore.getState().dataScope === scope) return;
    retireRequestContext();
    useChatStore.getState().bindDataScope(scope);
    useCommandBarStore.setState({ isOpen: false, history: [] });
    useAIStore.getState().reset();
    useAppDialogStore.setState({ featureLimit: null, planAndUsageOpen: false });
  }, [scope, loading]);

  return (
    <PrivateQueryProvider key={scope || "signed-out"}>
      {!loading && chatScope !== scope
        ? <div role="status" className="p-6 text-sm text-muted-foreground">Loading your workspace...</div>
        : children}
    </PrivateQueryProvider>
  );
}
