import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // Ingen CDN-referencer. Alt skal ligge lokalt, saa skaermen virker uden internet.
    assetsInlineLimit: 0,
  },
  server: {
    // I udvikling koerer Vite paa 5173 og henter data fra serveren paa 8080.
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
});
