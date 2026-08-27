import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
      'react/jsx-runtime': path.resolve(__dirname, 'src/diag-jsx-runtime.js')
    }
  },
  build: {
    outDir: 'dist',
    minify: false
  }
})
