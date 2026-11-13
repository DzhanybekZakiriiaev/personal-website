import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { seo } from './seo.plugin';

// Big libraries in their own chunks: they download in parallel (Vite adds
// <link rel="modulepreload"> for each), and a site-only change keeps their file
// names, so returning visitors re-download only the small app chunk.
const VENDOR_CHUNKS: [string, RegExp][] = [
  ['three', /[\\/]node_modules[\\/]three[\\/]/],
  ['r3f', /[\\/]node_modules[\\/](@react-three|its-fine|suspend-react|zustand|react-use-measure)[\\/]/],
  ['motion', /[\\/]node_modules[\\/](motion|framer-motion|motion-dom|motion-utils)[\\/]/],
  ['react', /[\\/]node_modules[\\/](react|react-dom|scheduler|use-sync-external-store)[\\/]/],
];

// base './' keeps asset paths relative, so the build also works on GitHub Pages.
export default defineConfig({
  // seo(): meta and social tags, JSON-LD, a no-JavaScript text version, robots.txt,
  // sitemap.xml and llms.txt, all from src/content.ts (see seo.plugin.ts).
  plugins: [react(), seo()],
  base: './',
  build: {
    // three alone is ~700 kB minified; the split above is the useful lever, not this warning.
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return VENDOR_CHUNKS.find(([, test]) => test.test(id))?.[0];
        },
      },
    },
  },
  worker: {
    // The surface paint worker (src/three/surfaceWorker.ts) is a module worker.
    format: 'es',
  },
});
