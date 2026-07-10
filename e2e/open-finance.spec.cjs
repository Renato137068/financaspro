/**
 * e2e/open-finance.spec.cjs — sandbox Open Finance offline
 */
const { test, expect } = require('@playwright/test');

async function prepareOfflinePage(page) {
  await page.addInitScript(function() {
    localStorage.setItem('fp-config', JSON.stringify({
      nome: 'Teste OF',
      moeda: 'BRL',
      tema: 'light',
      plano: 'free',
      pinAtivo: false,
      onboardingConcluido: true,
      openFinance: { connections: [], lastSync: null },
      _schemaVer: 2,
    }));
    localStorage.setItem('fp-transacoes', '[]');
    localStorage.setItem('fp-contas', '[]');
  });

  await page.goto('/?offline=1');
  await page.waitForFunction(function() {
    return typeof window.mudarAba === 'function' && typeof window.OPEN_FINANCE !== 'undefined';
  }, { timeout: 20000 });

  await page.evaluate(function() {
    if (typeof ONBOARDING !== 'undefined' && ONBOARDING.encerrar) ONBOARDING.encerrar();
    var ov = document.getElementById('onboarding-overlay');
    if (ov) ov.remove();
    var auth = document.getElementById('auth-overlay');
    if (auth) auth.style.display = 'none';
  });
}

test('conecta sandbox e importa transações', async function({ page }) {
  await prepareOfflinePage(page);

  await page.evaluate(function() { mudarAba('config'); });
  await page.locator('[data-action="abrir-open-finance"]').click();
  await expect(page.locator('.of-modal')).toBeVisible();

  await page.locator('[data-action="of-conectar-sandbox"]').click();
  await expect(page.locator('.of-connection-card')).toBeVisible();

  await page.locator('[data-action="of-sync"]').first().click();
  await expect(page.locator('.of-sync-result')).toContainText(/importada/i);

  var count = await page.evaluate(function() {
    return JSON.parse(localStorage.getItem('fp-transacoes') || '[]').length;
  });
  expect(count).toBe(3);
});

test('segunda sincronização ignora duplicatas', async function({ page }) {
  await prepareOfflinePage(page);

  await page.evaluate(function() { mudarAba('config'); });
  await page.locator('[data-action="abrir-open-finance"]').click();
  await page.locator('[data-action="of-conectar-sandbox"]').click();
  await page.locator('[data-action="of-sync"]').first().click();
  await page.locator('[data-action="of-sync"]').first().click();

  await expect(page.locator('.of-sync-result').last()).toContainText(/0 transação\(ões\) importada\(s\), 3 duplicada\(s\)/);

  var count = await page.evaluate(function() {
    return JSON.parse(localStorage.getItem('fp-transacoes') || '[]').length;
  });
  expect(count).toBe(3);
});
