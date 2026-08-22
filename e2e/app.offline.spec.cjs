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

/**
 * Os cartoes de Receitas e Despesas mostravam "R$ 0,01".
 *
 * A animacao de contagem reescreve o textContent a cada quadro, e o
 * MutationObserver que dispara a animacao reagia a essas proprias escritas:
 * cada quadro comecava uma contagem nova mirando o valor intermediario do
 * quadro anterior. O alvo encolhia ate zero e ficava oscilando entre
 * "R$ 0,01" e "R$ -0,00", para sempre.
 *
 * O saldo escapava porque nao passa pelo observador -- era o unico numero certo
 * na tela do painel de um app de financas. Este teste espera o valor ASSENTAR e
 * compara com a conta, entao nao passa nem com a animacao travada no meio.
 */
test('cartoes de receitas e despesas mostram os valores reais', async function({ page }) {
  const receitas = page.locator('#resumo-receitas');
  const despesas = page.locator('#resumo-despesas');

  // O seed de helpers.cjs tem uma unica receita de R$ 5.000 e nenhuma despesa.
  await expect(receitas).toHaveText(/R\$\s*5\.000,00/, { timeout: 10000 });
  await expect(despesas).toHaveText(/R\$\s*0,00/, { timeout: 10000 });

  // E continua certo depois que qualquer animacao teria terminado.
  await page.waitForTimeout(1500);
  await expect(receitas).toHaveText(/R\$\s*5\.000,00/);
  await expect(despesas).toHaveText(/R\$\s*0,00/);
});

test('navega entre extrato e orçamento', async function({ page }) {
  await page.evaluate(function() { mudarAba('extrato'); });
  await expect(page.locator('#aba-extrato')).toHaveClass(/ativo/);
  await expect(page.locator('#saldo-valor')).toContainText(/R\$/);
  await page.evaluate(function() { mudarAba('orcamento'); });
  await expect(page.locator('#aba-orcamento')).toHaveClass(/ativo/);
});

/**
 * Sem backend, nenhuma superficie de nuvem pode aparecer.
 *
 * Este arquivo roda em /?offline=1, que e exatamente a configuracao do build
 * Android do piloto. A folha de respostas do Data safety da Play Store declara
 * que nesse modo o app nao coleta nem compartilha dados; oferecer assinatura,
 * Open Finance, 2FA ou login contradiz a declaracao, e a revisao do Google
 * compara as duas coisas. Alem disso, exibir preco com botao "Assinar" levando
 * a um checkout externo e o padrao que a politica de pagamentos proibe fora dos
 * mercados onde o link externo foi liberado -- o Brasil nao esta entre eles.
 *
 * Este teste existia ao contrario: verificava que o modal de planos ABRIA no
 * modo offline. Ele documentava o comportamento que virou o achado.
 */
test.describe('sem backend, a nuvem nao aparece', function() {
  const SUPERFICIES = [
    ['plano e assinatura', '[data-action="abrir-plano"]'],
    ['Open Finance', '[data-action="abrir-open-finance"]'],
    ['verificacao em duas etapas', '#perfil-2fa-card'],
    ['sair da conta', '#btn-logout'],
    ['excluir minha conta', '[data-action="excluir-conta"]'],
  ];

  test.beforeEach(async function({ page }) {
    await page.evaluate(function() { mudarAba('config'); });
    await expect(page.locator('#aba-config')).toHaveClass(/ativo/);
  });

  for (const [nome, seletor] of SUPERFICIES) {
    test('esconde: ' + nome, async function({ page }) {
      // O elemento continua no HTML — some por data-requer-nuvem, aplicado a
      // partir de DADOS._apiAtiva(). Configure API_BASE_URL e ele volta.
      await expect(page.locator(seletor)).toBeHidden();
    });
  }

  test('o paywall nao abre nem forcando o clique', async function({ page }) {
    await page.waitForFunction(function() {
      return typeof window.INIT_BILLING !== 'undefined' || document.readyState === 'complete';
    }, { timeout: 15000 });

    await page.evaluate(function() {
      var el = document.querySelector('[data-action="abrir-plano"]');
      if (el) el.click();
    });
    await page.waitForTimeout(800);

    await expect(page.locator('.billing-modal')).toHaveCount(0);
  });

  test('nao ha preco de assinatura em lugar nenhum da tela', async function({ page }) {
    // Rede de seguranca ampla: se algum caminho novo trouxer preco de volta ao
    // build sem nuvem, isso falha antes de chegar na revisao da loja.
    const texto = await page.evaluate(function() { return document.body.innerText; });
    expect(texto).not.toMatch(/R\$\s*16,90|R\$\s*99,90|R\$\s*169,00|R\$\s*999,00/);
  });
});
