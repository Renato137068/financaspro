/**
 * relatorios-dia-semana.test.js — padrão de gastos por dia da semana.
 *
 * RELATORIOS.gastoPorDiaSemana soma a despesa do mês por dia da semana
 * (domingo→sábado). Só despesa; centavos inteiros; o dia da semana é lido em
 * componentes locais para não escorregar de dia no fuso do Brasil.
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

describe('RELATORIOS.gastoPorDiaSemana', function() {
  test('devolve sempre 7 posições, de Dom a Sáb', function() {
    const r = R().gastoPorDiaSemana(3, 2026);
    expect(r).toHaveLength(7);
    expect(r.map(function(d) { return d.label; })).toEqual(['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']);
    expect(r.every(function(d) { return d.total === 0 && d.transacoes === 0; })).toBe(true);
  });

  test('soma a despesa no dia da semana correto (data local, sem UTC shift)', function() {
    // 2026-03-07 é um SÁBADO (índice 6); 2026-03-02 é uma SEGUNDA (índice 1).
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-07', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 40, data: '2026-03-02', categoria: 'transporte' });

    const r = R().gastoPorDiaSemana(3, 2026);
    expect(r[6]).toMatchObject({ label: 'Sáb', total: 100, transacoes: 1 });
    expect(r[1]).toMatchObject({ label: 'Seg', total: 40, transacoes: 1 });
  });

  test('acumula vários lançamentos no mesmo dia da semana', function() {
    // 07 e 14 de março/2026 são ambos sábados.
    lancar({ tipo: 'despesa', valor: 30, data: '2026-03-07', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 20, data: '2026-03-14', categoria: 'lazer' });

    const sab = R().gastoPorDiaSemana(3, 2026)[6];
    expect(sab.total).toBe(50);
    expect(sab.transacoes).toBe(2);
  });

  test('ignora receita e transferência (só despesa)', function() {
    lancar({ tipo: 'receita', valor: 5000, data: '2026-03-07', categoria: 'salario' });
    lancar({ tipo: 'despesa', valor: 80, data: '2026-03-07', categoria: 'lazer' });

    expect(R().gastoPorDiaSemana(3, 2026)[6].total).toBe(80);
  });

  test('soma em centavos exatos, sem deriva de float', function() {
    // 0,10 + 0,20 no mesmo sábado = 0,30, não 0,30000000000000004.
    lancar({ tipo: 'despesa', valor: 0.10, data: '2026-03-07', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 0.20, data: '2026-03-14', categoria: 'lazer' });

    expect(R().gastoPorDiaSemana(3, 2026)[6].total).toBe(0.30);
  });

  test('só conta lançamentos do mês consultado', function() {
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-07', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 999, data: '2026-04-04', categoria: 'lazer' });

    const total = R().gastoPorDiaSemana(3, 2026).reduce(function(s, d) { return s + d.total; }, 0);
    expect(total).toBe(100);
  });
});
