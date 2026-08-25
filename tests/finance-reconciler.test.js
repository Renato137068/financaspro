/**
 * finance-reconciler.test.js
 * @jest-environment jsdom
 */
const path = require('path');
const fs = require('fs');

describe('FINANCE_RECONCILER', function() {
  var FINANCE_RECONCILER;

  beforeEach(function() {
    var txs = [
      { id: '1', tipo: 'receita', valor: 100, data: '2026-01-05', descricao: 'AnnualE2E-p1', clientKey: 'a' },
      { id: '2', tipo: 'despesa', valor: 40, data: '2026-01-05', descricao: 'AnnualE2E-p2', clientKey: 'b' }
    ];
    global.TRANSACOES = {
      obter: function() { return txs; }
    };
    global.PERSIST_QUEUE = {
      getSnapshot: function() {
        return { pending: 0, saving: 0, failed: 0, saved: 2, items: [] };
      }
    };
    var code = fs.readFileSync(
      path.join(__dirname, '..', 'js', 'utilities', 'finance-reconciler.js'),
      'utf8'
    );
    // eslint-disable-next-line no-new-func
    var fn = new Function('TRANSACOES', 'PERSIST_QUEUE', 'DADOS', 'window', 'module', 'exports', code + '\n; return FINANCE_RECONCILER;');
    FINANCE_RECONCILER = fn(global.TRANSACOES, global.PERSIST_QUEUE, undefined, global, { exports: {} }, {});
  });

  test('reconcile ok quando contagem e totais batem', function() {
    var expected = [
      { tipo: 'receita', valor: 100, data: '2026-01-05', descricao: 'AnnualE2E-p1', clientKey: 'a' },
      { tipo: 'despesa', valor: 40, data: '2026-01-05', descricao: 'AnnualE2E-p2', clientKey: 'b' }
    ];
    var r = FINANCE_RECONCILER.reconcile({ expected: expected, label: 't' });
    expect(r.ok).toBe(true);
    expect(r.persistedCount).toBe(2);
    expect(r.totalsPersisted.saldo).toBe(60);
    expect(r.duplicates.length).toBe(0);
  });

  test('detecta falha de contagem', function() {
    var r = FINANCE_RECONCILER.reconcile({ expectedCount: 5 });
    expect(r.ok).toBe(false);
    expect(r.deltaCount).toBe(-3);
  });
});
