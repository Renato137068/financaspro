/**
 * relatorios-gasto-por-fonte.test.js — despesa por fonte de pagamento.
 *
 * RELATORIOS.gastoPorFonte separa a despesa do mês por cartão e por conta
 * (banco); sem nenhum dos dois cai em "Sem conta". Só despesa; centavos
 * inteiros; percentual sobre a despesa total do mês; maior gasto primeiro.
 */
const { loadCoreModules, resetFixtures } = require('./load-sources');

loadCoreModules();

const R = () => global.RELATORIOS;

function lancar({ tipo, valor, data, banco, cartao }) {
  global.DADOS.salvarTransacao({
    id: global.UTILS.gerarId(),
    tipo, valor, data,
    categoria: 'outro',
    descricao: 'teste',
    banco: banco || '',
    cartao: cartao || '',
  });
  global.TRANSACOES._cache = null;
  global.TRANSACOES._cacheTimestamp = null;
}

beforeEach(function() {
  resetFixtures();
});

describe('RELATORIOS.gastoPorFonte', function() {
  test('mês sem despesa devolve lista vazia', function() {
    expect(R().gastoPorFonte(3, 2026)).toEqual([]);
  });

  test('separa cartão e conta, ordena por gasto e traz total/%/contagem', function() {
    lancar({ tipo: 'despesa', valor: 300, data: '2026-03-05', cartao: 'Nubank' });
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-06', banco: 'Itaú' });

    const r = R().gastoPorFonte(3, 2026);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ fonte: 'Nubank', tipo: 'cartao', total: 300, transacoes: 1, percentual: 75 });
    expect(r[1]).toMatchObject({ fonte: 'Itaú', tipo: 'conta', total: 100, transacoes: 1, percentual: 25 });
  });

  test('cartão tem precedência sobre banco quando ambos existem', function() {
    lancar({ tipo: 'despesa', valor: 50, data: '2026-03-05', banco: 'Itaú', cartao: 'Nubank' });
    const r = R().gastoPorFonte(3, 2026);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ fonte: 'Nubank', tipo: 'cartao' });
  });

  test('sem cartão nem banco cai em "Sem conta" (tipo nenhuma)', function() {
    lancar({ tipo: 'despesa', valor: 40, data: '2026-03-05' });
    const r = R().gastoPorFonte(3, 2026);
    expect(r[0]).toMatchObject({ fonte: 'Sem conta', tipo: 'nenhuma', total: 40 });
  });

  test('agrupa a mesma conta (caixa/espaços) num item só', function() {
    lancar({ tipo: 'despesa', valor: 20, data: '2026-03-05', banco: 'Itaú' });
    lancar({ tipo: 'despesa', valor: 30, data: '2026-03-06', banco: 'itaú ' });
    const r = R().gastoPorFonte(3, 2026);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ total: 50, transacoes: 2 });
  });

  test('não confunde um cartão com uma conta de mesmo nome', function() {
    lancar({ tipo: 'despesa', valor: 20, data: '2026-03-05', cartao: 'Inter' });
    lancar({ tipo: 'despesa', valor: 30, data: '2026-03-06', banco: 'Inter' });
    const r = R().gastoPorFonte(3, 2026);
    expect(r).toHaveLength(2);
    expect(r.map(function(f) { return f.tipo; }).sort()).toEqual(['cartao', 'conta']);
  });

  test('ignora receita e transferência (só despesa)', function() {
    lancar({ tipo: 'receita', valor: 5000, data: '2026-03-05', banco: 'Itaú' });
    lancar({ tipo: 'despesa', valor: 80, data: '2026-03-05', banco: 'Itaú' });
    const r = R().gastoPorFonte(3, 2026);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ total: 80, transacoes: 1, percentual: 100 });
  });

  test('soma em centavos exatos, sem deriva de float', function() {
    lancar({ tipo: 'despesa', valor: 0.10, data: '2026-03-05', banco: 'Itaú' });
    lancar({ tipo: 'despesa', valor: 0.20, data: '2026-03-06', banco: 'Itaú' });
    expect(R().gastoPorFonte(3, 2026)[0].total).toBe(0.30);
  });

  test('só conta lançamentos do mês consultado', function() {
    lancar({ tipo: 'despesa', valor: 100, data: '2026-03-05', banco: 'Itaú' });
    lancar({ tipo: 'despesa', valor: 999, data: '2026-04-05', banco: 'Itaú' });
    const r = R().gastoPorFonte(3, 2026);
    expect(r).toHaveLength(1);
    expect(r[0].total).toBe(100);
  });
});
