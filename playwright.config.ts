import { defineConfig } from '@playwright/test'

/**
 * E2E 冒烟测试(docs §16.1 功能验收 + §16.4 路由回归)。
 * 运行前需要构建:npm run build(本配置自动启动 vite preview 服务 dist)。
 * 命令:npm run test:e2e
 */
export default defineConfig({
  testDir: './tests/e2e',
  // 场景懒加载 + 逐页扫描较重:单 worker 串行,避免资源竞争
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1500, height: 900 },
  },
  webServer: {
    command: 'npm run preview -- --port 4173 --strictPort',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  reporter: [['list']],
  outputDir: './test-results',
})
