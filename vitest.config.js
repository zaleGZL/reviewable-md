import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    // Default to node; files needing DOM opt in with a `// @vitest-environment
    // jsdom` comment at the top.
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}'],
      // main.jsx is the React mount entry and has no app logic.
      exclude: ['src/main.jsx'],
      reporter: ['text', 'html'],
    },
  },
})
