/**
 * auditoria-fixes.test.js — regressões da auditoria de usuários virtuais (P1).
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

beforeEach(function() {
  resetFixtures();
  if (global.CONTAS) global.CONTAS.init();
});

describe('Saldo do mês realizado — cutoff ate', function() {
  test('exclui lançamentos futuros do mês corrente', function() {
    DADOS.salvarTransacao({
      id: 'tx1', tipo: 'receita', valor: 5000, categoria: 'salario',
      data: '2026-08-01', descricao: 'Salário', banco: 'Nubank', cartao: '',
    });
    DADOS.salvarTransacao({
      id: 'tx2', tipo: 'despesa', valor: 400, categoria: 'outro',
      data: '2026-08-31', descricao: 'Futuro', banco: 'Nubank', cartao: '',
    });
    TRANSACOES.invalidateCache();

    var completo = TRANSACOES.obterResumoMes(8, 2026);
    var realizado = TRANSACOES.obterResumoMes(8, 2026, { ate: '2026-08-26' });

    expect(completo.saldo).toBe(4600);
    expect(realizado.saldo).toBe(5000);
  });
});

describe('UTILS.calcularSaldo', function() {
  test('ignora transferências', function() {
    var saldo = UTILS.calcularSaldo([
      { tipo: 'receita', valor: 1000 },
      { tipo: 'despesa', valor: 200 },
      { tipo: 'transferencia', valor: 500 },
    ]);
    expect(saldo).toBe(800);
  });
});

describe('TRANSACOES._monthIndex', function() {
  test('buildMonthIndex acelera segundo lookup', function() {
    for (var i = 0; i < 20; i++) {
      DADOS.salvarTransacao({
        id: 'tx' + i,
        tipo: i % 2 === 0 ? 'receita' : 'despesa',
        valor: 10,
        categoria: 'outro',
        data: '2026-08-' + String((i % 28) + 1).padStart(2, '0'),
        descricao: 'T' + i,
        banco: 'X',
        cartao: '',
      });
    }
    TRANSACOES.invalidateCache();
    expect(TRANSACTION_SERVICE.buildMonthIndex).toBeDefined();
    var r1 = TRANSACOES.obterResumoMes(8, 2026);
    expect(TRANSACOES._monthIndex).toBeTruthy();
    var r2 = TRANSACOES.obterResumoMes(8, 2026);
    expect(r2.saldo).toBe(r1.saldo);
  });
});

describe('Performance ≥5k transações', function() {
  function semear5k() {
    for (var i = 0; i < 5000; i++) {
      var mes = (i % 12) + 1;
      DADOS.salvarTransacao({
        id: 'bulk-' + i,
        tipo: i % 3 === 0 ? 'receita' : 'despesa',
        valor: (i % 50) + 1,
        categoria: i % 2 === 0 ? 'alimentacao' : 'transporte',
        data: '2025-' + String(mes).padStart(2, '0') + '-15',
        descricao: 'Bulk ' + i,
        banco: 'Nubank',
        cartao: '',
      });
    }
    TRANSACOES.invalidateCache();
  }

  test('obter({mes,ano}) retorna só o bucket do mês', function() {
    semear5k();
    var ago = TRANSACOES.obter({ mes: 8, ano: 2025 });
    expect(ago.length).toBe(Math.ceil(5000 / 12));
    expect(TRANSACOES._monthIndex).toBeTruthy();
  });

  test('obterRecentes(3) pega as datas mais novas', function() {
    semear5k();
    DADOS.salvarTransacao({
      id: 'nova', tipo: 'despesa', valor: 9, categoria: 'outro',
      data: '2026-12-31', descricao: 'Última', banco: 'X', cartao: '',
    });
    TRANSACOES.invalidateCache();
    var recentes = TRANSACOES.obterRecentes(3);
    expect(recentes).toHaveLength(3);
    expect(recentes[0].id).toBe('nova');
  });

  test('50 filtros mensais em 5k txs ficam abaixo de 500ms', function() {
    semear5k();
    DADOS.salvarConfig({
      orcamentos: {
        alimentacao: { limite: 5000, definidoEm: '2026-01-01T00:00:00.000Z' },
        transporte: { limite: 3000, definidoEm: '2026-01-01T00:00:00.000Z' },
      },
    });
    ORCAMENTO.init();
    var t0 = Date.now();
    for (var i = 0; i < 50; i++) {
      TRANSACOES.obter({ mes: 8, ano: 2025 });
      ORCAMENTO.obterStatusTodos(8, 2025);
    }
    expect(Date.now() - t0).toBeLessThan(500);
  });
});
