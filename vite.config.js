import { defineConfig } from 'vite';

// Découpage du bundle : three seul ; gsap et lenis ensemble (défilement et animation).
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (/node_modules\/three\//.test(id)) return 'three';
          if (/node_modules\/(gsap|lenis)\//.test(id)) return 'motion';
          return undefined;
        },
      },
    },
  },
});
