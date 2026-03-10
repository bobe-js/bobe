// vitest.config.ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 允许在测试文件中直接使用 describe, it, expect 而无需 import
    globals: true,
    // 环境模拟（如果是 Web 项目用 jsdom，Node 项目用 node）
    environment: 'node',
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
    },
    // 自动扫描子包中的配置文件
    projects: [
      'packages/*',
      '!packages/temp',
    ],
  },
})