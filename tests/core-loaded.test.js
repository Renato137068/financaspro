/**
 * core-loaded.test.js — exercita módulos reais do frontend (cobertura)
 */
const { loadCoreModules } = require('./load-sources');

beforeAll(function() {
  loadCoreModules();
});

describe('módulos core carregados', function() {
  test('UTILS formata moeda e calcula saldo', function() {
    expect(global.UTILS.formatarMoeda(1234.5)).toMatch(/1\.234/);
    var saldo = global.UTILS.calcularSaldo([
      { tipo: CONFIG.TIPO_RECEITA, valor: 100 },
      { tipo: CONFIG.TIPO_DESPESA, valor: 30 },
    ]);
    expect(saldo).toBe(70);
  });

  test('VALIDATIONS valida transação completa', function() {
    var ok = global.VALIDATIONS.validarTransacaoCompleta({
      tipo: CONFIG.TIPO_DESPESA,
      valor: 50,
      categoria: 'alimentacao',
      data: '2026-07-01',
      descricao: 'Mercado',
    });
    expect(ok.valido).toBe(true);
  });

  test('SCORE calcula confiança', function() {
    var r = global.SCORE.calcular({ confianca: 'alta' }, { contador: 3 }, true);
    expect(r.score).toBeGreaterThan(0.5);
    expect(r.confianca).toBeDefined();
  });

  test('PARSER extrai valor e data', function() {
    var parsed = global.PARSER.extrair('Paguei R$ 42,50 no mercado dia 01/07/2026');
    expect(parsed.valor).toBeGreaterThan(0);
    expect(parsed.desc).toBeTruthy();
  });

  test('PIPELINE categoriza texto', function() {
    var r = global.PIPELINE.processar('Uber 25 reais alimentacao');
    expect(r).toBeDefined();
    expect(r.valor).toBeGreaterThan(0);
  });

  test('ORCAMENTO define e consulta limite', function() {
    global.ORCAMENTO.init();
    global.ORCAMENTO.definirLimite('alimentacao', 500);
    expect(global.ORCAMENTO.obterLimite('alimentacao')).toBe(500);
  });

  test('TRANSACOES cria lançamento', function() {
    var tx = global.TRANSACOES.criar(
      CONFIG.TIPO_DESPESA, 15, 'alimentacao', '2026-07-01', 'Teste'
    );
    expect(tx.valor).toBe(15);
    expect(tx.categoria).toBe('alimentacao');
  });

  test('APP_STORE get/set e subscribe', function() {
    global.APP_STORE.reset();
    global.APP_STORE.set('teste', 1);
    expect(global.APP_STORE.get('teste')).toBe(1);
    var called = false;
    var unsub = global.APP_STORE.subscribe('teste', function() { called = true; });
    global.APP_STORE.set('teste', 2);
    expect(called).toBe(true);
    unsub();
  });
});
