/**
 * e2e/accessibility.spec.cjs — auditoria de acessibilidade automatizada (axe-core)
 */
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { prepareOfflinePage } = require('./helpers.cjs');

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOQUEANTES = ['serious', 'critical'];

async function auditar(page, nomeAba) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const bloqueantes = results.violations.filter(function(v) {
    return BLOQUEANTES.indexOf(v.impact) !== -1;
  });

  if (bloqueantes.length) {
    const resumo = bloqueantes
      .map(function(v) {
        return '  • [' + v.impact + '] ' + v.id + ': ' + v.help + ' (' + v.nodes.length + ' nó/nós)\n    ' + v.helpUrl;
      })
      .join('\n');
    // eslint-disable-next-line no-console -- diagnóstico intencional quando há violação WCAG
    console.log('\nViolações de acessibilidade em "' + nomeAba + '":\n' + resumo + '\n');
  }
  expect(bloqueantes, 'Violações WCAG serious/critical em "' + nomeAba + '"').toEqual([]);
}

test.beforeEach(async function({ page }) {
  await prepareOfflinePage(page);
});

test('a11y — aba Novo', async function({ page }) {
  await page.evaluate(function() { mudarAba('novo'); });
  await expect(page.locator('#aba-novo')).toHaveClass(/ativo/);
  await auditar(page, 'Novo');
});

test('a11y — overlay de auth', async function({ page }) {
  await page.evaluate(function() {
    var ov = document.getElementById('auth-overlay');
    if (ov) ov.style.display = '';
    document.body.classList.add('auth-overlay-open');
  });
  await expect(page.locator('#auth-overlay')).toBeVisible();
  await auditar(page, 'Auth overlay');
  await page.evaluate(function() {
    var ov = document.getElementById('auth-overlay');
    if (ov) ov.style.display = 'none';
    document.body.classList.remove('auth-overlay-open');
  });
});

test.describe('a11y — paywall / billing (fonte 4322)', function() {
  // INIT_BILLING no dist (4321) pode ficar no lazy bundle; na fonte o script
  // clássico expõe o namespace — mesmo padrão de e2e/billing-smoke.spec.cjs.
  test.use({ baseURL: 'http://127.0.0.1:4322' });

  test('paywall sem violações serious/critical', async function({ page }) {
    await page.waitForFunction(function() {
      return typeof INIT_BILLING !== 'undefined'
        && typeof INIT_BILLING.abrirPaywall === 'function';
    }, { timeout: 30000 });
    await page.evaluate(function() {
      INIT_BILLING.abrirPaywall('A11y paywall');
    });
    await expect(page.locator('.billing-modal, .billing-overlay').first()).toBeVisible({ timeout: 10000 });
    await auditar(page, 'Paywall');
  });
});

test('a11y — aba Extrato', async function({ page }) {
  await page.evaluate(function() { mudarAba('extrato'); });
  await expect(page.locator('#aba-extrato')).toHaveClass(/ativo/);
  await auditar(page, 'Extrato');
});

test('a11y — aba Orçamento', async function({ page }) {
  await page.evaluate(function() { mudarAba('orcamento'); });
  await expect(page.locator('#aba-orcamento')).toHaveClass(/ativo/);
  await auditar(page, 'Orçamento');
});

test('a11y — aba Perfil/Config', async function({ page }) {
  await page.evaluate(function() { mudarAba('config'); });
  await expect(page.locator('#aba-config')).toHaveClass(/ativo/);
  await auditar(page, 'Perfil/Config');
});

test('a11y — tema escuro (Resumo)', async function({ page }) {
  await page.evaluate(function() {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  await auditar(page, 'Resumo (dark)');
});

test('a11y — sub-abas Orçamento (claro e escuro)', async function({ page }) {
  await page.evaluate(function() { mudarAba('orcamento'); });
  await expect(page.locator('#aba-orcamento')).toHaveClass(/ativo/);

  var subs = ['planejamento', 'metas', 'assinaturas', 'patrimonio'];
  for (var i = 0; i < subs.length; i++) {
    await page.evaluate(function(sub) {
      if (typeof INIT_ORCAMENTO !== 'undefined' && INIT_ORCAMENTO.mudarSubAba) {
        INIT_ORCAMENTO.mudarSubAba(sub);
      }
    }, subs[i]);
    await auditar(page, 'Orçamento / ' + subs[i]);
  }

  await page.evaluate(function() {
    document.documentElement.setAttribute('data-theme', 'dark');
  });
  for (var j = 0; j < subs.length; j++) {
    await page.evaluate(function(sub) {
      if (typeof INIT_ORCAMENTO !== 'undefined' && INIT_ORCAMENTO.mudarSubAba) {
        INIT_ORCAMENTO.mudarSubAba(sub);
      }
    }, subs[j]);
    await auditar(page, 'Orçamento (dark) / ' + subs[j]);
  }
});

test('a11y — modal changelog (claro e escuro)', async function({ page }) {
  await page.evaluate(function() { abrirChangelog(); });
  await expect(page.locator('.modal-overlay')).toBeVisible();
  await auditar(page, 'Modal changelog');

  await page.evaluate(function() {
    var ov = document.querySelector('.modal-overlay');
    if (ov) ov.remove();
    document.documentElement.setAttribute('data-theme', 'dark');
    abrirChangelog();
  });
  await expect(page.locator('.modal-overlay')).toBeVisible();
  await auditar(page, 'Modal changelog (dark)');
});
