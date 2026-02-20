import { parseManifest, type PluginManifest } from "./manifest.ts";

export type LoadedPlugin = {
  manifest: PluginManifest;
  moduleCode: string;
  rootPath: string;
};

const decodeUtf8 = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const readText = async (path: string) => decodeUtf8(await Deno.readFile(path));

const resolvePath = (root: string, relative: string) => {
  const cleaned = relative.replace(/^\/+/, "");
  return `${root.replace(/\/+$/, "")}/${cleaned}`;
};

export const loadPlugins = async (pluginDir: string): Promise<LoadedPlugin[]> => {
  const loaded: LoadedPlugin[] = [];

  let entries: Deno.DirEntry[] = [];
  try {
    for await (const entry of Deno.readDir(pluginDir)) {
      entries.push(entry);
    }
  } catch (_error) {
    return loaded;
  }

  for (const entry of entries) {
    if (!entry.isDirectory) continue;
    const rootPath = resolvePath(pluginDir, entry.name);
    const manifestPath = resolvePath(rootPath, "manifest.json");
    try {
      const manifestRaw = JSON.parse(await readText(manifestPath));
      const manifest = parseManifest(manifestRaw);
      const modulePath = resolvePath(rootPath, manifest.entrypoints.module);
      const moduleCode = await readText(modulePath);
      loaded.push({ manifest, moduleCode, rootPath });
    } catch (_error) {
      continue;
    }
  }

  return loaded;
};

