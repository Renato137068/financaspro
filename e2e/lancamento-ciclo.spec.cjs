/**
 * e2e/lancamento-ciclo.spec.cjs — criar, editar e excluir um lançamento pela
 * tela, no build de produção, navegando pela barra inferior como o usuário.
 *
 * Até aqui o navegador só via "criar" (smoke-boot). Editar e excluir rodavam
 * apenas no jsdom, que não pega botão coberto por outro elemento, chunk que
 * não carrega no build ou barra de navegação quebrada. Nada aqui chama
 * mudarAba nem funções do app para agir: só toques.
 */
const { test, expect } = require('@playwright/test');
const { prepareOfflinePage, waitForAppBoot, dismissOverlays } = require('./helpers.cjs');

const DESCRICAO = 'Ciclo E2E padaria';

/** Toca na aba da barra inferior (a visível em 360px). */
async function tocarAba(page, aba) {
  await page.locator('.nav-bottom [data-action="mudar-aba"][data-aba="' + aba + '"]').click();
  await expect(page.locator('#aba-' + aba)).toBeVisible();
}

async function criarDespesa(page, valor) {
  await tocarAba(page, 'novo');
  await page.locator('.data-chip[data-offset="0"]').click();
  const campoValor = page.locator('#novo-valor');
  await campoValor.fill(valor);
  await campoValor.blur();
  await page.locator('#novo-descricao').fill(DESCRICAO);
  await page.locator('#novo-descricao').blur();
  await page.locator('.btn-registrar').click();
}

const itemNoExtrato = (page) => page.locator('#lista-transacoes .ext-tx', { hasText: DESCRICAO });

async function recarregar(page) {
  await page.reload();
  await waitForAppBoot(page);
  await dismissOverlays(page);
}

/** Cria a despesa e confere que ela está no Extrato e no saldo do Resumo. */
async function prepararLancamento(page) {
  await prepareOfflinePage(page);
  // Semente: salário de R$ 5.000,00 no mês.
  await expect(page.locator('#card-saldo-principal')).toContainText('5.000,00');

  await criarDespesa(page, '150,00');
  await tocarAba(page, 'extrato');
  await expect(itemNoExtrato(page)).toHaveCount(1);
  await expect(itemNoExtrato(page)).toContainText('150,00');
}

/** Marca o item e toca em Deletar na barra de ações, confirmando no modal. */
async function excluirPeloExtrato(page) {
  await itemNoExtrato(page).locator('.tx-checkbox').check();
  await expect(page.locator('#acoes-massa-bar')).toBeVisible();
  await page.locator('#acoes-massa-bar .btn-massa-deletar').click();
  await page.locator('.modal-overlay #mo').click();
  // Some da lista na hora; o Desfazer fica disponível.
  await expect(itemNoExtrato(page)).toHaveCount(0);
  await expect(page.locator('.toast-acao-btn')).toBeVisible();
}

test('criar, editar pelo item do Extrato e ver o Resumo mudar; persiste no reload', async function({ page }) {
  await prepararLancamento(page);

  await tocarAba(page, 'resumo');
  await expect(page.locator('#card-saldo-principal')).toContainText('4.850,00');

  // Editar: tocar no item abre o formulário em modo edição.
  await tocarAba(page, 'extrato');
  await itemNoExtrato(page).locator('.ext-tx-desc').click();
  await expect(page.locator('#aba-novo')).toBeVisible();
  await expect(page.locator('.btn-registrar')).toHaveText('Atualizar');
  await expect(page.locator('#novo-descricao')).toHaveValue(DESCRICAO);
  const campoValor = page.locator('#novo-valor');
  await campoValor.fill('175,50');
  await campoValor.blur();
  await page.locator('.btn-registrar').click();

  await tocarAba(page, 'extrato');
  await expect(itemNoExtrato(page)).toHaveCount(1);
  await expect(itemNoExtrato(page)).toContainText('175,50');

  await tocarAba(page, 'resumo');
  await expect(page.locator('#card-saldo-principal')).toContainText('4.824,50');

  await recarregar(page);
  await expect(page.locator('#card-saldo-principal')).toContainText('4.824,50');
  await tocarAba(page, 'extrato');
  await expect(itemNoExtrato(page)).toHaveCount(1);
  await expect(itemNoExtrato(page)).toContainText('175,50');
});

test('excluir, esperar o prazo do Desfazer e recarregar: o lançamento sumiu', async function({ page }) {
  await prepararLancamento(page);
  await excluirPeloExtrato(page);

  // O prazo do Desfazer (5 s) acaba e o aviso sai sozinho.
  await expect(page.locator('.toast-acao-btn')).toHaveCount(0, { timeout: 10000 });

  await recarregar(page);
  await expect(page.locator('#card-saldo-principal')).toContainText('5.000,00');
  await tocarAba(page, 'extrato');
  await expect(page.locator('#lista-transacoes .ext-tx', { hasText: 'Salário' })).toHaveCount(1);
  await expect(itemNoExtrato(page)).toHaveCount(0);
});

test('excluir e fechar a página antes do prazo: a exclusão vale mesmo assim', async function({ page }) {
  await prepararLancamento(page);
  await excluirPeloExtrato(page);

  // Recarrega com o Desfazer ainda na tela: o pagehide efetiva a exclusão.
  await recarregar(page);
  await tocarAba(page, 'extrato');
  await expect(page.locator('#lista-transacoes .ext-tx', { hasText: 'Salário' })).toHaveCount(1);
  await expect(itemNoExtrato(page)).toHaveCount(0);
  await tocarAba(page, 'resumo');
  await expect(page.locator('#card-saldo-principal')).toContainText('5.000,00');
});

test('Desfazer devolve o lançamento, que continua lá depois do reload', async function({ page }) {
  await prepararLancamento(page);
  await excluirPeloExtrato(page);

  await page.locator('.toast-acao-btn').click();
  await expect(itemNoExtrato(page)).toHaveCount(1);

  await recarregar(page);
  await tocarAba(page, 'extrato');
  await expect(itemNoExtrato(page)).toHaveCount(1);
  await tocarAba(page, 'resumo');
  await expect(page.locator('#card-saldo-principal')).toContainText('4.850,00');
});
