/**
 * @fileoverview Network Connectivity Status Banner
 *
 * Provides real-time visual feedback when the client loses internet connectivity
 * or transitions back online. When network connectivity is restored, it
 * automatically invalidates stale queries via TanStack Query so the user's
 * financial dashboard and ledger are refreshed without requiring a page reload.
 *
 * @module components/OfflineBanner
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, WifiOff } from "lucide-react";

export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  const [showReconnected, setShowReconnected] = useState<boolean>(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setShowReconnected(true);
      // Invalidate queries to pull latest financial records upon reconnect
      void queryClient.invalidateQueries();

      const timer = setTimeout(() => {
        setShowReconnected(false);
      }, 3500);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowReconnected(false);
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [queryClient]);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          key="offline-alert"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          role="status"
          aria-live="polite"
          className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500/90 px-4 py-2 text-xs font-medium text-amber-950 backdrop-blur-sm dark:bg-amber-600/90 dark:text-white"
        >
          <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            You are currently offline. FinWise is serving cached data — changes will sync once connection is restored.
          </span>
        </motion.div>
      )}

      {isOnline && showReconnected && (
        <motion.div
          key="reconnected-alert"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.2 }}
          role="status"
          aria-live="polite"
          className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-emerald-600/90 px-4 py-2 text-xs font-medium text-white backdrop-blur-sm"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>Connection restored. Refreshed your latest financial data.</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
