import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Default to node; files needing DOM opt in with a `// @vitest-environment
    // jsdom` comment at the top.
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
  },
})
