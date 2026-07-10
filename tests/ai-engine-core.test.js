/**
 * ai-engine-core.test.js — trava o núcleo matemático do motor financeiro.
 * Funções puras que alimentam TODOS os insights que o usuário vê.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAiEngine() {
  const ctx = vm.createContext({ Date, Math, Number, String, Array, Object, JSON });
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-engine.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'ai-engine.js' });
  return ctx.AI_ENGINE;
}
const AI = loadAiEngine();

describe('AI_ENGINE.agregarPorMes', () => {
  const txs = [
    { tipo: 'receita', valor: 1000, data: '2026-01-05', categoria: 'salario' },
    { tipo: 'despesa', valor: 300,  data: '2026-01-10', categoria: 'mercado' },
    { tipo: 'despesa', valor: 200,  data: '2026-02-03', categoria: 'mercado' },
  ];
  test('agrupa por mês com saldo e contagem', () => {
    const r = AI.agregarPorMes(txs);
    expect(r['2026-01']).toEqual({ receitas: 1000, despesas: 300, saldo: 700, count: 2 });
    expect(r['2026-02'].saldo).toBe(-200);
    expect(r['2026-02'].count).toBe(1);
  });
  test('entrada inválida => {}', () => {
    expect(AI.agregarPorMes(null)).toEqual({});
  });
});

describe('AI_ENGINE.agregarPorCategoria', () => {
  const txs = [
    { tipo: 'receita', valor: 1000, data: '2026-01-05', categoria: 'salario' },
    { tipo: 'despesa', valor: 300,  data: '2026-01-10', categoria: 'mercado' },
    { tipo: 'despesa', valor: 200,  data: '2026-02-03', categoria: 'mercado' },
  ];
  test('filtra pelo mês e separa receita/despesa', () => {
    const r = AI.agregarPorCategoria(txs, '2026-01');
    expect(r.salario.receitas).toBe(1000);
    expect(r.mercado.despesas).toBe(300);
    expect(r.mercado.count).toBe(1);
    expect(r['2026-02'] === undefined).toBe(true);
  });
});

describe('AI_ENGINE.estatisticas', () => {
  test('média e desvio padrão populacional', () => {
    const r = AI.estatisticas([2, 4, 4, 4, 5, 5, 7, 9]);
    expect(r.media).toBe(5);
    expect(r.desvio).toBeCloseTo(2, 6);
  });
  test('array vazio => zeros', () => {
    expect(AI.estatisticas([])).toEqual({ media: 0, desvio: 0 });
  });
});

describe('AI_ENGINE.regressaoLinear', () => {
  test('linha perfeita crescente', () => {
    const r = AI.regressaoLinear([10, 20, 30]);
    expect(r.slope).toBeCloseTo(10, 6);
    expect(r.intercept).toBeCloseTo(10, 6);
    expect(r.r2).toBeCloseTo(1, 6);
  });
  test('linha plana: slope 0, r2 0', () => {
    const r = AI.regressaoLinear([50, 50, 50]);
    expect(r.slope).toBe(0);
    expect(r.intercept).toBe(50);
    expect(r.r2).toBe(0);
  });
  test('menos de 2 pontos => fallback', () => {
    expect(AI.regressaoLinear([7])).toEqual({ slope: 0, intercept: 7, r2: 0 });
  });
});

describe('AI_ENGINE.topCategorias', () => {
  const txs = [
    { tipo: 'despesa', valor: 300, data: '2026-01-10', categoria: 'mercado' },
    { tipo: 'despesa', valor: 100, data: '2026-01-11', categoria: 'transporte' },
    { tipo: 'receita', valor: 999, data: '2026-01-01', categoria: 'salario' },
  ];
  test('ordena por gasto, calcula percentual, ignora receita', () => {
    const r = AI.topCategorias(txs, '2026-01', 5);
    expect(r.map((x) => x.categoria)).toEqual(['mercado', 'transporte']);
    expect(r[0].percentual).toBe(75);
    expect(r[1].percentual).toBe(25);
    expect(r.find((x) => x.categoria === 'salario')).toBeUndefined();
  });
  test('respeita o limite top', () => {
    expect(AI.topCategorias(txs, '2026-01', 1)).toHaveLength(1);
  });
});

describe('AI_ENGINE.compararCategoriasMoM', () => {
  const txs = [
    // anterior (2026-01)
    { tipo: 'despesa', valor: 100, data: '2026-01-05', categoria: 'delivery' },
    { tipo: 'despesa', valor: 150, data: '2026-01-06', categoria: 'mercado' },
    { tipo: 'despesa', valor: 50,  data: '2026-01-07', categoria: 'extra' },
    // atual (2026-02)
    { tipo: 'despesa', valor: 200, data: '2026-02-05', categoria: 'delivery' },
    { tipo: 'despesa', valor: 100, data: '2026-02-06', categoria: 'mercado' },
    { tipo: 'despesa', valor: 80,  data: '2026-02-07', categoria: 'streaming' },
  ];
  const r = AI.compararCategoriasMoM(txs, '2026-02');
  const byCat = Object.fromEntries(r.map((x) => [x.categoria, x]));
  test('ordena por gasto atual desc', () => {
    expect(r.map((x) => x.categoria)).toEqual(['delivery', 'mercado', 'streaming', 'extra']);
  });
  test('delivery subiu 100%', () => {
    expect(byCat.delivery.variacao).toBe(100);
    expect(byCat.delivery.tendencia).toBe('subindo');
  });
  test('mercado caiu ~33%', () => {
    expect(byCat.mercado.variacao).toBe(-33);
    expect(byCat.mercado.tendencia).toBe('caindo');
  });
  test('streaming é novo (sem mês anterior)', () => {
    expect(byCat.streaming.variacao).toBeNull();
    expect(byCat.streaming.tendencia).toBe('novo');
  });
  test('extra sumiu (atual 0, anterior 50)', () => {
    expect(byCat.extra.atual).toBe(0);
    expect(byCat.extra.tendencia).toBe('caindo');
  });
  test('janeiro compara com dezembro do ano anterior', () => {
    const t2 = [
      { tipo: 'despesa', valor: 40, data: '2025-12-20', categoria: 'luz' },
      { tipo: 'despesa', valor: 60, data: '2026-01-20', categoria: 'luz' },
    ];
    const rr = AI.compararCategoriasMoM(t2, '2026-01');
    expect(rr[0].anterior).toBe(40);
    expect(rr[0].atual).toBe(60);
  });
});

describe('AI_ENGINE.detectarPadroesRecorrentes', () => {
  test('detecta despesa que aparece em >=3 meses', () => {
    const txs = ['2026-01', '2026-02', '2026-03'].map((m) => ({
      tipo: 'despesa', valor: 29.9, data: m + '-08', descricao: 'Assinatura X',
    }));
    const r = AI.detectarPadroesRecorrentes(txs);
    expect(r.length).toBeGreaterThanOrEqual(1);
    expect(r[0].meses).toBe(3);
    expect(r[0].valorMedio).toBeCloseTo(29.9, 2);
  });
  test('ignora quem aparece em menos de 3 meses', () => {
    const txs = ['2026-01', '2026-02'].map((m) => ({
      tipo: 'despesa', valor: 10, data: m + '-08', descricao: 'Curtos',
    }));
    expect(AI.detectarPadroesRecorrentes(txs)).toEqual([]);
  });
});
