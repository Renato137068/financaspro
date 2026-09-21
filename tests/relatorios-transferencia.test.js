/**
 * relatorios-transferencia.test.js — transferência não é gasto no relatório.
 *
 * RELATORIOS.resumoMes alimenta o "meu mês em números", o comparativo mês a
 * mês, a retrospectiva do ano e a projeção. Uma transferência entre contas do
 * próprio usuário não é receita nem despesa: o dinheiro só muda de lugar.
 * Contá-la como despesa inflava o gasto do mês em todas essas telas — e a
 * categoria "transferencia" ainda poluía o top de categorias.
 *
 * TRANSACOES.obterResumoMes já ignorava a transferência (ver
 * transferencias.test.js); este teste garante a mesma honestidade no RELATORIOS.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

beforeEach(function() {
  resetFixtures();
  global.DADOS._modoLocal = true;
});

describe('RELATORIOS.resumoMes ignora transferências', function() {
  beforeEach(function() {
    global.TRANSACOES.criar('receita', 5000, 'salario', '2026-08-01', 'Salário', 'Corrente', '');
    global.TRANSACOES.criar('despesa', 800, 'alimentacao', '2026-08-02', 'Mercado', 'Corrente', '');
    global.TRANSACOES.criarTransferencia({
      valor: 2000, data: '2026-08-03', origem: 'Corrente', destino: 'Poupança',
    });
  });

  test('a despesa do mês é só o gasto real, não a transferência', function() {
    var r = global.RELATORIOS.resumoMes(8, 2026);
    expect(r.despesas).toBe(800);
    expect(r.receitas).toBe(5000);
    expect(r.saldo).toBe(4200);
  });

  test('a transferência não vira uma categoria de gasto', function() {
    var r = global.RELATORIOS.resumoMes(8, 2026);
    var cats = r.topCategorias.map(function(c) { return c.categoria; });
    expect(cats).not.toContain('transferencia');
    expect(cats).toContain('alimentacao');
  });

  test('os percentuais por categoria usam só a despesa real', function() {
    var r = global.RELATORIOS.resumoMes(8, 2026);
    var alim = r.topCategorias.filter(function(c) { return c.categoria === 'alimentacao'; })[0];
    // 800 de 800 = 100%. Se a transferência entrasse no total, cairia para ~29%.
    expect(alim.percentual).toBe(100);
  });

  test('o comparativo mês a mês não herda a transferência como gasto', function() {
    var cmp = global.RELATORIOS.compararMesAnterior(8, 2026);
    expect(cmp.atual.despesas).toBe(800);
  });

  test('a média por categoria não cria uma linha de base "transferencia"', function() {
    var lista = global.RELATORIOS.mediaPorCategoria(8, 2026, 3);
    var cats = lista.map(function(c) { return c.categoria; });
    expect(cats).not.toContain('transferencia');
    expect(cats).toContain('alimentacao');
  });
});
