/**
 * finance-reconciler.test.js
 * @jest-environment jsdom
 */
const path = require('path');
const vm = require('vm');
const { rodarNoContexto } = require('./helpers/esm-como-script.cjs');

const ARQUIVO = path.join(__dirname, '..', 'js', 'utilities', 'finance-reconciler.js');

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
    // vm com o caminho real: com `new Function` a cobertura não contava.
    var mod = { exports: {} };
    var ctx = vm.createContext({
      TRANSACOES: global.TRANSACOES, PERSIST_QUEUE: global.PERSIST_QUEUE, COMPROMISSOS: undefined, DADOS: undefined,
      window: global, module: mod, exports: mod.exports,
    });
    rodarNoContexto(ctx, ARQUIVO);
    FINANCE_RECONCILER = ctx.FINANCE_RECONCILER;
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
