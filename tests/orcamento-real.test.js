/**
 * orcamento-real.test.js — exercita js/orcamento.js REAL
 * Cobre: definir/obter/deletar limite, gasto do mês e status (ok/alerta/excedido/sem-limite).
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(function() { loadCoreModules(); });
beforeEach(function() {
  resetFixtures();
  global.TRANSACOES.init();
  global.ORCAMENTO.init();
});

function gastar(valor, cat, data) {
  global.TRANSACOES.criar('despesa', valor, cat, data, 'gasto');
}

describe('ORCAMENTO — limites', function() {
  test('definir e obter limite', function() {
    global.ORCAMENTO.definirLimite('alimentacao', 500);
    expect(global.ORCAMENTO.obterLimite('alimentacao')).toBe(500);
  });
  test('limite <= 0 lança', function() {
    expect(function() { global.ORCAMENTO.definirLimite('lazer', 0); }).toThrow();
  });
  test('obterLimite de categoria sem limite devolve null', function() {
    expect(global.ORCAMENTO.obterLimite('transporte')).toBeNull();
  });
  test('obterTodos devolve mapa de limites', function() {
    global.ORCAMENTO.definirLimite('alimentacao', 500);
    global.ORCAMENTO.definirLimite('transporte', 200);
    expect(Object.keys(global.ORCAMENTO.obterTodos())).toHaveLength(2);
  });
  test('deletarLimite remove', function() {
    global.ORCAMENTO.definirLimite('alimentacao', 500);
    global.ORCAMENTO.deletarLimite('alimentacao');
    expect(global.ORCAMENTO.obterLimite('alimentacao')).toBeNull();
  });
});

describe('ORCAMENTO.calcularGastoMes', function() {
  test('soma apenas despesas da categoria no mês', function() {
    gastar(300, 'alimentacao', '2026-07-05');
    gastar(150, 'alimentacao', '2026-07-20');
    gastar(999, 'alimentacao', '2026-06-01'); // mês anterior
    gastar(80, 'transporte', '2026-07-10');    // outra categoria
    expect(global.ORCAMENTO.calcularGastoMes('alimentacao', 7, 2026)).toBe(450);
  });
});

describe('ORCAMENTO.obterStatus — faixas', function() {
  test('sem-limite quando não definido', function() {
    var s = global.ORCAMENTO.obterStatus('lazer', 7, 2026);
    expect(s.status).toBe('sem-limite');
    expect(s.limite).toBeNull();
  });
  test('ok abaixo de 80%', function() {
    global.ORCAMENTO.definirLimite('alimentacao', 1000);
    gastar(500, 'alimentacao', '2026-07-05');
    var s = global.ORCAMENTO.obterStatus('alimentacao', 7, 2026);
    expect(s.status).toBe('ok');
    expect(s.percentual).toBe(50);
    expect(s.restante).toBe(500);
  });
  test('alerta entre 80% e 99%', function() {
    global.ORCAMENTO.definirLimite('alimentacao', 1000);
    gastar(850, 'alimentacao', '2026-07-05');
    var s = global.ORCAMENTO.obterStatus('alimentacao', 7, 2026);
    expect(s.status).toBe('alerta');
  });
  test('excedido em 100%+', function() {
    global.ORCAMENTO.definirLimite('alimentacao', 500);
    gastar(600, 'alimentacao', '2026-07-05');
    var s = global.ORCAMENTO.obterStatus('alimentacao', 7, 2026);
    expect(s.status).toBe('excedido');
    expect(s.restante).toBe(0);
  });
});

describe('ORCAMENTO.obterStatusTodos', function() {
  test('devolve status de cada categoria com limite', function() {
    global.ORCAMENTO.definirLimite('alimentacao', 500);
    global.ORCAMENTO.definirLimite('transporte', 200);
    gastar(600, 'alimentacao', '2026-07-05');
    gastar(50, 'transporte', '2026-07-05');
    var todos = global.ORCAMENTO.obterStatusTodos(7, 2026);
    expect(todos).toHaveLength(2);
    var ali = todos.filter(function(s) { return s.categoria === 'alimentacao'; })[0];
    expect(ali.status).toBe('excedido');
  });
});
