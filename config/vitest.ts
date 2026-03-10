import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    globals: true,
    include: ['./src/__test__/*.test.ts'],
    alias: {
      '#': '/src',
      '#test': '../../test-shared'
    }
  }
})
