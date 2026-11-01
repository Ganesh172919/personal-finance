export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

type RouteLayer = {
  route?: { path?: string; methods?: Record<string, boolean> };
  handle?: { stack?: RouteLayer[] };
};

export const expressPathToOpenApi = (path: string) => path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

/** Collect routes, including the subrouters mounted at '/' in v1Routes. */
export const collectRouterRoutes = (router: { stack?: unknown[] }, mountPrefix: string) => {
  const routes: Array<{ path: string; methods: Set<HttpMethod> }> = [];
  const prefix = mountPrefix.replace(/\/$/, "");
  for (const rawLayer of router.stack || []) {
    const layer = rawLayer as RouteLayer;
    if (!layer.route && layer.handle?.stack) {
      routes.push(...collectRouterRoutes(layer.handle, prefix));
      continue;
    }
    const route = layer.route;
    if (typeof route?.path !== "string" || !route.methods) continue;
    const methods = new Set<HttpMethod>();
    for (const method of ["get", "post", "put", "patch", "delete"] as const) {
      if (route.methods[method]) methods.add(method);
    }
    if (!methods.size) continue;
    const suffix = route.path === "/" ? "" : route.path;
    routes.push({ path: `${prefix}${suffix.startsWith("/") || !suffix ? "" : "/"}${suffix}` || "/", methods });
  }
  return routes;
};
