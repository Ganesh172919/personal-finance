/**
 * @fileoverview Route Guard Components
 *
 * This module provides route guard components that control access to routes
 * based on the user's authentication state. They implement the "Guard Pattern"
 * for client-side routing.
 *
 * GUARD TYPES:
 * 1. ProtectedRoute: Requires authentication. Redirects to /login if not authenticated.
 * 2. PublicOnlyRoute: Only for unauthenticated users. Redirects to /dashboard if authenticated.
 *
 * LOADING STATE:
 * While the authentication state is being determined (initial page load), both
 * guards show a loading indicator. This prevents flash redirects (e.g., briefly
 * showing login page before redirecting to dashboard).
 *
 * HOW THEY WORK:
 * These are wrapper components that conditionally render their children:
 * - If loading: show spinner
 * - If condition met: render children
 * - If condition not met: redirect
 *
 * @example
 * <ProtectedRoute>
 *   <Dashboard />  {/* Only rendered if user is authenticated */}
 * </ProtectedRoute>
 *
 * @module routes/routeGuards
 */

import type { ReactNode } from "react";
import { Redirect } from "wouter";                              // wouter's redirect component

import { FullScreenLoader } from "@/components/feedback/FullScreenLoader"; // Loading indicator
import { useAuth } from "@/context/AuthContext";                  // Authentication context

/**
 * Route guard that requires authentication.
 *
 * If the user is not authenticated, they are redirected to /login.
 * While authentication state is loading, a spinner is shown.
 *
 * @param children - The content to render if authenticated
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  // Show loading while checking authentication state
  if (loading) {
    return <FullScreenLoader label="Restoring your workspace..." />;
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Redirect to="/login" />;
  }

  // User is authenticated — render the protected content
  return <>{children}</>;
}

/**
 * Route guard that only allows unauthenticated users.
 *
 * If the user IS authenticated, they are redirected to /dashboard.
 * This is used for login/register pages — authenticated users shouldn't
 * see these pages.
 *
 * @param children - The content to render if NOT authenticated
 */
export function PublicOnlyRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  // Show loading while checking authentication state
  if (loading) {
    return <FullScreenLoader label="Checking your session..." />;
  }

  // Redirect to dashboard if already authenticated
  if (user) {
    return <Redirect to="/dashboard" />;
  }

  // User is NOT authenticated — render the public-only content
  return <>{children}</>;
}

/**
 * ══════════════════════════════════════════════════════════════════════
 * END-OF-FILE SUMMARY
 * ══════════════════════════════════════════════════════════════════════
 *
 * KEY TAKEAWAYS:
 * ─────────────
 * 1. **Guard Pattern**: Route guards wrap protected content and conditionally
 *    render or redirect. This is a clean, composable approach to access control.
 *
 * 2. **Loading State**: Showing a spinner during auth check prevents:
 *    - Flash of login page for authenticated users
 *    - Flash of protected content for unauthenticated users
 *
 * 3. **useAuth() Hook**: Both guards use the same auth hook, ensuring
 *    consistent authentication state across the application.
 *
 * 4. **Composition**: Guards are composable — a route can have multiple guards
 *    (though in practice, each route uses one).
 *
 * HOW THIS FITS INTO THE SYSTEM:
 * ─────────────────────────────
 * routeGuards.tsx → used by AppRouter.tsx to wrap route components
 * routeGuards.tsx → uses useAuth() from AuthContext
 * routeGuards.tsx → uses wouter's Redirect for navigation
 * ══════════════════════════════════════════════════════════════════════
 */
