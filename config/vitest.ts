import { defineConfig } from 'vitest/config';
export default defineConfig({
  define: {
    __IS_COMPILER__: 'false'
  },
  test: {
    globals: true,
    include: ['./src/__test__/*.test.ts'],
    alias: {
      '#': '/src',
      '#test': '../../test-shared'
    }
  }
});
