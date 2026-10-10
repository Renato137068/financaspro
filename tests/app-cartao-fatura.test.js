/**
 * app-cartao-fatura.test.js — compra no crédito pela tela até a fatura paga.
 * @jest-environment node
 *
 * Origem: auditoria de testes de ponta a ponta (2026-10-09). A fatura só era
 * coberta por testes de unidade (fatura-pagamento.test.js): nenhum teste
 * lançava pelo formulário escolhendo o cartão e conferia o painel do Resumo.
 * Aqui é o caminho de quem usa: Novo → cartão → Registrar → Resumo →
 * "Marcar fatura como paga" → o limite volta.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');

// 20/09: depois do fechamento do dia 3, a compra cai na fatura que fecha
// em 03/10 e vence em 10/10.
const AGORA = '2026-09-20T12:00:00.000-03:00';
const ROXINHO = { nome: 'Roxinho', bandeira: 'Mastercard', limite: 5000, fechamento: 3, vencimento: 10 };

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

const $ = (id) => app.document.getElementById(id);
const painel = () => $('cartoes-lista').textContent.replace(/\s+/g, ' ');

function digitar(id, texto) {
  const el = $(id);
  el.value = texto;
  el.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}

async function comprarNoCredito(valor, descricao) {
  app.window.mudarAba('novo');
  digitar('novo-valor', valor);
  digitar('novo-descricao', descricao);
  const sel = $('novo-cartao');
  // A lista de pagamento é montada ao abrir a aba, com os cartões do Perfil.
  expect(await app.esperar(() => Array.from(sel.options).some((o) => o.value === 'Roxinho'))).toBe(true);
  sel.value = 'Roxinho';
  sel.dispatchEvent(new app.window.Event('change', { bubbles: true }));
  const antes = app.window.DADOS.getTransacoes().length;
  $('form-transacao').dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
  expect(await app.esperar(() => app.window.DADOS.getTransacoes().length === antes + 1)).toBe(true);
}

test('compra no crédito entra na fatura do cartão e consome o limite', async () => {
  app = await subirApp({ agora: AGORA, config: { plano: 'pro', cartoes: [ROXINHO] } });
  await comprarNoCredito('120,00', 'Mercado');

  const tx = app.window.DADOS.getTransacoes()[0];
  expect(tx).toMatchObject({ tipo: 'despesa', valor: 120, cartao: 'Roxinho' });

  app.window.mudarAba('resumo');
  if (typeof app.window.atualizarDashboard === 'function') app.window.atualizarDashboard();
  expect(await app.esperar(() => /Roxinho/.test(painel()))).toBe(true);
  expect(painel()).toMatch(/Fatura atual/);
  expect(painel()).toMatch(/R\$ 120,00/);
  expect(painel()).toMatch(/R\$ 4\.880,00 livres/);
  expect(app.erros).toEqual([]);
});

test('marcar a fatura como paga devolve o limite; desmarcar prende de novo', async () => {
  app = await subirApp({ agora: AGORA, config: { plano: 'pro', cartoes: [ROXINHO] } });
  await comprarNoCredito('120,00', 'Mercado');
  app.window.mudarAba('resumo');
  if (typeof app.window.atualizarDashboard === 'function') app.window.atualizarDashboard();
  expect(await app.esperar(() => /R\$ 4\.880,00 livres/.test(painel()))).toBe(true);

  const pagar = $('cartoes-lista').querySelector('[data-cartao-acao="pagar"]');
  expect(pagar).not.toBeNull();
  pagar.dispatchEvent(new app.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(await app.esperar(() => /Fatura paga/.test(painel()))).toBe(true);
  expect(painel()).toMatch(/R\$ 5\.000,00 livres/);

  const desmarcar = $('cartoes-lista').querySelector('[data-cartao-acao="desmarcar"]');
  desmarcar.dispatchEvent(new app.window.MouseEvent('click', { bubbles: true, cancelable: true }));
  expect(await app.esperar(() => /R\$ 4\.880,00 livres/.test(painel()))).toBe(true);
  expect(app.erros).toEqual([]);
});
