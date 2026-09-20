/**
 * relatorios-ritmo-gasto.test.js — ritmo de gastos até o dia D.
 *
 * RELATORIOS.ritmoGasto compara a despesa acumulada do mês até o dia D com o
 * mesmo ponto do mês anterior. D = dia de hoje quando o mês é o corrente; senão
 * o último dia do mês. Só despesa; centavos inteiros; dia lido em componentes
 * locais (sem UTC shift).
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

const R = () => global.RELATORIOS;

function lancar({ tipo, valor, data, descricao }) {
  global.DADOS.salvarTransacao({
    id: global.UTILS.gerarId(),
    tipo, valor, data,
    categoria: 'outro',
    descricao: descricao || 'teste',
  });
  global.TRANSACOES._cache = null;
  global.TRANSACOES._cacheTimestamp = null;
}

beforeEach(function() {
  resetFixtures();
});

describe('RELATORIOS.ritmoGasto', function() {
  test('mês corrente: acumula só até o dia de hoje', function() {
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-10' });
    lancar({ tipo: 'despesa', valor: 999, data: '2026-03-25' }); // depois de hoje (dia 15)
    lancar({ tipo: 'despesa', valor: 50, data: '2026-02-08' });  // mês anterior, até dia 15

    const hoje = new Date(2026, 2, 15); // 15/mar/2026
    const r = R().ritmoGasto(3, 2026, hoje);
    expect(r.dia).toBe(15);
    expect(r.atual).toBe(100);       // 999 do dia 25 fica de fora
    expect(r.anterior).toBe(50);
    expect(r.diff).toBe(50);
    expect(r.variacao).toBe(100);    // gastou o dobro no mesmo ponto
  });

  test('mês passado (não corrente): usa o mês inteiro', function() {
    lancar({ tipo: 'despesa', valor: 300, data: '2026-01-31' });
    lancar({ tipo: 'despesa', valor: 100, data: '2025-12-31' });

    const hoje = new Date(2026, 2, 15); // março; consultando janeiro
    const r = R().ritmoGasto(1, 2026, hoje);
    expect(r.dia).toBe(31);           // último dia de janeiro
    expect(r.atual).toBe(300);
    expect(r.anterior).toBe(100);     // dezembro inteiro
  });

  test('mês anterior mais curto: o dia de corte é limitado (31→28)', function() {
    // Consultando março no dia 31; fevereiro/2026 só tem 28 dias.
    lancar({ tipo: 'despesa', valor: 200, data: '2026-03-31' });
    lancar({ tipo: 'despesa', valor: 70, data: '2026-02-28' });

    const hoje = new Date(2026, 2, 31); // 31/mar/2026
    const r = R().ritmoGasto(3, 2026, hoje);
    expect(r.dia).toBe(31);
    expect(r.atual).toBe(200);
    expect(r.anterior).toBe(70);      // 28/fev entra (corte limitado a 28)
  });

  test('vira o ano ao buscar o mês anterior (janeiro → dezembro)', function() {
    lancar({ tipo: 'despesa', valor: 40, data: '2026-01-05' });
    lancar({ tipo: 'despesa', valor: 10, data: '2025-12-05' });

    const hoje = new Date(2026, 0, 10); // 10/jan/2026
    const r = R().ritmoGasto(1, 2026, hoje);
    expect(r.atual).toBe(40);
    expect(r.anterior).toBe(10);
  });

  test('sem base no mês anterior: variacao é null', function() {
    lancar({ tipo: 'despesa', valor: 40, data: '2026-03-05' });
    const r = R().ritmoGasto(3, 2026, new Date(2026, 2, 15));
    expect(r.anterior).toBe(0);
    expect(r.variacao).toBeNull();
    expect(r.diff).toBe(40);
  });

  test('ignora receita e transferência (só despesa)', function() {
    lancar({ tipo: 'receita', valor: 5000, data: '2026-03-05' });
    lancar({ tipo: 'despesa', valor: 80, data: '2026-03-05' });
    const r = R().ritmoGasto(3, 2026, new Date(2026, 2, 15));
    expect(r.atual).toBe(80);
  });

  test('soma em centavos exatos, sem deriva de float', function() {
    lancar({ tipo: 'despesa', valor: 0.10, data: '2026-03-05' });
    lancar({ tipo: 'despesa', valor: 0.20, data: '2026-03-06' });
    const r = R().ritmoGasto(3, 2026, new Date(2026, 2, 15));
    expect(r.atual).toBe(0.30);
  });

  test('gasto abaixo do mês passado dá diff e variacao negativos', function() {
    lancar({ tipo: 'despesa', valor: 30, data: '2026-03-05' });
    lancar({ tipo: 'despesa', valor: 120, data: '2026-02-05' });
    const r = R().ritmoGasto(3, 2026, new Date(2026, 2, 15));
    expect(r.diff).toBe(-90);
    expect(r.variacao).toBe(-75);
  });

  test('sem lançamento algum devolve zeros e variacao null', function() {
    const r = R().ritmoGasto(3, 2026, new Date(2026, 2, 15));
    expect(r).toMatchObject({ atual: 0, anterior: 0, diff: 0, variacao: null });
  });
});
