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
  // DIAGNOSTIC ONLY: Force React to use development builds
  // React's entry files check process.env.NODE_ENV at load time
  define: {
    'process.env.NODE_ENV': '"development"'
  },
  build: {
    outDir: 'dist',
    minify: false
  }
})
