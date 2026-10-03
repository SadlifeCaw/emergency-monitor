import { defineConfig } from 'vite';

export default defineConfig({
  // Serveren udstiller admin-fladen paa /admin/, saa aktiverne skal have
  // relative stier. Ellers leder browseren efter dem i roden.
  base: './',
  build: { outDir: 'dist', emptyOutDir: true, assetsInlineLimit: 0 },
  server: { proxy: { '/api': 'http://localhost:8477' } },
});
