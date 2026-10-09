/**
 * app-multi-aba.test.js — o app aberto em duas abas, com o app inteiro.
 * @jest-environment node
 *
 * Achado da auditoria de qualidade de 08/10: a mescla entre abas de
 * js/core/dados.js (_mesclarTransacoesRemotas, _mesclarTransacoesComConflitos,
 * o banner de aviso e a trava durante a edição) não tinha nenhum teste — só as
 * regras puras de js/core/sync-merge.js. É o caminho em que uma regressão
 * apaga ou duplica lançamentos sem erro na tela. O primeiro teste já achou um
 * bug: TRANSACOES.init() renovava o cache mas não o índice por mês, então o
 * lançamento criado na outra aba não entrava no saldo do Resumo até recarregar.
 *
 * A "outra aba" é simulada como o navegador faz: ela grava no localStorage
 * (que é compartilhado) e esta aba recebe o evento `storage`.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');

const AGORA = '2026-09-20T12:00:00.000-03:00';
const SALARIO = { id: 'r1', tipo: 'receita', valor: 5000, categoria: 'salario', data: '2026-09-01', descricao: 'Salário', updatedAt: '2026-09-01T10:00:00.000Z' };
const MERCADO = { id: 'd1', tipo: 'despesa', valor: 300, categoria: 'alimentacao', data: '2026-09-10', descricao: 'Mercado', updatedAt: '2026-09-10T10:00:00.000Z' };

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

/** A outra aba grava a lista inteira de lançamentos e o navegador avisa esta. */
function outraAbaGrava(lista) {
  const w = app.window;
  const antigo = w.localStorage.getItem('fp-transacoes');
  const novo = JSON.stringify(lista);
  w.localStorage.setItem('fp-transacoes', novo);
  w.dispatchEvent(new w.StorageEvent('storage', { key: 'fp-transacoes', oldValue: antigo, newValue: novo }));
}

const banner = () => app.document.getElementById('fp-banner-multiaba');
const ids = () => app.window.DADOS.getTransacoes().map((t) => t.id).sort();
const saldoDoMes = () => app.document.getElementById('card-saldo-principal').textContent.replace(/\s+/g, ' ');

test('lançamento criado na outra aba aparece aqui, entra no saldo e o usuário é avisado', async () => {
  app = await subirApp({ agora: AGORA, transacoes: [SALARIO] });
  expect(saldoDoMes()).toMatch(/R\$ 5\.000,00/);

  outraAbaGrava([SALARIO, MERCADO]);
  expect(await app.esperar(() => ids().length === 2)).toBe(true);
  expect(ids()).toEqual(['d1', 'r1']);
  expect(await app.esperar(() => /R\$ 4\.700,00/.test(saldoDoMes()))).toBe(true);
  expect(await app.esperar(() => !!banner())).toBe(true);
  expect(banner().textContent).toMatch(/Outra aba alterou seus dados/);
  expect(app.erros).toEqual([]);
});

test('exclusão feita na outra aba some daqui também (não ressuscita)', async () => {
  app = await subirApp({ agora: AGORA, transacoes: [SALARIO, MERCADO] });
  outraAbaGrava([SALARIO]);
  expect(await app.esperar(() => ids().length === 1)).toBe(true);
  expect(ids()).toEqual(['r1']);
  expect(await app.esperar(() => /R\$ 5\.000,00/.test(saldoDoMes()))).toBe(true);
});

test('durante uma edição aqui, o aviso pede recarregar antes de salvar', async () => {
  app = await subirApp({ agora: AGORA, transacoes: [SALARIO, MERCADO] });
  app.document.getElementById('form-transacao').dataset.editId = 'd1';
  outraAbaGrava([SALARIO, { ...MERCADO, valor: 999 }]);
  expect(await app.esperar(() => !!banner())).toBe(true);
  expect(banner().textContent).toMatch(/enquanto você edita um lançamento/);
});

test('evento de outra chave ou valor ilegível não mexe nos lançamentos', async () => {
  app = await subirApp({ agora: AGORA, transacoes: [SALARIO, MERCADO] });
  const w = app.window;
  w.dispatchEvent(new w.StorageEvent('storage', { key: 'chave-qualquer', newValue: 'x' }));
  w.dispatchEvent(new w.StorageEvent('storage', { key: 'fp-transacoes', newValue: '{corrompido' }));
  await new Promise((r) => setTimeout(r, 450));
  expect(ids()).toEqual(['d1', 'r1']);
  expect(app.erros).toEqual([]);
});
