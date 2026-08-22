/**
 * relatorios-real.test.js — exercita js/relatorios.js REAL.
 *
 * Substitui `relatorios.test.js`, que recalculava o resumo inline. O resumo
 * mensal é o número que abre o app: se ele diverge do extrato, o usuário perde
 * a confiança em tudo o mais.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

const R = () => global.RELATORIOS;

/** Insere uma transação no fixture e invalida o cache de TRANSACOES. */
function lancar({ tipo, valor, data, categoria }) {
  global.DADOS.salvarTransacao({
    id: global.UTILS.gerarId(),
    tipo, valor, data, categoria,
    descricao: categoria || 'teste',
  });
  global.TRANSACOES._cache = null;
  global.TRANSACOES._cacheTimestamp = null;
}

beforeEach(function() {
  resetFixtures();
});

describe('RELATORIOS.resumoMes', function() {
  test('mês sem lançamentos devolve zeros, não null', function() {
    const r = R().resumoMes(3, 2026);

    expect(r.receitas).toBe(0);
    expect(r.despesas).toBe(0);
    expect(r.saldo).toBe(0);
    expect(r.transacoes).toBe(0);
    expect(r.topCategorias).toEqual([]);
  });

  test('soma receitas e despesas do mês', function() {
    lancar({ tipo: 'receita', valor: 5000, data: '2026-03-05', categoria: 'salario' });
    lancar({ tipo: 'despesa', valor: 1200, data: '2026-03-10', categoria: 'moradia' });
    lancar({ tipo: 'despesa', valor: 300, data: '2026-03-15', categoria: 'alimentacao' });

    const r = R().resumoMes(3, 2026);

    expect(r.receitas).toBe(5000);
    expect(r.despesas).toBe(1500);
    expect(r.saldo).toBe(3500);
    expect(r.transacoes).toBe(3);
  });

  test('ignora lançamentos de outros meses', function() {
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-10', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 999, data: '2026-04-10', categoria: 'lazer' });

    expect(R().resumoMes(3, 2026).despesas).toBe(100);
  });

  test('ignora lançamentos do mesmo mês em outro ano', function() {
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-10', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 555, data: '2025-03-10', categoria: 'lazer' });

    expect(R().resumoMes(3, 2026).despesas).toBe(100);
  });

  test('saldo negativo é reportado como negativo', function() {
    lancar({ tipo: 'receita', valor: 1000, data: '2026-03-05', categoria: 'salario' });
    lancar({ tipo: 'despesa', valor: 1800, data: '2026-03-10', categoria: 'moradia' });

    expect(R().resumoMes(3, 2026).saldo).toBe(-800);
  });

  test('agrupa despesas por categoria e ordena da maior para a menor', function() {
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-01', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 800, data: '2026-03-02', categoria: 'moradia' });
    lancar({ tipo: 'despesa', valor: 400, data: '2026-03-03', categoria: 'alimentacao' });

    const top = R().resumoMes(3, 2026).topCategorias;

    expect(top.map(c => c.categoria)).toEqual(['moradia', 'alimentacao', 'lazer']);
    expect(top[0].valor).toBe(800);
  });

  test('soma múltiplos lançamentos da mesma categoria', function() {
    lancar({ tipo: 'despesa', valor: 200, data: '2026-03-01', categoria: 'alimentacao' });
    lancar({ tipo: 'despesa', valor: 300, data: '2026-03-08', categoria: 'alimentacao' });

    const top = R().resumoMes(3, 2026).topCategorias;

    expect(top).toHaveLength(1);
    expect(top[0].valor).toBe(500);
  });

  test('limita a cinco categorias — o resumo é resumo', function() {
    ['a', 'b', 'c', 'd', 'e', 'f', 'g'].forEach((cat, i) => {
      lancar({ tipo: 'despesa', valor: (i + 1) * 10, data: '2026-03-05', categoria: cat });
    });

    expect(R().resumoMes(3, 2026).topCategorias).toHaveLength(5);
  });

  test('percentual é calculado sobre o total de despesas', function() {
    lancar({ tipo: 'despesa', valor: 750, data: '2026-03-01', categoria: 'moradia' });
    lancar({ tipo: 'despesa', valor: 250, data: '2026-03-02', categoria: 'lazer' });

    const top = R().resumoMes(3, 2026).topCategorias;

    expect(top[0].percentual).toBe(75);
    expect(top[1].percentual).toBe(25);
  });

  test('receita não entra no rateio de categorias de despesa', function() {
    lancar({ tipo: 'receita', valor: 9000, data: '2026-03-01', categoria: 'salario' });
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-02', categoria: 'lazer' });

    const top = R().resumoMes(3, 2026).topCategorias;

    expect(top).toHaveLength(1);
    expect(top[0].categoria).toBe('lazer');
    expect(top[0].percentual).toBe(100);
  });

  test('despesa sem categoria é agrupada em "outro"', function() {
    lancar({ tipo: 'despesa', valor: 50, data: '2026-03-01', categoria: null });

    expect(R().resumoMes(3, 2026).topCategorias[0].categoria).toBe('outro');
  });

  test('devolve mês e ano consultados', function() {
    const r = R().resumoMes(7, 2026);
    expect(r.mes).toBe(7);
    expect(r.ano).toBe(2026);
  });
});

describe('RELATORIOS.compararMesAnterior', function() {
  test('calcula as diferenças entre os dois meses', function() {
    lancar({ tipo: 'receita', valor: 1000, data: '2026-02-05', categoria: 'salario' });
    lancar({ tipo: 'despesa', valor: 400, data: '2026-02-10', categoria: 'lazer' });
    lancar({ tipo: 'receita', valor: 1500, data: '2026-03-05', categoria: 'salario' });
    lancar({ tipo: 'despesa', valor: 300, data: '2026-03-10', categoria: 'lazer' });

    const c = R().compararMesAnterior(3, 2026);

    expect(c.diffReceitas).toBe(500);
    expect(c.diffDespesas).toBe(-100);   // gastou menos
    expect(c.diffSaldo).toBe(600);
  });

  test('janeiro compara com dezembro do ano anterior', function() {
    // Vira de ano é o erro clássico: comparar janeiro com "mês 0".
    lancar({ tipo: 'despesa', valor: 700, data: '2025-12-20', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 200, data: '2026-01-10', categoria: 'lazer' });

    const c = R().compararMesAnterior(1, 2026);

    expect(c.anterior.mes).toBe(12);
    expect(c.anterior.ano).toBe(2025);
    expect(c.anterior.despesas).toBe(700);
    expect(c.diffDespesas).toBe(-500);
  });

  test('meses vazios comparam sem erro', function() {
    const c = R().compararMesAnterior(6, 2026);

    expect(c.diffReceitas).toBe(0);
    expect(c.diffDespesas).toBe(0);
    expect(c.diffSaldo).toBe(0);
  });

  test('devolve os dois resumos completos, não só as diferenças', function() {
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-01', categoria: 'lazer' });

    const c = R().compararMesAnterior(3, 2026);

    expect(c.atual.mes).toBe(3);
    expect(c.anterior.mes).toBe(2);
    expect(c.atual.topCategorias).toBeDefined();
  });
});
