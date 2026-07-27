/**
 * transacoes-real.test.js — exercita js/transacoes.js REAL
 * Cobre: criar (sanitização + normalização), obter (filtros/ordenação),
 *        obterPorId, atualizar, deletar, resumos e cache.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

beforeAll(function() { loadCoreModules(); });
beforeEach(function() {
  resetFixtures();
  global.TRANSACOES.init();
});

function criar(tipo, valor, cat, data, desc) {
  return global.TRANSACOES.criar(tipo, valor, cat, data, desc);
}

describe('TRANSACOES.criar', function() {
  test('cria despesa válida com campos normalizados', function() {
    var tx = criar('despesa', 15, 'alimentacao', '2026-07-01', 'Mercado');
    expect(tx.valor).toBe(15);
    expect(tx.categoria).toBe('alimentacao');
    expect(tx.id).toBeDefined();
    expect(tx.dataCriacao).toBeDefined();
  });
  test('valor string é convertido para número', function() {
    var tx = criar('receita', '2500', 'salario', '2026-07-05', 'Salário');
    expect(tx.valor).toBe(2500);
  });
  test('categoria inválida é normalizada para fallback', function() {
    var tx = criar('despesa', 10, 'categoria-fantasma', '2026-07-01', 'x');
    expect(tx.categoria).toBe('outro');
  });
  test('descrição com HTML é sanitizada', function() {
    var tx = criar('despesa', 10, 'alimentacao', '2026-07-01', '<script>alert(1)</script>');
    expect(tx.descricao).not.toContain('<script>');
  });
  test('valor inválido lança erro', function() {
    expect(function() { criar('despesa', 0, 'alimentacao', '2026-07-01', 'x'); }).toThrow();
  });
  test('persiste no store (aparece em obter)', function() {
    criar('despesa', 10, 'alimentacao', '2026-07-01', 'x');
    expect(global.TRANSACOES.obter({}).length).toBe(1);
  });
});

describe('TRANSACOES.obter — filtros e ordenação', function() {
  beforeEach(function() {
    criar('receita', 5000, 'salario', '2026-07-01', 'Salário');
    criar('despesa', 1200, 'moradia', '2026-07-10', 'Aluguel');
    criar('despesa', 400, 'alimentacao', '2026-07-20', 'Mercado');
    criar('despesa', 250, 'alimentacao', '2026-06-15', 'Mês anterior');
  });
  test('sem filtros retorna tudo', function() {
    expect(global.TRANSACOES.obter({}).length).toBe(4);
  });
  test('filtra por mês/ano', function() {
    expect(global.TRANSACOES.obter({ mes: 7, ano: 2026 }).length).toBe(3);
  });
  test('filtra por tipo', function() {
    expect(global.TRANSACOES.obter({ tipo: 'despesa' }).length).toBe(3);
  });
  test('filtra por categoria', function() {
    expect(global.TRANSACOES.obter({ categoria: 'alimentacao' }).length).toBe(2);
  });
  test('combina mês + tipo + categoria', function() {
    var r = global.TRANSACOES.obter({ mes: 7, ano: 2026, tipo: 'despesa', categoria: 'alimentacao' });
    expect(r).toHaveLength(1);
    expect(r[0].descricao).toBe('Mercado');
  });
  test('ordenação padrão é data-desc', function() {
    var r = global.TRANSACOES.obter({ mes: 7, ano: 2026 });
    expect(new Date(r[0].data) >= new Date(r[1].data)).toBe(true);
  });
  test('ordenação data-asc', function() {
    var r = global.TRANSACOES.obter({ ordenarPor: 'data-asc' });
    expect(new Date(r[0].data) <= new Date(r[r.length - 1].data)).toBe(true);
  });
});

describe('TRANSACOES.obterPorId / atualizar / deletar', function() {
  var id;
  beforeEach(function() {
    var tx = criar('despesa', 100, 'lazer', '2026-07-01', 'Cinema');
    id = tx.id;
  });
  test('obterPorId encontra', function() {
    expect(global.TRANSACOES.obterPorId(id).descricao).toBe('Cinema');
  });
  test('obterPorId inexistente devolve null', function() {
    expect(global.TRANSACOES.obterPorId('nao-existe')).toBeNull();
  });
  test('atualizar altera valor e mantém id', function() {
    var up = global.TRANSACOES.atualizar(id, { valor: 180 });
    expect(up.valor).toBe(180);
    expect(up.id).toBe(id);
    expect(global.TRANSACOES.obter({}).length).toBe(1); // upsert, não duplica
  });
  test('atualizar sanitiza nova descrição', function() {
    var up = global.TRANSACOES.atualizar(id, { descricao: '<b>x</b>' });
    expect(up.descricao).not.toContain('<b>');
  });
  test('atualizar id inexistente lança', function() {
    expect(function() { global.TRANSACOES.atualizar('zzz', { valor: 1 }); }).toThrow(/encontrada/);
  });
  test('atualizar com valor inválido lança', function() {
    expect(function() { global.TRANSACOES.atualizar(id, { valor: -1 }); }).toThrow();
  });
  test('deletar remove do store', function() {
    expect(global.TRANSACOES.deletar(id)).toBe(true);
    expect(global.TRANSACOES.obter({}).length).toBe(0);
  });
});

describe('TRANSACOES — resumos agregados', function() {
  beforeEach(function() {
    criar('receita', 5000, 'salario', '2026-07-01', 'Salário');
    criar('despesa', 1200, 'moradia', '2026-07-10', 'Aluguel');
    criar('despesa', 600, 'alimentacao', '2026-07-12', 'Mercado');
    criar('despesa', 300, 'alimentacao', '2026-07-20', 'Feira');
  });
  test('obterResumoMes soma receitas/despesas/saldo', function() {
    var r = global.TRANSACOES.obterResumoMes(7, 2026);
    expect(r.receitas).toBe(5000);
    expect(r.despesas).toBe(2100);
    expect(r.saldo).toBe(2900);
    expect(r.total).toBe(4);
  });
  test('obterResumoPorCategoria separa receita/despesa', function() {
    var r = global.TRANSACOES.obterResumoPorCategoria(7, 2026);
    expect(r.alimentacao.despesa).toBe(900);
    expect(r.salario.receita).toBe(5000);
  });
  test('obterPorCategoria (legado) devolve só despesas', function() {
    var r = global.TRANSACOES.obterPorCategoria(7, 2026);
    expect(r.alimentacao).toBe(900);
    expect(r.salario).toBe(0);
  });
  test('obterResumoCategoriaMes soma despesa da categoria', function() {
    expect(global.TRANSACOES.obterResumoCategoriaMes('alimentacao', 7, 2026)).toBe(900);
  });
});

describe('TRANSACOES — cache', function() {
  test('invalidateCache força releitura do store', function() {
    criar('despesa', 10, 'lazer', '2026-07-01', 'x');
    global.TRANSACOES.invalidateCache();
    expect(global.TRANSACOES._cache.length).toBe(1);
  });
});
