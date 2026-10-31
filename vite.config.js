import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { gzipSync, constants } from 'node:zlib';

// Production build: the intro only (index.html). The dev-only inspection page
// (inspect.html, src/dev/inspect.js) is served by `npm run dev` and never built.
export default defineConfig(({ command }) => ({
  // Sub-path hosting (GitHub Pages): BASE_PATH=/acurlaz/ at build time.
  base: process.env.BASE_PATH || '/',
  plugins: [gzipModels()],
  build: {
    target: 'es2022',
    // three.js (~590 kB minified) is one long-lived chunk on purpose
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      input: { main: resolve(__dirname, 'index.html') },
      output: {
        // libraries in their own long-lived chunks (hashed names: cache them forever)
        manualChunks: { three: ['three'], gsap: ['gsap'] },
      },
    },
  },
  // Production: console.debug traces removed (they are already behind import.meta.env.DEV).
  esbuild: command === 'build' ? { pure: ['console.debug'], legalComments: 'none' } : undefined,
  server: { port: 5173, strictPort: false },
}));

// Writes `models/<name>.glb.gz` next to each public/models/*.glb in the build
// (gzip -9: 2.2 MB -> 1.1 MB for the CDJ model). src/scene/units.js fetches the
// .gz in production and inflates it with DecompressionStream (falls back to the
// .glb), so the transfer is halved even when the host does not compress .glb
// files. index.html preloads the .gz in the build (only where DecompressionStream
// exists: its inline script reads `gz`, set to true here).
function gzipModels() {
  const dir = resolve(__dirname, 'public/models');
  let models = [];
  try { models = readdirSync(dir).filter((f) => f.endsWith('.glb')); } catch { /* no models */ }
  return {
    name: 'gzip-models',
    apply: 'build',
    generateBundle() {
      for (const f of models) {
        const source = gzipSync(readFileSync(resolve(dir, f)), { level: constants.Z_BEST_COMPRESSION });
        this.emitFile({ type: 'asset', fileName: `models/${f}.gz`, source });
      }
    },
    transformIndexHtml(html) {
      return html.replace('var gz = false;', models.length ? 'var gz = true;' : 'var gz = false;');
    },
  };
}
