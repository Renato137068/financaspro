/**
 * e2e/billing-smoke.spec.cjs — paywall/soft AI sem Stripe real.
 * Fonte (4322): INIT_BILLING vem de script clássico, não do lazy bundle do dist.
 */
const { test, expect } = require('@playwright/test');
const { seedOfflineStorage, dismissOverlays } = require('./helpers.cjs');

test.use({ baseURL: 'http://127.0.0.1:4322' });

async function bootBilling(page) {
  await seedOfflineStorage(page);
  await page.goto('/?offline=1');
  await page.waitForFunction(function() {
    return typeof INIT_BILLING !== 'undefined'
      && typeof INIT_BILLING.abrirPaywall === 'function';
  }, { timeout: 30000 });
  await dismissOverlays(page);
}

test.beforeEach(async function({ page }) {
  await bootBilling(page);
});

test('paywall abre offline só com Pro e sem Assinar', async function({ page }) {
  await page.route('**/*stripe*', function(route) { return route.abort(); });

  await page.evaluate(function() {
    INIT_BILLING.abrirPaywall('Soft paywall de teste');
  });

  await expect(page.locator('#billing-title')).toBeVisible();
  await expect(page.locator('#billing-lead')).toContainText(/Soft paywall/);
  await expect(page.locator('.billing-plan h3').filter({ hasText: /^Pro$/i })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.billing-plan h3').filter({ hasText: /Business/i })).toHaveCount(0);
  await expect(page.locator('#billing-footer')).toContainText(/Entrar ou criar conta/);
  await expect(page.locator('[data-action="billing-assinar"]')).toHaveCount(0);
  await expect(page.locator('.billing-plan-locked').first()).toBeVisible();
});

test('soft AI esgotado abre paywall sem ir ao Stripe', async function({ page }) {
  var stripeHit = false;
  await page.route('**/*stripe*', function(route) {
    stripeHit = true;
    return route.abort();
  });

  await page.evaluate(function() {
    localStorage.setItem('fp-local-ai-uses', '5');
    INIT_BILLING.abrirPaywall('Você usou os 5 usos grátis');
  });

  await expect(page.locator('#billing-title')).toBeVisible();
  await expect(page.locator('#billing-lead')).toContainText(/usos grátis/i);
  expect(stripeHit).toBe(false);
});

test('banner soft AI aparece com 1 uso restante', async function({ page }) {
  await expect.poll(async function() {
    return page.evaluate(function() {
      var ob = document.getElementById('dashboard-onboarding');
      if (ob) {
        ob.hidden = true;
        if (ob.parentNode) ob.parentNode.removeChild(ob);
      }
      localStorage.setItem('fp-local-ai-uses', '4');
      if (INIT_BILLING.refreshUsageBanner) INIT_BILLING.refreshUsageBanner();
      var el = document.getElementById('fp-usage-banner');
      if (!el || el.hidden) return '';
      return el.textContent || '';
    });
  }, { timeout: 8000 }).toMatch(/1 uso/);

  await expect(page.locator('#fp-usage-banner [data-action="abrir-paywall"]')).toBeAttached();
});
