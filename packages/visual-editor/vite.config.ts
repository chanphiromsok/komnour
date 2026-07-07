import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Prefer sone's browser build.
    conditions: ['browser', 'import', 'module', 'default'],
    alias: {
      // sone's browser bundle references node:module (createRequire) for
      // optional hyphenation; shim it so the production build doesn't choke.
      'node:module': fileURLToPath(new URL('./src/shims/node-module.ts', import.meta.url)),
    },
  },
  server: {
    port: 5174,
    fs: { allow: ['../..'] },
  },
})
