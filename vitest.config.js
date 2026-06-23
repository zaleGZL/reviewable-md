import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to node; files needing DOM opt in with a `// @vitest-environment
    // jsdom` comment at the top.
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{js,jsx}', 'server/**/*.js'],
      // main.jsx is the React mount entry (no logic); cli.js is the socket
      // wiring exercised by smoke tests, not unit tests.
      exclude: ['src/main.jsx'],
      reporter: ['text', 'html'],
    },
  },
})
