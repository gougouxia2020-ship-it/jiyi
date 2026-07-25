import { defineConfig, devices } from '@playwright/test';

// 念念 · 陈列室 —— e2e 配置。
// 纯前端（Vite dev server + LocalStorage 持久化），无后端。
// webServer 起 Vite dev，测试穿浏览器验外壳：建/切场景、刷新还原、抽屉 14 件、背景不可重复上限 3。
const PORT = 5178;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'line',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
