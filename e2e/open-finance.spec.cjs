/**
 * e2e/open-finance.spec.cjs — sandbox Open Finance offline
 */
const { test, expect } = require('@playwright/test');
const { prepareOfflinePage } = require('./helpers.cjs');

async function carregarOpenFinance(page) {
  await page.evaluate(function() { mudarAba('config'); });
  await page.waitForFunction(function() {
    return typeof window.OPEN_FINANCE !== 'undefined';
  }, { timeout: 15000 });
}

test('conecta sandbox e importa transações', async function({ page }) {
  await prepareOfflinePage(page);
  await carregarOpenFinance(page);

  var result = await page.evaluate(async function() {
    var conn = await OPEN_FINANCE.connectSandbox('Banco Demo');
    return OPEN_FINANCE.syncConnection(conn.id);
  });

  expect(result.imported).toBe(3);
  expect(result.skipped).toBe(0);

  var count = await page.evaluate(function() {
    return JSON.parse(localStorage.getItem('fp-transacoes') || '[]').length;
  });
  expect(count).toBe(4);
});

test('segunda sincronização ignora duplicatas', async function({ page }) {
  await prepareOfflinePage(page);
  await carregarOpenFinance(page);

  var second = await page.evaluate(async function() {
    var conn = await OPEN_FINANCE.connectSandbox('Banco Demo');
    await OPEN_FINANCE.syncConnection(conn.id);
    return OPEN_FINANCE.syncConnection(conn.id);
  });

  expect(second.imported).toBe(0);
  expect(second.skipped).toBe(3);

  var count = await page.evaluate(function() {
    return JSON.parse(localStorage.getItem('fp-transacoes') || '[]').length;
  });
  expect(count).toBe(4);
});

test('UI abre modal Open Finance na aba config', async function({ page }) {
  await prepareOfflinePage(page);
  await carregarOpenFinance(page);

  await page.evaluate(function() {
    INIT_OPEN_FINANCE.abrir();
  });

  await expect(page.locator('.of-modal')).toBeVisible();
  await expect(page.locator('[data-action="of-conectar-sandbox"]')).toBeVisible();
});
