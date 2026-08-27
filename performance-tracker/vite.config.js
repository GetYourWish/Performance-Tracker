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
      // DIAGNOSTIC ONLY: Force React development builds to get full error messages
      // This reveals the actual object keys in React error #62
      'react': 'react/cjs/react.development.js',
      'react-dom': 'react-dom/cjs/react-dom.development.js',
      'react-dom/client': 'react-dom/cjs/react-dom-client.development.js'
    }
  },
  build: {
    outDir: 'dist',
    minify: false
  }
})
