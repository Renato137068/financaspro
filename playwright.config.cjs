const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.cjs',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:4321',
    viewport: { width: 360, height: 640 },
    locale: 'pt-BR',
    actionTimeout: 15000,
  },
  webServer: {
    command: 'node scripts/e2e-serve.cjs',
    port: 4321,
    timeout: 120000,
    reuseExistingServer: !process.env.CI,
  },
});
