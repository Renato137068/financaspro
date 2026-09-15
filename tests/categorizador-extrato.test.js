/**
 * categorizador-extrato.test.js — descrições cruas de extrato/fatura.
 *
 * Cobre dois ganhos gratuitos e on-device:
 *   1. Normalização de separadores de adquirente ("IFD*IFOOD", "MP_SHOPEE").
 *   2. Cobertura ampliada de marcas brasileiras de alta frequência.
 */
const CATEGORIZADOR = require('../js/categorizador.js');
const AUTO_CATEGORIZER = require('../js/auto-categorizer.js');

describe('normalização de separadores de extrato', function() {
  beforeEach(function() { CATEGORIZADOR._cache.clear(); });

  test('CATEGORIZADOR: "IFD*IFOOD" casa alimentação', function() {
    var r = CATEGORIZADOR.detectar('IFD*IFOOD');
    expect(r).toBeTruthy();
    expect(r.categoria).toBe('alimentacao');
  });

  test('AUTO_CATEGORIZER: "MP_SHOPEE" casa compras', function() {
    var r = AUTO_CATEGORIZER.detectar('MP_SHOPEE 12345');
    expect(r.categoria).toBe('compras');
  });

  test('AUTO_CATEGORIZER: "PAG*99APP" casa transporte', function() {
    var r = AUTO_CATEGORIZER.detectar('PAG*99APP');
    expect(r.categoria).toBe('transporte');
  });
});

describe('cobertura de marcas BR (AUTO_CATEGORIZER)', function() {
  var casos = [
    ['mcdonald', 'alimentacao'],
    ['burger king', 'alimentacao'],
    ['ze delivery', 'alimentacao'],
    ['assai atacadista', 'alimentacao'],
    ['posto shell', 'transporte'],
    ['ipiranga', 'transporte'],
    ['cabify', 'transporte'],
    ['hbo max', 'assinaturas'],
    ['paramount+', 'assinaturas'],
    ['canva pro', 'assinaturas'],
    ['chatgpt plus', 'assinaturas'],
    ['shopee', 'compras'],
    ['aliexpress', 'compras'],
    ['shein', 'compras'],
    ['kabum', 'compras'],
  ];

  casos.forEach(function(par) {
    test('"' + par[0] + '" → ' + par[1], function() {
      expect(AUTO_CATEGORIZER.detectar(par[0]).categoria).toBe(par[1]);
    });
  });
});

describe('fallback por histórico preserva o tipo da categoria', function() {
  var origDados;
  beforeEach(function() {
    origDados = global.DADOS;
    AUTO_CATEGORIZER.HISTORICO = {};
    AUTO_CATEGORIZER._tipoPorCat = {};
  });
  afterEach(function() {
    global.DADOS = origDados;
    AUTO_CATEGORIZER.HISTORICO = {};
    AUTO_CATEGORIZER._tipoPorCat = {};
  });

  test('receita recorrente sem palavra de regra volta como receita, não despesa', function() {
    // Palavras que NÃO casam nenhuma REGRA, categorizadas como receita.
    global.DADOS = {
      getTransacoes: function() {
        return [
          { descricao: 'Ganho atelie mensal', categoria: 'freelance', tipo: 'receita' },
          { descricao: 'Ganho atelie mensal', categoria: 'freelance', tipo: 'receita' },
        ];
      }
    };
    AUTO_CATEGORIZER.analisarHistorico();

    var r = AUTO_CATEGORIZER.detectar('Ganho atelie');
    expect(r.categoria).toBe('freelance');
    // Antes do fix o tipo vinha 'despesa' fixo — invertendo a natureza da entrada.
    expect(r.tipo).toBe('receita');
  });

  test('despesa recorrente sem palavra de regra segue como despesa', function() {
    global.DADOS = {
      getTransacoes: function() {
        return [
          { descricao: 'Feira organica sitio', categoria: 'alimentacao', tipo: 'despesa' },
          { descricao: 'Feira organica sitio', categoria: 'alimentacao', tipo: 'despesa' },
        ];
      }
    };
    AUTO_CATEGORIZER.analisarHistorico();

    var r = AUTO_CATEGORIZER.detectar('organica sitio');
    expect(r.categoria).toBe('alimentacao');
    expect(r.tipo).toBe('despesa');
  });
});
