import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  optimizeDeps: { exclude: ['three'] },
  build: { target: 'es2020', chunkSizeWarningLimit: 2000 },
});
