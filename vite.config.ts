import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'es2023',
    // three.js alone is ~600 kB; splitting it buys nothing for a single-page scene.
    chunkSizeWarningLimit: 1000,
  },
});
