import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev, the client talks to the local review server (server/cli.js) for
// loading the markdown file and reading/writing comments. The server proxies
// Vite during development so everything runs on one port.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:5174',
    },
  },
})
