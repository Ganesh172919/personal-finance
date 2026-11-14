import { build } from 'esbuild';

// Bundle local modules so Node can run the ESM output without TypeScript loaders
// or extension-resolution flags. Runtime packages remain normal dependencies.
await build({
  entryPoints: { server: 'src/server.ts', 'worker/worker': 'src/worker/worker.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
});
