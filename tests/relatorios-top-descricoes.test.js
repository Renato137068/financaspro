/**
 * relatorios-top-descricoes.test.js — ranking de despesas por descrição.
 *
 * RELATORIOS.topDescricoes junta as despesas do mês por descrição normalizada
 * ("Uber", "uber " e "UBER" viram um item), soma em centavos inteiros e ordena
 * pelo maior gasto. Só despesa; sem descrição fica de fora; percentual sobre a
 * despesa total do mês.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

const R = () => global.RELATORIOS;

function lancar({ tipo, valor, data, categoria, descricao }) {
  global.DADOS.salvarTransacao({
    id: global.UTILS.gerarId(),
    tipo, valor, data, categoria,
    descricao: descricao == null ? (categoria || 'teste') : descricao,
  });
  global.TRANSACOES._cache = null;
  global.TRANSACOES._cacheTimestamp = null;
}

beforeEach(function() {
  resetFixtures();
});

describe('RELATORIOS.topDescricoes', function() {
  test('mês sem despesa devolve lista vazia', function() {
    expect(R().topDescricoes(3, 2026)).toEqual([]);
  });

  test('ordena pelo maior gasto e traz total, contagem e percentual', function() {
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-05', descricao: 'Mercado' });
    lancar({ tipo: 'despesa', valor: 300, data: '2026-03-10', descricao: 'Aluguel' });

    const r = R().topDescricoes(3, 2026);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ descricao: 'Aluguel', total: 300, transacoes: 1, percentual: 75 });
    expect(r[1]).toMatchObject({ descricao: 'Mercado', total: 100, transacoes: 1, percentual: 25 });
  });

  test('agrupa descrições equivalentes (caixa e espaços) num item só', function() {
    lancar({ tipo: 'despesa', valor: 20, data: '2026-03-05', descricao: 'Uber' });
    lancar({ tipo: 'despesa', valor: 30, data: '2026-03-06', descricao: 'uber ' });
    lancar({ tipo: 'despesa', valor: 10, data: '2026-03-07', descricao: 'UBER' });

    const r = R().topDescricoes(3, 2026);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ total: 60, transacoes: 3 });
  });

  test('rótulo é a forma original mais frequente', function() {
    lancar({ tipo: 'despesa', valor: 10, data: '2026-03-05', descricao: 'iFood' });
    lancar({ tipo: 'despesa', valor: 10, data: '2026-03-06', descricao: 'iFood' });
    lancar({ tipo: 'despesa', valor: 10, data: '2026-03-07', descricao: 'ifood' });

    expect(R().topDescricoes(3, 2026)[0].descricao).toBe('iFood');
  });

  test('lançamentos sem descrição não viram item, mas contam no percentual', function() {
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-05', descricao: 'Mercado' });
    lancar({ tipo: 'despesa', valor: 300, data: '2026-03-10', descricao: '' });
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-11', descricao: '   ' });

    const r = R().topDescricoes(3, 2026);
    expect(r).toHaveLength(1);
    // percentual = 100 de um total de 500 (as sem descrição entram no divisor)
    expect(r[0]).toMatchObject({ descricao: 'Mercado', total: 100, percentual: 20 });
  });

  test('ignora receita e transferência (só despesa)', function() {
    lancar({ tipo: 'receita', valor: 5000, data: '2026-03-05', descricao: 'Salário' });
    lancar({ tipo: 'despesa', valor: 80, data: '2026-03-05', descricao: 'Farmácia' });

    const r = R().topDescricoes(3, 2026);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ descricao: 'Farmácia', total: 80, percentual: 100 });
  });

  test('soma em centavos exatos, sem deriva de float', function() {
    lancar({ tipo: 'despesa', valor: 0.10, data: '2026-03-05', descricao: 'Pão' });
    lancar({ tipo: 'despesa', valor: 0.20, data: '2026-03-06', descricao: 'Pão' });

    expect(R().topDescricoes(3, 2026)[0].total).toBe(0.30);
  });

  test('respeita o limite e recorta o topo', function() {
    lancar({ tipo: 'despesa', valor: 10, data: '2026-03-05', descricao: 'A' });
    lancar({ tipo: 'despesa', valor: 20, data: '2026-03-06', descricao: 'B' });
    lancar({ tipo: 'despesa', valor: 30, data: '2026-03-07', descricao: 'C' });

    const r = R().topDescricoes(3, 2026, 2);
    expect(r).toHaveLength(2);
    expect(r.map(function(d) { return d.descricao; })).toEqual(['C', 'B']);
  });

  test('empate de valor desempata por contagem e depois alfabético', function() {
    // "Z": 1x de 40; "A": 2x de 20 = 40. Mesmo total → mais transações primeiro.
    lancar({ tipo: 'despesa', valor: 40, data: '2026-03-05', descricao: 'Z' });
    lancar({ tipo: 'despesa', valor: 20, data: '2026-03-06', descricao: 'A' });
    lancar({ tipo: 'despesa', valor: 20, data: '2026-03-07', descricao: 'A' });

    const r = R().topDescricoes(3, 2026);
    expect(r.map(function(d) { return d.descricao; })).toEqual(['A', 'Z']);
  });

  test('limite default é 5', function() {
    ['A', 'B', 'C', 'D', 'E', 'F'].forEach(function(nome, i) {
      lancar({ tipo: 'despesa', valor: (i + 1) * 10, data: '2026-03-0' + (i + 1), descricao: nome });
    });
    expect(R().topDescricoes(3, 2026)).toHaveLength(5);
  });

  test('só conta lançamentos do mês consultado', function() {
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-05', descricao: 'Mercado' });
    lancar({ tipo: 'despesa', valor: 999, data: '2026-04-05', descricao: 'Mercado' });

    const r = R().topDescricoes(3, 2026);
    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(100);
  });
});
