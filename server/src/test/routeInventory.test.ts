import { Router } from "express";
import { describe, expect, it } from "vitest";

import { collectRouterRoutes, expressPathToOpenApi } from "../utils/routeInventory";

describe("API route inventory", () => {
  it("includes routes from the root-mounted domain routers", () => {
    const child = Router();
    child.get("/analytics/summary", (_req, res) => res.end());
    const parent = Router();
    parent.use("/", child);
    parent.post("/items/:id", (_req, res) => res.end());
    const routes = collectRouterRoutes(parent, "/api/");
    expect(routes.map((route) => expressPathToOpenApi(route.path))).toEqual([
      "/api/analytics/summary", "/api/items/{id}",
    ]);
    expect([...routes[0]!.methods]).toEqual(["get"]);
    expect([...routes[1]!.methods]).toEqual(["post"]);
  });

  it("joins root routes and ignores middleware", () => {
    const router = Router();
    router.use((_req, _res, next) => next());
    router.get("/", (_req, res) => res.end());
    expect(collectRouterRoutes(router, "/api/files")[0]?.path).toBe("/api/files");
  });
});
