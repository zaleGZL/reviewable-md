import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Pure frontend app. Markdown files are opened with browser File APIs and
// review data is stored in IndexedDB.
export default defineConfig({
  plugins: [react()],
})
