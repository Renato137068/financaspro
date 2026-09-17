/**
 * relatorios-media-categoria.test.js — linha de base pessoal por categoria.
 *
 * Exercita RELATORIOS.mediaPorCategoria REAL (via load-sources): a média de
 * gasto nos N meses anteriores confrontada com o mês atual. É o "estou gastando
 * mais que o meu normal?" sem orçamento configurado.
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

function achar(lista, cat) {
  return lista.find(function(x) { return x.categoria === cat; });
}

beforeEach(function() {
  resetFixtures();
});

describe('RELATORIOS.mediaPorCategoria', function() {
  test('compara o mês atual com a média dos 3 meses anteriores', function() {
    // Alimentação: jun 600, mai 600, abr 600 → média 600; jul 900 → +50%.
    lancar({ tipo: 'despesa', valor: 600, data: '2026-04-10', categoria: 'alimentacao' });
    lancar({ tipo: 'despesa', valor: 600, data: '2026-05-10', categoria: 'alimentacao' });
    lancar({ tipo: 'despesa', valor: 600, data: '2026-06-10', categoria: 'alimentacao' });
    lancar({ tipo: 'despesa', valor: 900, data: '2026-07-10', categoria: 'alimentacao' });

    const item = achar(R().mediaPorCategoria(7, 2026), 'alimentacao');
    expect(item.atual).toBe(900);
    expect(item.media).toBe(600);
    expect(item.diff).toBe(300);
    expect(item.variacao).toBe(50);
    expect(item.mesesComDados).toBe(3);
  });

  test('janela padrão é 3 meses quando não informada', function() {
    lancar({ tipo: 'despesa', valor: 300, data: '2026-04-10', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 300, data: '2026-05-10', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 300, data: '2026-06-10', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 300, data: '2026-07-10', categoria: 'lazer' });

    const item = achar(R().mediaPorCategoria(7, 2026), 'lazer');
    expect(item.media).toBe(300); // 900 / 3
    expect(item.variacao).toBe(0);
  });

  test('mês sem gasto na categoria conta como zero na média (denominador fixo)', function() {
    // Só um dos 3 meses anteriores teve gasto: média = 300 / 3 = 100.
    lancar({ tipo: 'despesa', valor: 300, data: '2026-06-10', categoria: 'vestuario' });
    lancar({ tipo: 'despesa', valor: 200, data: '2026-07-10', categoria: 'vestuario' });

    const item = achar(R().mediaPorCategoria(7, 2026), 'vestuario');
    expect(item.media).toBe(100);
    expect(item.mesesComDados).toBe(1);
    expect(item.variacao).toBe(100); // 200 vs 100
  });

  test('categoria nova (sem histórico) tem variacao null, não divisão por zero', function() {
    lancar({ tipo: 'despesa', valor: 250, data: '2026-07-10', categoria: 'pet' });

    const item = achar(R().mediaPorCategoria(7, 2026), 'pet');
    expect(item.media).toBe(0);
    expect(item.variacao).toBeNull();
    expect(item.atual).toBe(250);
  });

  test('a janela de referência atravessa a virada de ano', function() {
    // Consulta jan/2026 com janela 3 → dez, nov, out de 2025.
    lancar({ tipo: 'despesa', valor: 90, data: '2025-12-10', categoria: 'transporte' });
    lancar({ tipo: 'despesa', valor: 60, data: '2026-01-10', categoria: 'transporte' });

    const item = achar(R().mediaPorCategoria(1, 2026), 'transporte');
    expect(item.media).toBe(30); // 90 / 3
    expect(item.atual).toBe(60);
    expect(item.variacao).toBe(100);
  });

  test('receita não entra na média de despesa', function() {
    lancar({ tipo: 'receita', valor: 5000, data: '2026-06-05', categoria: 'salario' });
    lancar({ tipo: 'despesa', valor: 100, data: '2026-07-02', categoria: 'lazer' });

    const lista = R().mediaPorCategoria(7, 2026);
    expect(achar(lista, 'salario')).toBeUndefined();
    expect(achar(lista, 'lazer')).toBeDefined();
  });

  test('ordena pelo maior desvio em reais primeiro', function() {
    // moradia varia +400; lazer varia +50 → moradia vem antes.
    lancar({ tipo: 'despesa', valor: 800, data: '2026-06-10', categoria: 'moradia' });
    lancar({ tipo: 'despesa', valor: 1200, data: '2026-07-10', categoria: 'moradia' });
    lancar({ tipo: 'despesa', valor: 50, data: '2026-06-11', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 100, data: '2026-07-11', categoria: 'lazer' });

    const lista = R().mediaPorCategoria(7, 2026);
    expect(lista[0].categoria).toBe('moradia');
  });

  test('soma em centavos exatos, sem deriva de float', function() {
    lancar({ tipo: 'despesa', valor: 0.10, data: '2026-06-01', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 0.20, data: '2026-06-02', categoria: 'lazer' });
    lancar({ tipo: 'despesa', valor: 0.30, data: '2026-07-01', categoria: 'lazer' });

    const item = achar(R().mediaPorCategoria(7, 2026), 'lazer');
    expect(item.media).toBe(0.10); // 0,30 / 3
    expect(item.atual).toBe(0.30);
  });

  test('despesa sem categoria é agrupada em "outro"', function() {
    lancar({ tipo: 'despesa', valor: 40, data: '2026-06-01', categoria: null });
    lancar({ tipo: 'despesa', valor: 40, data: '2026-07-01', categoria: null });

    expect(achar(R().mediaPorCategoria(7, 2026), 'outro')).toBeDefined();
  });

  test('mês totalmente vazio devolve lista vazia, sem estourar', function() {
    expect(R().mediaPorCategoria(7, 2026)).toEqual([]);
  });
});
