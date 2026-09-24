import { defineConfig } from 'vite';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [cloudflare()],
  build: {
    target: 'es2023',
    // three.js alone is ~600 kB; splitting it buys nothing for a single-page scene.
    chunkSizeWarningLimit: 1000,
  },
});