/**
 * generateOpenApiPaths.ts
 *
 * Generates `packages/contracts/openapi/v1/paths/index.yaml` by
 * mounting routers exactly like the app and collecting express route
 * definitions. This prevents manual drift between routes and the
 * OpenAPI contract artifact.
 *
 * Usage:
 *   npx tsx server/src/scripts/generateOpenApiPaths.ts
 */

import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getEnv } from "../config/env.js";

// Route files — same imports the test uses
import authRoutes from "../routes/authRoutes.js";
import configRoutes from "../routes/configRoutes.js";
import publicShareRoutes from "../routes/publicShareRoutes.js";
import v1Routes from "../routes/v1Routes.js";
import aiRoutes from "../routes/aiRoutes.js";
import chatRoutes from "../routes/chatRoutes.js";
import financialDataRoutes from "../routes/financialDataRoutes.js";
import receiptRoutes from "../routes/receiptRoutes.js";
import financialJournalRoutes from "../routes/financialJournalRoutes.js";
import fileRoutes from "../routes/fileRoutes.js";
import mediaRoutes from "../routes/mediaRoutes.js";
import monetizationRoutes from "../routes/monetizationRoutes.js";
import taskRoutes from "../routes/taskRoutes.js";

type HttpMethod = "get" | "post" | "put" | "patch" | "delete";

interface RouterMount {
  prefix: string;
  router: Router;
}

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

const expressPathToOpenApi = (expressPath: string) =>
  expressPath.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

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
      if (["get", "post", "put", "patch", "delete"].includes(method)) {
        methods.add(method);
      }
    }

    if (methods.size === 0) continue;
    routes.push({ path: joinPaths(mountPrefix, route.path), methods });
  }
  return routes;
};

// Build mounts matching the test's definition
const env = getEnv();
const mounts: RouterMount[] = [
  { prefix: "/api/v1/auth", router: authRoutes },
  { prefix: "/api/v1/config", router: configRoutes },
  { prefix: "/api/v1/public", router: publicShareRoutes },
  { prefix: "/api/v1", router: v1Routes },
  { prefix: "/api/v1", router: aiRoutes },
  { prefix: "/api/v1/chat", router: chatRoutes },
  { prefix: "/api/v1", router: financialDataRoutes },
  { prefix: "/api/v1/files", router: fileRoutes },
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

// Collect and deduplicate all routes
const allPaths = new Map<string, Set<HttpMethod>>();

for (const mount of mounts) {
  for (const route of collectRouterRoutes(mount.router, mount.prefix)) {
    const oasPath = expressPathToOpenApi(route.path);
    if (!allPaths.has(oasPath)) {
      allPaths.set(oasPath, new Set());
    }
    const methods = allPaths.get(oasPath)!;
    for (const m of route.methods) {
      methods.add(m);
    }
  }
}

// Sort paths for deterministic output
const sortedPaths = [...allPaths.entries()].sort(([a], [b]) => a.localeCompare(b));

// Build YAML
const lines: string[] = [
  "# Auto-generated OpenAPI v1 paths contract.",
  "# DO NOT EDIT MANUALLY — regenerate with:",
  "#   npx tsx server/src/scripts/generateOpenApiPaths.ts",
  "",
];

const methodOrder: HttpMethod[] = ["get", "post", "put", "patch", "delete"];

for (const [pathStr, methods] of sortedPaths) {
  lines.push(`${pathStr}:`);
  const sorted = methodOrder.filter((m) => methods.has(m));
  for (const method of sorted) {
    lines.push(`  ${method}:`);
  }
}

lines.push(""); // trailing newline

const yaml = lines.join("\n");

// Write to disk
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, "../../../packages/contracts/openapi/v1/paths/index.yaml");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, yaml, "utf-8");

console.log(`✅ Generated ${sortedPaths.length} path(s) → ${path.relative(process.cwd(), outputPath)}`);
