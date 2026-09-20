/**
 * relatorios-periodo.test.js — resumo agregado dos últimos N meses.
 *
 * Exercita RELATORIOS.resumoPeriodo REAL (via load-sources): total do período,
 * média mensal de despesa, taxa de poupança e mês mais caro — os números por
 * trás do gráfico de evolução.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

const R = () => global.RELATORIOS;

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

describe('RELATORIOS.resumoPeriodo', function() {
  test('soma receitas e despesas da janela (inclui o mês final)', function() {
    // janela 3 terminando em jul/2026 → jul, jun, mai.
    lancar({ tipo: 'receita', valor: 1000, data: '2026-05-05', categoria: 'salario' });
    lancar({ tipo: 'despesa', valor: 400, data: '2026-05-10', categoria: 'lazer' });
    lancar({ tipo: 'receita', valor: 1000, data: '2026-06-05', categoria: 'salario' });
    lancar({ tipo: 'despesa', valor: 600, data: '2026-06-10', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 200, data: '2026-07-10', categoria: 'lazer' });

    const r = R().resumoPeriodo(7, 2026, 3);
    expect(r.meses).toBe(3);
    expect(r.receitas).toBe(2000);
    expect(r.despesas).toBe(1200);
    expect(r.saldo).toBe(800);
    expect(r.mesesComDados).toBe(3);
  });

  test('janela padrão é 6 meses', function() {
    lancar({ tipo: 'despesa', valor: 100, data: '2026-07-10', categoria: 'lazer' });
    expect(R().resumoPeriodo(7, 2026).meses).toBe(6);
  });

  test('média mensal de despesa usa o tamanho da janela como denominador', function() {
    // 900 em despesa numa janela de 3 → média 300, mesmo com só 1 mês usado.
    lancar({ tipo: 'despesa', valor: 900, data: '2026-07-10', categoria: 'lazer' });
    const r = R().resumoPeriodo(7, 2026, 3);
    expect(r.mediaDespesaMensal).toBe(300);
    expect(r.mesesComDados).toBe(1);
  });

  test('taxa de poupança é (saldo / receitas) em %', function() {
    lancar({ tipo: 'receita', valor: 1000, data: '2026-07-05', categoria: 'salario' });
    lancar({ tipo: 'despesa', valor: 800, data: '2026-07-10', categoria: 'lazer' });
    const r = R().resumoPeriodo(7, 2026, 3);
    expect(r.taxaPoupanca).toBe(20); // (1000-800)/1000
  });

  test('taxa de poupança é null quando não há receita (sem divisão por zero)', function() {
    lancar({ tipo: 'despesa', valor: 300, data: '2026-07-10', categoria: 'lazer' });
    expect(R().resumoPeriodo(7, 2026, 3).taxaPoupanca).toBeNull();
  });

  test('aponta o mês de maior despesa da janela', function() {
    lancar({ tipo: 'despesa', valor: 300, data: '2026-05-10', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 900, data: '2026-06-10', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 200, data: '2026-07-10', categoria: 'lazer' });

    const r = R().resumoPeriodo(7, 2026, 3);
    expect(r.maiorDespesaMes).toEqual({ mes: 6, ano: 2026, despesas: 900 });
  });

  test('a janela atravessa a virada de ano', function() {
    // janela 3 terminando em jan/2026 → jan/26, dez/25, nov/25.
    lancar({ tipo: 'despesa', valor: 100, data: '2025-11-10', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 700, data: '2025-12-10', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 50, data: '2026-01-10', categoria: 'lazer' });

    const r = R().resumoPeriodo(1, 2026, 3);
    expect(r.despesas).toBe(850);
    expect(r.maiorDespesaMes).toEqual({ mes: 12, ano: 2025, despesas: 700 });
  });

  test('soma em centavos exatos, sem deriva de float', function() {
    lancar({ tipo: 'despesa', valor: 0.10, data: '2026-06-01', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 0.20, data: '2026-07-01', categoria: 'lazer' });
    expect(R().resumoPeriodo(7, 2026, 3).despesas).toBe(0.30);
  });

  test('período totalmente vazio devolve zeros e maiorDespesaMes null', function() {
    const r = R().resumoPeriodo(7, 2026, 3);
    expect(r.receitas).toBe(0);
    expect(r.despesas).toBe(0);
    expect(r.saldo).toBe(0);
    expect(r.maiorDespesaMes).toBeNull();
    expect(r.taxaPoupanca).toBeNull();
    expect(r.mesesComDados).toBe(0);
  });
});
