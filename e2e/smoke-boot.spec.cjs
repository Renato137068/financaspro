/**
 * e2e/smoke-boot.spec.cjs — smoke de produção antes dos fluxos de feature
 *
 * Valida: boot sem pageerror, criação de transação, reload e persistência.
 * Falha em qualquer pageerror crítico no console.
 */
const { test, expect } = require('@playwright/test');
const { prepareOfflinePage, waitForAppBoot, dismissOverlays } = require('./helpers.cjs');

async function abrirAbaNovo(page) {
  // Em viewport mobile a sidebar fica oculta; a nav inferior é a visível.
  var bottom = page.locator('.nav-bottom [data-action="mudar-aba"][data-aba="novo"]');
  if (await bottom.isVisible().catch(function() { return false; })) {
    await bottom.click();
  } else {
    await page.locator('[data-action="mudar-aba"][data-aba="novo"]:visible').first().click();
  }
  await expect(page.locator('#aba-novo')).toBeVisible();
}

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

test('criar transação → reload → persistência', async function({ page }) {
  var errors = [];
  page.on('pageerror', function(err) {
    errors.push(err.message || String(err));
  });

  await prepareOfflinePage(page, { captureErrors: false });
  await abrirAbaNovo(page);

  // Garante data (chips + input) — sem data o submit aborta com toast.
  await page.locator('.data-chip[data-offset="0"]').click();
  var hoje = await page.evaluate(function() {
    var d = new Date();
    return [
      d.getFullYear(),
      String(d.getMonth() + 1).padStart(2, '0'),
      String(d.getDate()).padStart(2, '0')
    ].join('-');
  });
  await page.locator('#novo-data').fill(hoje);

  var valor = page.locator('#novo-valor');
  var desc = page.locator('#novo-descricao');
  await valor.fill('150,00');
  await valor.blur();
  await desc.fill('Smoke E2E café');
  await desc.blur();

  await page.locator('.btn-registrar').click();

  // Confirma criação via API do app (storage pode estar cifrado).
  await page.waitForFunction(function() {
    if (typeof TRANSACOES === 'undefined' || !TRANSACOES.obter) return false;
    return TRANSACOES.obter({}).some(function(t) {
      return t.descricao === 'Smoke E2E café' && Number(t.valor) === 150;
    });
  }, { timeout: 8000 });

  await page.reload();
  await waitForAppBoot(page);
  await dismissOverlays(page);

  var found = await page.evaluate(function() {
    if (typeof TRANSACOES !== 'undefined' && TRANSACOES.obter) {
      return TRANSACOES.obter({}).some(function(t) {
        return t.descricao === 'Smoke E2E café' && Number(t.valor) === 150;
      });
    }
    return false;
  });
  expect(found, 'transação deve persistir após reload').toBe(true);
  expect(errors, 'pageerror no fluxo create+reload').toEqual([]);
});

test('viewport 390×844 — sem overflow horizontal crítico', async function({ page }) {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepareOfflinePage(page, { captureErrors: false });

  var overflow = await page.evaluate(function() {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth + 2;
  });
  expect(overflow, 'overflow horizontal em 390×844').toBe(false);

  await expect(page.locator('.nav-bottom')).toBeVisible();
  await expect(page.locator('.nav-bottom [data-aba="resumo"]')).toBeVisible();

  var skip = page.locator('a.skip-link, .skip-link, [href="#conteudo-principal"]');
  if (await skip.count()) {
    await expect(skip.first()).toBeAttached();
  }
});
