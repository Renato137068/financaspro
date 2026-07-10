/**
 * open-finance.test.js — deduplicação e normalização de importação
 */

var ofHelpers = require('../js/open-finance.js');

describe('Open Finance — helpers', function() {
  test('normaliza transação com openFinanceId composto', function() {
    var norm = ofHelpers.normalizeMockTransaction({
      externalId: 'abc-1',
      tipo: 'despesa',
      valor: 10,
      categoria: 'alimentacao',
      data: '2026-07-01',
      descricao: 'Teste',
      banco: 'Banco X',
    }, 'conn-1');

    expect(norm.openFinanceId).toBe('conn-1:abc-1');
    expect(norm.valor).toBe(10);
    expect(norm.banco).toBe('Banco X');
  });

  test('detecta duplicata por openFinanceId', function() {
    var txs = [{ id: '1', openFinanceId: 'c1:demo-1' }];
    expect(ofHelpers.findDuplicateExternalId(txs, 'c1:demo-1')).toBe(true);
    expect(ofHelpers.findDuplicateExternalId(txs, 'c1:demo-2')).toBe(false);
  });

  test('sandbox gera três lançamentos demo', function() {
    var items = ofHelpers.generateSandboxTransactions({ bankName: 'Nubank Demo' });
    expect(items).toHaveLength(3);
    expect(items[0].banco).toBe('Nubank Demo');
    expect(items[0].externalId).toBe('demo-1');
    expect(items[1].tipo).toBe('despesa');
    expect(items[2].tipo).toBe('receita');
  });

  test('provider sandbox é constante', function() {
    expect(ofHelpers.SANDBOX_PROVIDER).toBe('sandbox');
  });

  test('handleBelvoCallback ignora sem parâmetro belvo', function() {
    var params = new URLSearchParams('');
    return ofHelpers.handleBelvoCallback(params).then(function(r) {
      expect(r).toBeNull();
    });
  });
});
