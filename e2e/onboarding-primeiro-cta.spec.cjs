/**
 * e2e/onboarding-primeiro-cta.spec.cjs — CTA principal abre Novo, tour só explícito
 *
 * Valida instalação limpa em dist/ (produção) e código-fonte (dev estático).
 */
const { test, expect } = require('@playwright/test');
const { waitForAppBoot } = require('./helpers.cjs');

async function limparInstalacao(page) {
  await page.addInitScript(function() {
    localStorage.clear();
    sessionStorage.clear();
  });
}

async function bootInstalacaoLimpa(page, baseURL) {
  await limparInstalacao(page);
  await page.goto((baseURL || '') + '/?offline=1');
  await waitForAppBoot(page);
}

async function clicarRegistrarTransacao(page) {
  var cta = page.locator('[data-action="mudar-aba"][data-aba="novo"]').filter({ hasText: 'Registrar Transação' }).first();
  if (await cta.isVisible().catch(function() { return false; })) {
    await cta.click();
    return;
  }
  var bottom = page.locator('.nav-bottom [data-action="mudar-aba"][data-aba="novo"]');
  if (await bottom.isVisible().catch(function() { return false; })) {
    await bottom.click();
    return;
  }
  await page.locator('[data-action="mudar-aba"][data-aba="novo"]:visible').first().click();
}

test.describe('dist — produção', function() {
  test('CTA Registrar Transação abre Novo sem tour modal', async function({ page, baseURL }) {
    await bootInstalacaoLimpa(page, baseURL);
    await clicarRegistrarTransacao(page);

    await expect(page.locator('#aba-novo')).toBeVisible();
    await expect(page.locator('#onboarding-overlay')).toHaveCount(0);

    // Avança tempo: convite pode aparecer, mas tour modal não deve abrir sozinho.
    await page.waitForTimeout(3500);
    await expect(page.locator('#onboarding-overlay')).toHaveCount(0);
    await expect(page.locator('#aba-novo')).toBeVisible();
  });
});

test.describe('dev — código-fonte', function() {
  test.use({ baseURL: 'http://127.0.0.1:4322' });

  test('CTA Registrar Transação abre Novo sem tour modal', async function({ page, baseURL }) {
    await bootInstalacaoLimpa(page, baseURL);
    await clicarRegistrarTransacao(page);

    await expect(page.locator('#aba-novo')).toBeVisible();
    await expect(page.locator('#onboarding-overlay')).toHaveCount(0);

    await page.waitForTimeout(3500);
    await expect(page.locator('#onboarding-overlay')).toHaveCount(0);
    await expect(page.locator('#aba-novo')).toBeVisible();
  });
});
