import { defineConfig } from 'vite';

export default defineConfig({
  base: '/xiaomao-zhuayu-3d-2026/',
  build: {
    target: 'es2018',
    chunkSizeWarningLimit: 600
  }
});
