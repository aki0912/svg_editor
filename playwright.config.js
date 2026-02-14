import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.js',
  timeout: 30_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    viewport: { width: 1600, height: 900 },
  },
  webServer: {
    command: 'node scripts/e2e-static-server.mjs --port 4173',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
