import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  // @performance-tracker/core is a CommonJS workspace package. Without
  // pre-bundling, vite dev serves it as raw ESM source and every named
  // import fails with "does not provide an export named ..." (blank page).
  optimizeDeps: {
    include: ['@performance-tracker/core']
  },
  server: {
    port: 5173,
    watch: {
      ignored: ['**/.vs/**', '**/node_modules/**', '**/dist/**', '**/out/**', '**/release/**', '**/.git/**', '**/.backups/**']
    }
  },
  build: {
    outDir: 'dist'
  }
})
