import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export function apiProxyTarget(port = process.env.RMD_SERVER_PORT || 27174) {
  return `http://127.0.0.1:${port}`
}

// In dev, server/cli.js owns file-system reads and proxies the UI to Vite.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': apiProxyTarget(),
    },
  },
})
