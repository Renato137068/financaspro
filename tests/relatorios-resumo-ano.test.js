/**
 * relatorios-resumo-ano.test.js — retrospectiva do ano civil.
 *
 * RELATORIOS.resumoAno agrega os 12 meses do ano: total de receitas/despesas/
 * saldo, média de despesa por mês ATIVO, taxa de poupança, meses mais caro e
 * mais econômico, e a série dos 12 meses. Tudo em centavos inteiros.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

const R = () => global.RELATORIOS;

function lancar({ tipo, valor, data }) {
  global.DADOS.salvarTransacao({
    id: global.UTILS.gerarId(),
    tipo, valor, data,
    categoria: 'outro',
    descricao: 'teste',
  });
  global.TRANSACOES._cache = null;
  global.TRANSACOES._cacheTimestamp = null;
}

beforeEach(function() {
  resetFixtures();
});

describe('RELATORIOS.resumoAno', function() {
  test('ano sem lançamentos: zeros, 12 meses, sem mês caro/barato', function() {
    const r = R().resumoAno(2026);
    expect(r.receitas).toBe(0);
    expect(r.despesas).toBe(0);
    expect(r.saldo).toBe(0);
    expect(r.mesesComDados).toBe(0);
    expect(r.mediaDespesaMensal).toBe(0);
    expect(r.taxaPoupanca).toBeNull();
    expect(r.maiorDespesaMes).toBeNull();
    expect(r.menorDespesaMes).toBeNull();
    expect(r.meses).toHaveLength(12);
  });

  test('agrega receitas, despesas e saldo do ano inteiro', function() {
    lancar({ tipo: 'receita', valor: 1000, data: '2026-01-10' });
    lancar({ tipo: 'despesa', valor: 300, data: '2026-01-15' });
    lancar({ tipo: 'despesa', valor: 200, data: '2026-06-15' });

    const r = R().resumoAno(2026);
    expect(r.receitas).toBe(1000);
    expect(r.despesas).toBe(500);
    expect(r.saldo).toBe(500);
  });

  test('média mensal divide pelos meses ativos, não por 12', function() {
    // Despesa em 2 meses (jan e jun): média = 500 / 2 = 250.
    lancar({ tipo: 'despesa', valor: 300, data: '2026-01-15' });
    lancar({ tipo: 'despesa', valor: 200, data: '2026-06-15' });

    const r = R().resumoAno(2026);
    expect(r.mesesComDados).toBe(2);
    expect(r.mediaDespesaMensal).toBe(250);
  });

  test('taxa de poupança = saldo / receitas', function() {
    lancar({ tipo: 'receita', valor: 1000, data: '2026-01-10' });
    lancar({ tipo: 'despesa', valor: 250, data: '2026-01-15' });
    expect(R().resumoAno(2026).taxaPoupanca).toBe(75);
  });

  test('identifica o mês mais caro e o mais econômico', function() {
    lancar({ tipo: 'despesa', valor: 100, data: '2026-02-10' });
    lancar({ tipo: 'despesa', valor: 900, data: '2026-05-10' });
    lancar({ tipo: 'despesa', valor: 400, data: '2026-09-10' });

    const r = R().resumoAno(2026);
    expect(r.maiorDespesaMes).toMatchObject({ mes: 5, despesas: 900 });
    expect(r.menorDespesaMes).toMatchObject({ mes: 2, despesas: 100 });
  });

  test('com hoje no ano corrente, o mês em curso não vira "mais econômico"', function() {
    // Fevereiro fechado com gasto alto; setembro (mês corrente) baixo por estar
    // pela metade. Sem o corte, setembro apareceria como o mais econômico.
    lancar({ tipo: 'despesa', valor: 900, data: '2026-02-10' });
    lancar({ tipo: 'despesa', valor: 400, data: '2026-05-10' });
    lancar({ tipo: 'despesa', valor: 50, data: '2026-09-03' });

    const hoje = new Date(2026, 8, 15); // 15/set/2026
    const r = R().resumoAno(2026, hoje);
    // O mês corrente (set) fica fora da disputa de maior/menor.
    expect(r.menorDespesaMes).toMatchObject({ mes: 5, despesas: 400 });
    expect(r.maiorDespesaMes).toMatchObject({ mes: 2, despesas: 900 });
    // Mas o gasto de setembro segue no total.
    expect(r.despesas).toBe(1350);
  });

  test('sem hoje, todos os meses disputam (comportamento puro)', function() {
    lancar({ tipo: 'despesa', valor: 900, data: '2026-02-10' });
    lancar({ tipo: 'despesa', valor: 50, data: '2026-09-03' });
    const r = R().resumoAno(2026);
    expect(r.menorDespesaMes).toMatchObject({ mes: 9, despesas: 50 });
  });

  test('série meses traz os 12, com valores no mês certo', function() {
    lancar({ tipo: 'despesa', valor: 80, data: '2026-03-10' });
    const r = R().resumoAno(2026);
    expect(r.meses).toHaveLength(12);
    expect(r.meses[2]).toMatchObject({ mes: 3, despesas: 80, transacoes: 1 });
    expect(r.meses[0]).toMatchObject({ mes: 1, despesas: 0, transacoes: 0 });
  });

  test('não mistura anos: só conta o ano consultado', function() {
    lancar({ tipo: 'despesa', valor: 100, data: '2026-01-10' });
    lancar({ tipo: 'despesa', valor: 999, data: '2025-12-10' });
    expect(R().resumoAno(2026).despesas).toBe(100);
  });

  test('soma em centavos exatos, sem deriva de float', function() {
    lancar({ tipo: 'despesa', valor: 0.10, data: '2026-01-10' });
    lancar({ tipo: 'despesa', valor: 0.20, data: '2026-02-10' });
    expect(R().resumoAno(2026).despesas).toBe(0.30);
  });
});
