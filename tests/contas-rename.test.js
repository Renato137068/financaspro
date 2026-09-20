/**
 * contas-rename.test.js — renomear conta e saldo inicial (integridade de dados).
 *
 * propagarRename troca o nome de uma conta em TODOS os lugares: lançamentos
 * (banco/accountId e contaDestino/contaDestinoId), saldosIniciais e a lista de
 * bancos. Um bug aqui corrompe registros ou faz o saldo inicial sumir. Estava
 * sem teste; exercita o módulo real via load-sources.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

const C = () => global.CONTAS;
const D = () => global.DADOS;

function lancar(tx) {
  D().salvarTransacao(Object.assign({ id: global.UTILS.gerarId(), descricao: 'x' }, tx));
  if (global.TRANSACOES && global.TRANSACOES.invalidateCache) global.TRANSACOES.invalidateCache();
}

beforeEach(function() {
  resetFixtures();
  C().init();
});

describe('CONTAS.propagarRename', function() {
  test('renomeia banco e accountId nos lançamentos e conta quantos mudaram', function() {
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-01', categoria: 'lazer', banco: 'Nubank', accountId: 'acc-1' });
    lancar({ tipo: 'receita', valor: 200, data: '2026-03-02', categoria: 'salario', banco: 'Nubank', accountId: 'acc-1' });
    lancar({ tipo: 'despesa', valor: 50, data: '2026-03-03', categoria: 'lazer', banco: 'Itaú', accountId: 'acc-2' });

    const r = C().propagarRename('acc-1', 'Nubank', 'Nu');
    expect(r.txs).toBe(2);

    const txs = D().getTransacoes();
    const nu = txs.filter(function(t) { return t.banco === 'Nu'; });
    expect(nu).toHaveLength(2);
    expect(txs.filter(function(t) { return t.banco === 'Nubank'; })).toHaveLength(0);
    // Itaú intacto
    expect(txs.filter(function(t) { return t.banco === 'Itaú'; })).toHaveLength(1);
  });

  test('renomeia também o lado contaDestino de transferências', function() {
    lancar({ tipo: 'transferencia', valor: 100, data: '2026-03-01', categoria: 'transferencia',
      banco: 'Itaú', accountId: 'acc-2', contaDestino: 'Nubank', contaDestinoId: 'acc-1' });

    const r = C().propagarRename('acc-1', 'Nubank', 'Nu');
    expect(r.txs).toBe(1);
    expect(D().getTransacoes()[0].contaDestino).toBe('Nu');
  });

  test('move o saldo inicial da chave antiga para a nova', function() {
    C().definirSaldoInicial('Nubank', 500);
    C().propagarRename('acc-1', 'Nubank', 'Nu');

    const ini = D().getConfig().saldosIniciais || {};
    expect(ini['Nu']).toBe(500);
    expect(ini['Nubank']).toBeUndefined();
  });

  test('renomeia a conta na lista de bancos (config)', function() {
    D().salvarConfig({ bancos: ['Nubank', 'Itaú'] });
    C().propagarRename('acc-1', 'Nubank', 'Nu');

    const bancos = D().getConfig().bancos || [];
    expect(bancos).toContain('Nu');
    expect(bancos).not.toContain('Nubank');
    expect(bancos).toContain('Itaú');
  });

  test('no-op quando faltam argumentos ou o nome não muda', function() {
    expect(C().propagarRename('', 'a', 'b')).toEqual({ txs: 0 });
    expect(C().propagarRename('acc-1', 'Nubank', 'Nubank')).toEqual({ txs: 0 });
  });
});

describe('CONTAS.definirSaldoInicial', function() {
  test('grava o saldo inicial e o saldos() reflete', function() {
    const v = C().definirSaldoInicial('Carteira', '1.234,50'.replace('.', ''));
    expect(v).toBeCloseTo(1234.5, 2);

    const carteira = C().saldos().find(function(s) { return s.nome === 'Carteira'; });
    expect(carteira.saldoInicial).toBeCloseTo(1234.5, 2);
  });

  test('nome vazio devolve null e não grava', function() {
    expect(C().definirSaldoInicial('   ', 100)).toBeNull();
  });
});

describe('CONTAS.mesmaConta', function() {
  test('mesma string é a mesma conta; nulos não', function() {
    expect(C().mesmaConta('Nubank', 'Nubank')).toBe(true);
    expect(C().mesmaConta('Nubank', null)).toBe(false);
    expect(C().mesmaConta(null, 'Nubank')).toBe(false);
  });

  test('nomes diferentes não são a mesma conta', function() {
    expect(C().mesmaConta('Nubank', 'Itaú')).toBe(false);
  });
});
