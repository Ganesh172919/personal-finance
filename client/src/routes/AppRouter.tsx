/**
 * @fileoverview Application Router
 *
 * This component defines the routing structure for the entire FinWise application.
 * It uses wouter (a lightweight React router) to map URL paths to page components.
 *
 * ROUTING ARCHITECTURE:
 * 1. Redirect routes — legacy URLs that redirect to new paths
 * 2. App routes — all application pages with access control and layouts
 * 3. Root route — redirects to dashboard (authenticated) or login (unauthenticated)
 * 4. Catch-all route — 404 Not Found page
 *
 * THREE LAYOUT MODES:
 * - "app": AppShell with sidebar navigation (most pages)
 * - "chat": ChatLayout for the AI chat interface
 * - "default": No layout wrapper (login, register, etc.)
 *
 * ACCESS CONTROL:
 * - "protected": Requires authentication (redirects to /login if not authenticated)
 * - "public-only": Only for unauthenticated users (redirects to /dashboard if authenticated)
 * - "public": Accessible to everyone (e.g., shared stories, invite acceptance)
 *
 * LAZY LOADING:
 * All page components are lazy-loaded via React.lazy() in routeDefinitions.tsx.
 * The <Suspense> wrapper shows a loading indicator while chunks are downloading.
 *
 * @module routes/AppRouter
 */

import { Suspense, type ReactNode } from "react";
import { Redirect, Route, Switch } from "wouter";               // Lightweight React router

import { FullScreenLoader } from "@/components/feedback/FullScreenLoader"; // Loading indicator
import { useAuth } from "@/context/AuthContext";                  // Authentication context
import { AppShell } from "@/layouts/AppShell";                    // Main app layout (sidebar)
import { ChatLayout } from "@/layouts/ChatLayout";               // Chat-specific layout
import NotFound from "@/pages/NotFound";                          // 404 page

import { appRoutes, redirectRoutes, type AppRouteDefinition } from "./routeDefinitions";
import { ProtectedRoute, PublicOnlyRoute } from "./routeGuards";

/**
 * Wraps a page component with the appropriate layout based on route definition.
 *
 * @param route - Route definition with layout preference
 * @param page - The page component to wrap
 * @returns Page wrapped with the appropriate layout
 */
function wrapWithLayout(route: AppRouteDefinition, page: ReactNode) {
  if (route.layout === "app") {
    return <AppShell>{page}</AppShell>;  // Sidebar + main content area
  }

  if (route.layout === "chat") {
    return <ChatLayout>{page}</ChatLayout>;  // Chat-specific layout
  }

  return page; // No layout wrapper (default)
}

/**
 * Renders a route with its access guard and layout.
 *
 * FLOW:
 * 1. Create the page component
 * 2. Wrap with access guard (ProtectedRoute or PublicOnlyRoute) if needed
 * 3. Wrap with layout (AppShell, ChatLayout, or none)
 *
 * @param route - Route definition
 * @returns Fully wrapped page component
 */
function renderRoute(route: AppRouteDefinition) {
  const Page = route.component;
  let page = <Page />;

  // Apply access control guards
  if (route.access === "protected") {
    page = <ProtectedRoute>{page}</ProtectedRoute>;  // Requires auth
  }

  if (route.access === "public-only") {
    page = <PublicOnlyRoute>{page}</PublicOnlyRoute>;  // Redirect if auth
  }

  return wrapWithLayout(route, page);
}

/**
 * Main application router component.
 *
 * Renders all routes with:
 * - Suspense for lazy loading (shows loading indicator)
 * - Redirect routes for legacy URLs
 * - App routes with access control and layouts
 * - Root route (redirects based on auth state)
 * - Catch-all 404 route
 */
export function AppRouter() {
  const { user } = useAuth();

  return (
    <Suspense
      fallback={
        <FullScreenLoader
          label="Loading your workspace..."
          description="Pulling in routes, layouts, and the next screen."
        />
      }
    >
      <Switch>
        {/* Legacy URL redirects (e.g., /app → /dashboard) */}
        {redirectRoutes.map((route) => (
          <Route key={route.path} path={route.path}>
            <Redirect to={route.redirectTo} />
          </Route>
        ))}

        {/* Application routes with access control and layouts */}
        {appRoutes.map((route) => (
          <Route key={route.path} path={route.path}>
            {() => renderRoute(route)}
          </Route>
        ))}

        {/* Root route: redirect based on authentication state */}
        <Route path="/">{user ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}</Route>

        {/* Catch-all: 404 Not Found */}
        <Route>
          {user ? (
            <AppShell>
              <NotFound />
            </AppShell>
          ) : (
            <NotFound />
          )}
        </Route>
      </Switch>
    </Suspense>
  );
}
