/**
 * app-acoes-mortas.test.js — botões que chamavam funções inexistentes.
 * @jest-environment node
 *
 * Ao religar o no-undef com a lista gerada de globais, três chamadas
 * apareceram apontando para funções que não existem em lugar nenhum de js/
 * (a lista manual antiga as declarava). Protegidas por `typeof`, não
 * quebravam: só não faziam nada. Estes testes rodam o app inteiro.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');
// Os lançamentos de exemplo são de setembro de 2026 e o dashboard mostra o mês
// corrente: sem relógio fixo, a suíte quebrava na virada do mês (1º/10).
const AGORA = '2026-09-20T12:00:00.000-03:00';

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

test('alerta "Gasto incomum" → editar abre a transação no formulário', async () => {
  const tx = { id: 't-jantar', tipo: 'despesa', valor: 600, categoria: 'alimentacao', data: '2026-09-20', descricao: 'Jantar caro' };
  app = await subirApp({ agora: AGORA, transacoes: [tx] });

  app.global('ALERTAS')._executarAcao('editarTransacao', { id: 't-jantar' });

  const d = app.document;
  expect(await app.esperar(() => d.getElementById('form-transacao').dataset.editId === 't-jantar')).toBe(true);
  expect(d.getElementById('novo-descricao').value).toBe('Jantar caro');
  expect(d.getElementById('novo-valor').value).toMatch(/600,00/);
});

test('paywall "Entrar e assinar" abre o login completo (body marcado e foco no e-mail)', async () => {
  app = await subirApp({ agora: AGORA, nuvem: { contas: {} } });
  const d = app.document;
  const overlay = d.getElementById('auth-overlay');
  // Fecha o login do boot para simular quem entrou no modo sem conta.
  overlay.style.display = 'none';
  d.body.classList.remove('auth-overlay-open');

  await app.carregarChunkConta();
  app.global('INIT_BILLING')._abrirLogin();

  expect(overlay.style.display).toBe('flex');
  expect(d.body.classList.contains('auth-overlay-open')).toBe(true);
  expect(d.activeElement && d.activeElement.id).toBe('auth-login-email');
});
