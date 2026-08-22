/**
 * e2e/smoke-boot.spec.cjs — smoke de produção antes dos fluxos de feature
 *
 * Falha em qualquer pageerror no bundle ou dashboard sem hidratar.
 */
const { test, expect } = require('@playwright/test');
const { prepareOfflinePage } = require('./helpers.cjs');

test('dist boot — sem pageerror e dashboard hidratado', async function({ page }) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(err.message || String(err));
  });

  await prepareOfflinePage(page, { captureErrors: false });

  expect(errors, 'pageerror no boot de dist/').toEqual([]);
  await expect(page.locator('#card-saldo-principal')).toContainText(/R\$/);
  await expect(page.locator('#aba-resumo')).toHaveAttribute('data-dashboard-ready', '1');
});
