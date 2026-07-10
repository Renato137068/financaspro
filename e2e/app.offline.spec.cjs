/**
 * e2e/app.offline.spec.cjs — fluxos offline (sem backend)
 */
const { test, expect } = require('@playwright/test');

async function prepareOfflinePage(page) {
  var now = new Date();
  var y = now.getFullYear();
  var m = String(now.getMonth() + 1).padStart(2, '0');

  await page.addInitScript(function(payload) {
    localStorage.setItem('fp-config', JSON.stringify({
      nome: 'Teste E2E',
      moeda: 'BRL',
      tema: 'light',
      plano: 'free',
      pinAtivo: false,
      onboardingConcluido: true,
      renda: 5000,
      openFinance: { connections: [], lastSync: null },
      _schemaVer: 2,
    }));
    localStorage.setItem('fp-transacoes', JSON.stringify([
      {
        id: 'e2e-1',
        tipo: 'receita',
        valor: 5000,
        categoria: 'salario',
        data: payload.y + '-' + payload.m + '-01',
        descricao: 'Salário',
      },
    ]));
    localStorage.setItem('fp-contas', '[]');
  }, { y: y, m: m });

  await page.goto('/?offline=1');
  await page.waitForFunction(function() {
    return typeof window.mudarAba === 'function';
  }, { timeout: 20000 });

  await page.evaluate(function() {
    if (typeof ONBOARDING !== 'undefined' && ONBOARDING.encerrar) ONBOARDING.encerrar();
    var ov = document.getElementById('onboarding-overlay');
    if (ov) ov.remove();
    var auth = document.getElementById('auth-overlay');
    if (auth) auth.style.display = 'none';
    var sk = document.getElementById('dashboard-skeleton');
    if (sk) sk.remove();
  });

  await page.waitForFunction(function() {
    var card = document.getElementById('card-saldo-principal');
    return card && card.textContent && card.textContent.indexOf('R$') !== -1;
  }, { timeout: 15000 });
}

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
  await page.evaluate(function() {
    var el = document.querySelector('[data-action="abrir-plano"]');
    if (el) el.click();
  });
  await expect(page.locator('.billing-modal')).toBeVisible();
  await expect(page.locator('#billing-title')).toContainText(/plano/i);
});
