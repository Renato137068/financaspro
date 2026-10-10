/**
 * app-orcamento.test.js — o Orçamento pela tela, com o app inteiro.
 * @jest-environment node
 *
 * Origem: auditoria de testes de ponta a ponta (2026-10-09). O Orçamento só
 * era coberto por unidade (orcamento-real, orcamento-ui) e o E2E chamava
 * ORCAMENTO.definirLimite direto. Aqui: informar a renda pela tela e ver a
 * categoria mudar de grupo conforme os lançamentos feitos pelo formulário.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');

const AGORA = '2026-09-20T12:00:00.000-03:00';

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

const $ = (id) => app.document.getElementById(id);
const visivel = (id) => $(id) && $(id).style.display !== 'none';

function clicar(el) {
  el.dispatchEvent(new app.window.MouseEvent('click', { bubbles: true, cancelable: true }));
}

function digitar(id, texto) {
  const el = $(id);
  el.value = texto;
  el.dispatchEvent(new app.window.Event('input', { bubbles: true }));
}

async function lancar(valor, descricao) {
  app.window.mudarAba('novo');
  digitar('novo-valor', valor);
  digitar('novo-descricao', descricao);
  const antes = app.window.DADOS.getTransacoes().length;
  $('form-transacao').dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
  expect(await app.esperar(() => app.window.DADOS.getTransacoes().length === antes + 1)).toBe(true);
}

async function abrirOrcamento() {
  app.window.mudarAba('orcamento');
  expect(await app.esperar(() => $('orc-renda-valor') || $('orc-dashboard'))).toBeTruthy();
  if (app.window.INIT_ORCAMENTO && app.window.INIT_ORCAMENTO.renderDashboard) app.window.INIT_ORCAMENTO.renderDashboard();
}

test('sem renda, pede a renda; "Definir renda" grava e abre o painel', async () => {
  // O harness sobe com renda 5.000 por padrão: aqui é a pessoa que ainda não informou.
  app = await subirApp({ agora: AGORA, config: { renda: 0 } });
  await abrirOrcamento();
  expect(await app.esperar(() => visivel('orc-renda-setup'))).toBe(true);
  expect(visivel('orc-dashboard')).toBe(false);

  // Valor inválido não grava.
  digitar('orc-renda-valor', '0');
  clicar(app.document.querySelector('[data-action="salvar-renda-orcamento"]'));
  expect(app.window.DADOS.getConfig().renda || 0).toBe(0);

  digitar('orc-renda-valor', '5.000,00');
  clicar(app.document.querySelector('[data-action="salvar-renda-orcamento"]'));
  expect(await app.esperar(() => app.window.DADOS.getConfig().renda === 5000)).toBe(true);
  expect(await app.esperar(() => visivel('orc-dashboard'))).toBe(true);
  expect(visivel('orc-renda-setup')).toBe(false);
  expect(app.erros).toEqual([]);
});

test('gasto dentro do limite fica em "saudável"; passar do limite leva a categoria para crítico', async () => {
  app = await subirApp({
    agora: AGORA,
    config: {
      renda: 5000,
      orcamentos: { alimentacao: { limite: 100, definidoEm: '2026-09-01T00:00:00.000Z' } },
    },
  });

  // 30 em 20 dias: no ritmo, o mês fecha bem abaixo dos 100.
  await lancar('30,00', 'Mercado');
  await abrirOrcamento();
  expect(await app.esperar(() => visivel('orc-group-healthy'))).toBe(true);
  expect($('orc-healthy-list').textContent).toMatch(/Alimentação/);
  expect(visivel('orc-group-critical')).toBe(false);

  await lancar('80,00', 'Padaria');
  await abrirOrcamento();
  expect(await app.esperar(() => visivel('orc-group-critical'))).toBe(true);
  expect($('orc-critical-list').textContent).toMatch(/Alimentação/);
  expect($('orc-healthy-list').textContent).not.toMatch(/Alimentação/);
  expect(app.erros).toEqual([]);
});
