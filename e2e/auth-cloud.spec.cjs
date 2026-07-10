/**
 * e2e/auth-cloud.spec.cjs — login na API (requer backend + Postgres)
 * Rode: INTEGRATION_TEST_DATABASE_URL=... E2E_API=1 npm run test:e2e
 */
const { test, expect } = require('@playwright/test');
const { spawn, execSync } = require('child_process');
const path = require('path');

const E2E_PORT = 4400;
const BASE = 'http://127.0.0.1:' + E2E_PORT;

async function waitForHealth(maxMs) {
  var deadline = Date.now() + (maxMs || 20000);
  while (Date.now() < deadline) {
    try {
      var res = await fetch(BASE + '/health');
      if (res.ok) return true;
    } catch (e) { /* retry */ }
    await new Promise(function(r) { setTimeout(r, 400); });
  }
  return false;
}

test.describe('Auth cloud', function() {
  test.skip(!process.env.E2E_API, 'Defina E2E_API=1 com backend disponível');

  let serverProc;
  const dbUrl = process.env.INTEGRATION_TEST_DATABASE_URL || process.env.DATABASE_URL;

  test.beforeAll(async function() {
    if (!dbUrl) test.skip();

    execSync('npx prisma migrate deploy', {
      cwd: path.join(__dirname, '..'),
      stdio: 'inherit',
      env: Object.assign({}, process.env, { DATABASE_URL: dbUrl }),
    });

    serverProc = spawn(process.execPath, ['backend/server.js'], {
      cwd: path.join(__dirname, '..'),
      env: Object.assign({}, process.env, {
        PORT: String(E2E_PORT),
        DATABASE_URL: dbUrl,
        NODE_ENV: 'development',
      }),
      stdio: 'pipe',
    });

    var ready = await waitForHealth(25000);
    if (!ready) throw new Error('Backend E2E não respondeu em /health');
  });

  test.afterAll(async function() {
    if (serverProc) serverProc.kill('SIGTERM');
  });

  test('registro e login via UI', async function({ page }) {
    var email = 'e2e-' + Date.now() + '@financaspro.test';
    await page.goto(BASE + '/');
    await page.waitForFunction(function() {
      return typeof window.DADOS !== 'undefined';
    }, { timeout: 20000 });

    await expect(page.locator('#auth-overlay')).toBeVisible({ timeout: 10000 });

    await page.locator('#auth-tab-register').click();
    await page.fill('#auth-name', 'E2E User');
    await page.fill('#auth-email', email);
    await page.fill('#auth-password', 'SenhaForte123!');
    await page.locator('#auth-submit').click();
    await expect(page.locator('#auth-overlay')).toBeHidden({ timeout: 20000 });
  });
});
