/**
 * app-lazy-esm.test.js — chunk sob demanda que é ES Module, com o app inteiro.
 * @jest-environment node
 *
 * LAZY.load de um chunk de CHUNKS_ESM faz import() dinâmico da entrada
 * js/esm/chunks/<chunk>.js. Antes de pedir, o módulo não existe (nem no
 * código-fonte: o index.html não o carrega mais); depois, está em window e usa
 * as MESMAS instâncias do boot (DADOS, UTILS): um chunk com cópia própria do
 * DADOS leria dados velhos em silêncio.
 */
const { subirApp } = require('./helpers/app-jsdom.cjs');

const TXS = [
  { id: 't1', tipo: 'receita', valor: 5000, data: '2026-07-05', categoria: 'salario', descricao: 'Salário' },
  { id: 't2', tipo: 'despesa', valor: 2000, data: '2026-07-10', categoria: 'moradia', descricao: 'Aluguel' },
  { id: 't3', tipo: 'receita', valor: 5000, data: '2026-08-05', categoria: 'salario', descricao: 'Salário' },
  { id: 't4', tipo: 'despesa', valor: 2100, data: '2026-08-10', categoria: 'moradia', descricao: 'Aluguel' },
];

let app;
afterEach(() => { if (app) app.fechar(); app = null; });

test('previsão: só existe depois do LAZY.load, e lê o DADOS do boot', async () => {
  app = await subirApp({ transacoes: TXS });
  const w = app.window;
  expect(w.PREVISAO).toBeUndefined();

  await w.LAZY.load('previsao');

  expect(typeof w.PREVISAO.calcular).toBe('function');
  expect(w.PREVISAO.calcular().meses.length).toBeGreaterThan(0);
  // Mesma instância: trocar um método do DADOS do boot (só em memória, sem
  // tocar o localStorage) muda o que a previsão lê. Uma cópia do DADOS no
  // chunk seguiria lendo os lançamentos do disco.
  const original = w.DADOS.getTransacoes;
  w.DADOS.getTransacoes = () => [];
  try {
    w.PREVISAO.invalidarCache();
    expect(w.PREVISAO.calcular().tendencia).toBe('insuficiente');
  } finally {
    w.DADOS.getTransacoes = original;
  }
  expect(app.erros).toEqual([]);
});

test('relatórios e tour: cada chunk publica os seus módulos, uma vez só', async () => {
  app = await subirApp({ transacoes: TXS });
  const w = app.window;
  expect(w.INIT_RELATORIOS).toBeUndefined();
  expect(w.ONBOARDING).toBeUndefined();

  await Promise.all([w.LAZY.load('relatorios'), w.LAZY.load('relatorios'), w.LAZY.load('onboarding')]);

  expect(typeof w.RELATORIOS.resumoMes).toBe('function');
  expect(typeof w.INIT_RELATORIOS.render).toBe('function');
  expect(typeof w.ONBOARDING.abrirTourExplicito).toBe('function');
  const relatorios = w.RELATORIOS;
  await w.LAZY.load('relatorios');
  expect(w.RELATORIOS).toBe(relatorios);
  expect(app.erros).toEqual([]);
});
