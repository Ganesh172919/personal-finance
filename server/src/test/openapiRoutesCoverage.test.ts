import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { getEnv } from "../config/env";
import { getApiRoutes } from "../routes/routeRegistry";
import { collectRouterRoutes, expressPathToOpenApi, type HttpMethod } from "../utils/routeInventory";

const parseOpenApiPaths = (raw: string) => {
  const paths = new Map<string, Set<HttpMethod>>();
  const lines = raw.split(/\r?\n/);
  let currentPath: string | null = null;

  for (const line of lines) {
    const pathMatch = line.match(/^\/api\/[^:]+:\s*$/);
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
  it("documents all mounted /api routes (path + method)", async () => {
    const mounts = getApiRoutes({ ...getEnv(), MONETIZATION_ENABLED: true, TASKS_ENABLED: true })
      .map(({ path, router }) => ({ prefix: path, router }));

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
