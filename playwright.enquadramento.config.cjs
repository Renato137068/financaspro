/**
 * playwright.enquadramento.config.cjs — só source server (4322), sem rebuild dist.
 */
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e',
  testMatch: 'enquadramento-smoke.spec.cjs',
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:4322',
    viewport: { width: 390, height: 844 },
    locale: 'pt-BR',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: 'http://127.0.0.1:4322',
          localStorage: [{ name: 'fp-force-local', value: '1' }],
        },
      ],
    },
    actionTimeout: 15000,
    launchOptions: process.env.PW_CHROMIUM
      ? { executablePath: process.env.PW_CHROMIUM }
      : {},
  },
  webServer: {
    command: 'node scripts/e2e-serve-source.cjs',
    port: 4322,
    timeout: 60000,
    reuseExistingServer: true,
  },
});
