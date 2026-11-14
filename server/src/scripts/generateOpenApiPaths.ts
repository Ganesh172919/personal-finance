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

// Instantiates application API route table with all optional feature modules activated.
// Extracts route prefix URLs and corresponding Express router instances.
// Serves as input for automated route tree reflection and schema extraction.
const mounts = getApiRoutes({ ...getEnv(), MONETIZATION_ENABLED: true, TASKS_ENABLED: true })
  .map(({ path, router }) => ({ prefix: path, router }));

// Collect and deduplicate all routes
// Map accumulating unique OpenAPI path templates mapped to accepted HTTP methods.
// Aggregates route definitions across all mounted sub-routers and controller modules.
// Ensures complete path coverage without duplicate method registrations.
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
// Sorts accumulated OpenAPI paths alphabetically to generate deterministic file outputs.
// Prevents arbitrary filesystem ordering from producing noisy Git diff changes.
// Provides predictable contract layout for documentation generators.
const sortedPaths = [...allPaths.entries()].sort(([a], [b]) => a.localeCompare(b));

// Build YAML
// Buffer array storing generated YAML text lines for the OpenAPI paths manifest.
// Pre-pends auto-generation warning comments advising against direct manual edits.
// Assembled sequentially before writing the final specification file to disk.
const lines: string[] = [
  "# Auto-generated OpenAPI v1 paths contract.",
  "# DO NOT EDIT MANUALLY — regenerate with:",
  "#   npx tsx server/src/scripts/generateOpenApiPaths.ts",
  "",
];

// Defines canonical presentation order for HTTP verbs in OpenAPI specification documents.
// Orders methods logically starting with GET and progressing through POST, PUT, PATCH, and DELETE.
// Guarantees uniform verb sequences under each route path block.
const methodOrder: HttpMethod[] = ["get", "post", "put", "patch", "delete"];

for (const [pathStr, methods] of sortedPaths) {
  lines.push(`${pathStr}:`);
  const sorted = methodOrder.filter((m) => methods.has(m));
  for (const method of sorted) {
    lines.push(`  ${method}:`);
  }
}

lines.push(""); // trailing newline

// Formats lines array into a single contiguous YAML document string separated by newlines.
// Represents the fully generated OpenAPI paths contract content ready for persistence.
// Formatted with trailing newline according to POSIX text file standards.
const yaml = lines.join("\n");

// Write to disk
// Resolves current module directory path in ESM execution context.
// Converts file URL into absolute filesystem path string.
// Provides base directory anchor for locating destination packages directory.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, "../../../packages/contracts/openapi/v1/paths/index.yaml");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, yaml, "utf-8");

console.log(`✅ Generated ${sortedPaths.length} path(s) → ${path.relative(process.cwd(), outputPath)}`);
