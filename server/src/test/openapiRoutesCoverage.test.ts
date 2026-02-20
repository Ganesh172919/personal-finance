import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { getEnv } from "../config/env";
import aiRoutes from "../routes/aiRoutes";
import authRoutes from "../routes/authRoutes";
import chatRoutes from "../routes/chatRoutes";
import configRoutes from "../routes/configRoutes";
import financialDataRoutes from "../routes/financialDataRoutes";
import financialJournalRoutes from "../routes/financialJournalRoutes";
import marketplaceRoutes from "../routes/v1Routes";
import mediaRoutes from "../routes/mediaRoutes";
import monetizationRoutes from "../routes/monetizationRoutes";
import publicShareRoutes from "../routes/publicShareRoutes";
import receiptRoutes from "../routes/receiptRoutes";
import taskRoutes from "../routes/taskRoutes";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

type RouterMount = { prefix: string; router: any };

const normalizePrefix = (prefix: string) => {
  const trimmed = prefix.trim();
  if (trimmed === "") return "";
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
};

const joinPaths = (prefix: string, routePath: string) => {
  const base = normalizePrefix(prefix);
  const route = String(routePath || "");
  if (!route || route === "/") return base || "/";
  if (route.startsWith("/")) return `${base}${route}`;
  return `${base}/${route}`;
};

const expressPathToOpenApi = (expressPath: string) => expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

const collectRouterRoutes = (router: any, mountPrefix: string) => {
  const routes: Array<{ path: string; methods: Set<HttpMethod> }> = [];
  const stack = Array.isArray(router?.stack) ? router.stack : [];
  for (const layer of stack) {
    const route = layer?.route;
    if (!route?.path || !route?.methods) continue;
    if (typeof route.path !== "string") continue;

    const methods = new Set<HttpMethod>();
    for (const key of Object.keys(route.methods || {})) {
      const method = String(key || "").toLowerCase() as HttpMethod;
      if (method === "get" || method === "post" || method === "put" || method === "patch" || method === "delete") {
        methods.add(method);
      }
    }

    if (methods.size === 0) continue;
    routes.push({ path: joinPaths(mountPrefix, route.path), methods });
  }
  return routes;
};

const parseOpenApiPaths = (raw: string) => {
  const paths = new Map<string, Set<HttpMethod>>();
  const lines = raw.split(/\r?\n/);
  let currentPath: string | null = null;

  for (const line of lines) {
    const pathMatch = line.match(/^\/api\/v1\/[^:]+:\s*$/);
    if (pathMatch) {
      currentPath = line.slice(0, line.indexOf(":"));
      if (!paths.has(currentPath)) {
        paths.set(currentPath, new Set());
      }
      continue;
    }

    if (!currentPath) continue;

    const methodMatch = line.match(/^\s{2}(get|post|put|patch|delete):\s*$/);
    if (!methodMatch) continue;

    const method = methodMatch[1] as HttpMethod;
    paths.get(currentPath)!.add(method);
  }

  return paths;
};

describe("OpenAPI contract drift", () => {
  it("documents all mounted /api/v1 routes (path + method)", async () => {
    const env = getEnv();
    const mounts: RouterMount[] = [
      { prefix: "/api/v1/auth", router: authRoutes },
      { prefix: "/api/v1/config", router: configRoutes },
      { prefix: "/api/v1/public", router: publicShareRoutes },
      { prefix: "/api/v1", router: marketplaceRoutes },
      { prefix: "/api/v1", router: aiRoutes },
      { prefix: "/api/v1/chat", router: chatRoutes },
      { prefix: "/api/v1", router: financialDataRoutes },
      { prefix: "/api/v1", router: receiptRoutes },
      { prefix: "/api/v1", router: financialJournalRoutes },
      { prefix: "/api/v1", router: mediaRoutes },
    ];

    if (env.MONETIZATION_ENABLED) {
      mounts.push({ prefix: "/api/v1", router: monetizationRoutes });
    }

    if (env.TASKS_ENABLED) {
      mounts.push({ prefix: "/api/v1/tasks", router: taskRoutes });
    }

    const testDir = path.dirname(fileURLToPath(import.meta.url));
    const pathsFile = path.resolve(testDir, "../../../packages/contracts/openapi/v1/paths/index.yaml");
    const openapiRaw = await readFile(pathsFile, "utf-8");
    const openapiPaths = parseOpenApiPaths(openapiRaw);

    const missing: string[] = [];
    for (const mount of mounts) {
      for (const route of collectRouterRoutes(mount.router, mount.prefix)) {
        const oasPath = expressPathToOpenApi(route.path);
        const documentedMethods = openapiPaths.get(oasPath);
        if (!documentedMethods) {
          for (const method of route.methods) {
            missing.push(`${method.toUpperCase()} ${oasPath}`);
          }
          continue;
        }

        for (const method of route.methods) {
          if (!documentedMethods.has(method)) {
            missing.push(`${method.toUpperCase()} ${oasPath}`);
          }
        }
      }
    }

    missing.sort();
    expect(missing, `OpenAPI is missing ${missing.length} route(s):\n${missing.join("\n")}`).toEqual([]);
  });
});

