import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    port: 5173,
    watch: {
      ignored: ['**/.vs/**', '**/node_modules/**', '**/dist/**', '**/out/**', '**/release/**', '**/.git/**', '**/.backups/**']
    }
  },
  resolve: {
    alias: {
      // DIAGNOSTIC: Route JSX through our sanitizer to catch bad style values
      'react/jsx-runtime': '/home/z/my-project/Performance-Tracker/performance-tracker/src/diag-jsx-runtime.js'
    }
  },
  build: {
    outDir: 'dist',
    minify: false
  }
})
