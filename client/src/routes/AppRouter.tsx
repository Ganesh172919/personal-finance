import { Suspense, type ReactNode } from "react";
import { Redirect, Route, Switch } from "wouter";

import { FullScreenLoader } from "@/components/feedback/FullScreenLoader";
import { useAuth } from "@/context/AuthContext";
import { AppShell } from "@/layouts/AppShell";
import { ChatLayout } from "@/layouts/ChatLayout";
import NotFound from "@/pages/NotFound";

import { appRoutes, redirectRoutes, type AppRouteDefinition } from "./routeDefinitions";
import { ProtectedRoute, PublicOnlyRoute } from "./routeGuards";

function wrapWithLayout(route: AppRouteDefinition, page: ReactNode) {
  if (route.layout === "app") {
    return <AppShell>{page}</AppShell>;
  }

  if (route.layout === "chat") {
    return <ChatLayout>{page}</ChatLayout>;
  }

  return page;
}

function renderRoute(route: AppRouteDefinition) {
  const Page = route.component;
  let page = <Page />;

  if (route.access === "protected") {
    page = <ProtectedRoute>{page}</ProtectedRoute>;
  }

  if (route.access === "public-only") {
    page = <PublicOnlyRoute>{page}</PublicOnlyRoute>;
  }

  return wrapWithLayout(route, page);
}

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
        {redirectRoutes.map((route) => (
          <Route key={route.path} path={route.path}>
            <Redirect to={route.redirectTo} />
          </Route>
        ))}

        {appRoutes.map((route) => (
          <Route key={route.path} path={route.path}>
            {() => renderRoute(route)}
          </Route>
        ))}

        <Route path="/">{user ? <Redirect to="/dashboard" /> : <Redirect to="/login" />}</Route>

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
