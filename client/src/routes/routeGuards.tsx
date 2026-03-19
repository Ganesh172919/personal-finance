import type { ReactNode } from "react";
import { Redirect } from "wouter";

import { FullScreenLoader } from "@/components/feedback/FullScreenLoader";
import { useAuth } from "@/context/AuthContext";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullScreenLoader label="Restoring your workspace..." />;
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  return <>{children}</>;
}

export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <FullScreenLoader label="Checking your session..." />;
  }

  if (user) {
    return <Redirect to="/dashboard" />;
  }

  return <>{children}</>;
}
