// Defines supported HTTP request methods for route introspection and inventory.
// Restricted to lowercased verbs matching Express routing function definitions.
export type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

// Represents the internal Express route layer structure including nested router stacks.
// Enables recursive route traversal across nested subrouters and middleware layers.
type RouteLayer = {
  route?: { path?: string; methods?: Record<string, boolean> };
  handle?: { stack?: RouteLayer[] };
};

// Converts Express-style parameter syntax (:param) to OpenAPI path template syntax ({param}).
// Uses a regular expression replacement to standardize path definitions for documentation.
export const expressPathToOpenApi = (path: string) => path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

// Recursively inspects Express router middleware stacks to compile an inventory of all active routes.
// Normalizes mount prefixes and extracts active HTTP methods for each discovered endpoint.
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
