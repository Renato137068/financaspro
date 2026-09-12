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
