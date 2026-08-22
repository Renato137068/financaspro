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
    console.log('\nViolações de acessibilidade em "' + nomeAba + '":\n' + resumo + '\n');
  }
  expect(bloqueantes, 'Violações WCAG serious/critical em "' + nomeAba + '"').toEqual([]);
}

test.beforeEach(async function({ page }) {
  await prepareOfflinePage(page);
});

test('a11y — aba Resumo', async function({ page }) {
  await auditar(page, 'Resumo');
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
