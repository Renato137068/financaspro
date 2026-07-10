/**
 * e2e/accessibility.spec.cjs — auditoria de acessibilidade automatizada (axe-core)
 *
 * Varre as abas principais do app (Resumo, Extrato, Orçamento, Perfil) e falha
 * se houver violações WCAG 2.1 A/AA de impacto "serious" ou "critical".
 *
 * Requer a devDependency `@axe-core/playwright`:
 *   npm i -D @axe-core/playwright
 * Executa junto com os demais e2e: `npm run test:e2e`
 */
const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const BLOQUEANTES = ['serious', 'critical'];

async function prepareOfflinePage(page) {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');

  await page.addInitScript(function (payload) {
    localStorage.setItem('fp-config', JSON.stringify({
      nome: 'Teste A11y',
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
      { id: 'a11y-1', tipo: 'receita', valor: 5000, categoria: 'salario', data: payload.y + '-' + payload.m + '-01', descricao: 'Salário' },
      { id: 'a11y-2', tipo: 'despesa', valor: 1200, categoria: 'moradia', data: payload.y + '-' + payload.m + '-05', descricao: 'Aluguel' },
    ]));
    localStorage.setItem('fp-contas', '[]');
  }, { y: y, m: m });

  await page.goto('/?offline=1');
  await page.waitForFunction(() => typeof window.mudarAba === 'function', { timeout: 20000 });

  await page.evaluate(function () {
    if (typeof ONBOARDING !== 'undefined' && ONBOARDING.encerrar) ONBOARDING.encerrar();
    const ov = document.getElementById('onboarding-overlay');
    if (ov) ov.remove();
    const auth = document.getElementById('auth-overlay');
    if (auth) auth.style.display = 'none';
    const sk = document.getElementById('dashboard-skeleton');
    if (sk) sk.remove();
  });

  await page.waitForFunction(function () {
    const card = document.getElementById('card-saldo-principal');
    return card && card.textContent && card.textContent.indexOf('R$') !== -1;
  }, { timeout: 15000 });
}

async function auditar(page, nomeAba) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const bloqueantes = results.violations.filter((v) => BLOQUEANTES.includes(v.impact));

  if (bloqueantes.length) {
    const resumo = bloqueantes
      .map((v) => `  • [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} nó/nós)\n    ${v.helpUrl}`)
      .join('\n');
    console.log(`\nViolações de acessibilidade em "${nomeAba}":\n${resumo}\n`);
  }
  expect(bloqueantes, `Violações WCAG serious/critical em "${nomeAba}"`).toEqual([]);
}

test.beforeEach(async function ({ page }) {
  await prepareOfflinePage(page);
});

test('a11y — aba Resumo', async function ({ page }) {
  await auditar(page, 'Resumo');
});

test('a11y — aba Extrato', async function ({ page }) {
  await page.evaluate(() => mudarAba('extrato'));
  await expect(page.locator('#aba-extrato')).toHaveClass(/ativo/);
  await auditar(page, 'Extrato');
});

test('a11y — aba Orçamento', async function ({ page }) {
  await page.evaluate(() => mudarAba('orcamento'));
  await expect(page.locator('#aba-orcamento')).toHaveClass(/ativo/);
  await auditar(page, 'Orçamento');
});

test('a11y — aba Perfil/Config', async function ({ page }) {
  await page.evaluate(() => mudarAba('config'));
  await expect(page.locator('#aba-config')).toHaveClass(/ativo/);
  await auditar(page, 'Perfil/Config');
});

test('a11y — tema escuro (Resumo)', async function ({ page }) {
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await auditar(page, 'Resumo (dark)');
});
