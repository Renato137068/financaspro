/**
 * budgetService-real.test.js — exercita js/services/budgetService.js REAL.
 *
 * O budget.test.js existente roda uma CÓPIA inline da lógica (0% de cobertura
 * do módulo real, e ainda soma valor em float). Este carrega o módulo de
 * produção num contexto vm — com o transactionService real como dependência —
 * para travar as regras de orçamento (dinheiro) contra regressão.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadBudgetService() {
  const ctx = vm.createContext({ Date, Math, Number, String, Array, Object, JSON, parseFloat });
  // Dependência real: calculateSpent(mes,ano) usa TRANSACTION_SERVICE.
  const tsFile = path.join(__dirname, '..', 'js', 'services', 'transactionService.js');
  vm.runInContext(fs.readFileSync(tsFile, 'utf8'), ctx, { filename: tsFile });
  const bsFile = path.join(__dirname, '..', 'js', 'services', 'budgetService.js');
  vm.runInContext(fs.readFileSync(bsFile, 'utf8'), ctx, { filename: bsFile });
  return ctx.BUDGET_SERVICE;
}
const BS = loadBudgetService();

describe('BUDGET_SERVICE.setBudget / removeBudget', () => {
  test('define limite com carimbo de data e não muta o objeto original', () => {
    const base = {};
    const next = BS.setBudget(base, 'mercado', 500, '2026-03-01T00:00:00.000Z');
    expect(next.mercado.limite).toBe(500);
    expect(next.mercado.definidoEm).toBe('2026-03-01T00:00:00.000Z');
    expect(base).toEqual({}); // imutável
  });

  test('aceita limite em string com vírgula (pt-BR)', () => {
    const next = BS.setBudget({}, 'lazer', '1.234,50'.replace('.', ''));
    // "1234,50" → 1234.5
    expect(next.lazer.limite).toBeCloseTo(1234.5, 2);
  });

  test('recusa limite <= 0 ou inválido', () => {
    expect(() => BS.setBudget({}, 'x', 0)).toThrow(/maior que 0/);
    expect(() => BS.setBudget({}, 'x', -5)).toThrow(/maior que 0/);
    expect(() => BS.setBudget({}, 'x', 'abc')).toThrow(/maior que 0/);
  });

  test('recusa categoria vazia', () => {
    expect(() => BS.setBudget({}, '   ', 100)).toThrow(/Categoria/);
  });

  test('remove um limite sem mutar o original', () => {
    const base = BS.setBudget({}, 'mercado', 500);
    const next = BS.removeBudget(base, 'mercado');
    expect(next.mercado).toBeUndefined();
    expect(base.mercado).toBeDefined();
  });
});

describe('BUDGET_SERVICE.avaliar (status em centavos)', () => {
  test('limite <= 0 devolve status ok neutro', () => {
    expect(BS.avaliar(100, 0)).toEqual({ percentual: 0, status: 'ok', restante: 0 });
  });

  test('abaixo de 80% é ok', () => {
    const r = BS.avaliar(50, 100);
    expect(r.status).toBe('ok');
    expect(r.percentual).toBe(50);
    expect(r.restante).toBe(50);
  });

  test('entre 80% e 99% é alerta e o percentual é limitado a 99', () => {
    const r = BS.avaliar(99.6, 100); // 99,6% → não estourou
    expect(r.status).toBe('alerta');
    expect(r.percentual).toBe(99); // nunca 100 antes de estourar
  });

  test('80% exato já é alerta', () => {
    expect(BS.avaliar(80, 100).status).toBe('alerta');
  });

  test('atingir o limite é excedido e mostra o percentual real', () => {
    const r = BS.avaliar(150, 100);
    expect(r.status).toBe('excedido');
    expect(r.percentual).toBe(150);
    expect(r.restante).toBe(0);
  });

  test('soma em centavos: 0,10+0,20 vs 0,30 não estoura por float', () => {
    // gasto 0,30 contra limite 0,30 → exatamente no limite (excedido), 100%.
    const r = BS.avaliar(0.30, 0.30);
    expect(r.status).toBe('excedido');
    expect(r.percentual).toBe(100);
  });
});

describe('BUDGET_SERVICE.getStatus / getAllStatus', () => {
  const budgets = {
    mercado: { limite: 500 },
    lazer: { limite: 100 },
    quebrado: { limite: 0 }, // limite inválido vindo de sync/legado
  };
  const txs = [
    { tipo: 'despesa', categoria: 'mercado', valor: 450, data: '2026-03-05' },
    { tipo: 'despesa', categoria: 'lazer', valor: 120, data: '2026-03-06' },
    { tipo: 'despesa', categoria: 'mercado', valor: 100, data: '2026-02-01' }, // outro mês
    { tipo: 'receita', categoria: 'mercado', valor: 999, data: '2026-03-07' }, // receita ignorada
  ];

  test('status por categoria no mês (gasto só do mês, só despesa)', () => {
    const s = BS.getStatus(budgets, txs, 'mercado', 3, 2026);
    expect(s.gasto).toBe(450); // ignora fev e a receita
    expect(s.limite).toBe(500);
    expect(s.status).toBe('alerta'); // 90%
  });

  test('limite inválido degrada para sem-limite (não derruba a seção)', () => {
    const s = BS.getStatus(budgets, txs, 'quebrado', 3, 2026);
    expect(s.status).toBe('sem-limite');
    expect(s.limite).toBeNull();
    expect(s.gasto).toBe(0);
  });

  test('categoria sem orçamento cadastrado é sem-limite', () => {
    expect(BS.getStatus(budgets, txs, 'inexistente', 3, 2026).status).toBe('sem-limite');
  });

  test('excedido quando o gasto do mês passa do limite', () => {
    expect(BS.getStatus(budgets, txs, 'lazer', 3, 2026).status).toBe('excedido'); // 120/100
  });

  test('getAllStatus cobre todas as categorias do orçamento', () => {
    const all = BS.getAllStatus(budgets, txs, 3, 2026);
    expect(all.map(function(s) { return s.categoria; }).sort()).toEqual(['lazer', 'mercado', 'quebrado']);
  });

  test('getAllStatus de orçamento vazio é lista vazia', () => {
    expect(BS.getAllStatus({}, txs, 3, 2026)).toEqual([]);
  });
});

describe('BUDGET_SERVICE.calculateSpent', () => {
  const txs = [
    { tipo: 'despesa', categoria: 'mercado', valor: 0.10, data: '2026-03-01' },
    { tipo: 'despesa', categoria: 'mercado', valor: 0.20, data: '2026-03-02' },
    { tipo: 'despesa', categoria: 'lazer', valor: 50, data: '2026-03-03' },
  ];

  test('sem mês/ano soma todas as despesas da categoria (em centavos)', () => {
    expect(BS.calculateSpent(txs, 'mercado')).toBe(0.30); // não 0.30000000000000004
  });

  test('lista inválida não estoura', () => {
    expect(BS.calculateSpent(null, 'mercado')).toBe(0);
  });
});
