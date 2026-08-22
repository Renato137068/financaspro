/**
 * e2e/app.offline.spec.cjs — fluxos offline (sem backend)
 */
const { test, expect } = require('@playwright/test');
const { prepareOfflinePage } = require('./helpers.cjs');

test.beforeEach(async function({ page }) {
  await prepareOfflinePage(page);
});

test('dashboard exibe saldo', async function({ page }) {
  await expect(page.locator('#aba-resumo')).toHaveClass(/ativo/);
  await expect(page.locator('#card-saldo-principal')).toContainText(/R\$/);
});

test('navega entre extrato e orçamento', async function({ page }) {
  await page.evaluate(function() { mudarAba('extrato'); });
  await expect(page.locator('#aba-extrato')).toHaveClass(/ativo/);
  await expect(page.locator('#saldo-valor')).toContainText(/R\$/);
  await page.evaluate(function() { mudarAba('orcamento'); });
  await expect(page.locator('#aba-orcamento')).toHaveClass(/ativo/);
});

test('abre modal de planos na aba config', async function({ page }) {
  await page.evaluate(function() { mudarAba('config'); });
  await page.waitForFunction(function() {
    return typeof window.BILLING !== 'undefined';
  }, { timeout: 15000 });
  await page.evaluate(function() {
    var el = document.querySelector('[data-action="abrir-plano"]');
    if (el) el.click();
  });
  await expect(page.locator('.billing-modal')).toBeVisible();
  await expect(page.locator('#billing-title')).toContainText(/plano/i);
});
