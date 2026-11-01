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

process.env.NODE_ENV = process.env.NODE_ENV || "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-jwt-secret";
process.env.CSRF_ENABLED = process.env.CSRF_ENABLED || "true";
process.env.MONETIZATION_ENABLED = process.env.MONETIZATION_ENABLED || "true";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getEnv } from "../config/env.js";

import { getApiRoutes } from "../routes/routeRegistry.js";
import { collectRouterRoutes, expressPathToOpenApi, type HttpMethod } from "../utils/routeInventory.js";

const mounts = getApiRoutes({ ...getEnv(), MONETIZATION_ENABLED: true, TASKS_ENABLED: true })
  .map(({ path, router }) => ({ prefix: path, router }));

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
