/**
 * categorizador-real.test.js — dicionário + fuzzy do módulo real.
 */
const CATEGORIZADOR = require('../js/categorizador.js');

describe('CATEGORIZADOR.detectar', function() {
  test('reconhece supermercado como alimentação', function() {
    var r = CATEGORIZADOR.detectar('supermercado Extra');
    expect(r).toBeTruthy();
    expect(r.categoria).toBe('alimentacao');
    expect(r.tipo).toBe('despesa');
  });

  test('reconhece uber como transporte', function() {
    var r = CATEGORIZADOR.detectar('uber até o trabalho');
    expect(r.categoria).toBe('transporte');
  });

  test('reconhece netflix como assinaturas', function() {
    var r = CATEGORIZADOR.detectar('netflix mensalidade');
    expect(r.categoria).toBe('assinaturas');
  });

  test('reconhece salário como receita', function() {
    var r = CATEGORIZADOR.detectar('salário janeiro');
    expect(r.categoria).toBe('salario');
    expect(r.tipo).toBe('receita');
  });

  test('typo próximo ainda categoriza (fuzzy)', function() {
    var r = CATEGORIZADOR.detectar('supermercto');
    expect(r).toBeTruthy();
    expect(r.categoria).toBe('alimentacao');
  });

  test('texto curto ou vazio retorna null', function() {
    expect(CATEGORIZADOR.detectar('')).toBeNull();
    expect(CATEGORIZADOR.detectar('a')).toBeNull();
  });

  test('usa cache na segunda chamada', function() {
    CATEGORIZADOR._cache.clear();
    var a = CATEGORIZADOR.detectar('padaria do bairro');
    var b = CATEGORIZADOR.detectar('padaria do bairro');
    expect(a).toEqual(b);
    expect(CATEGORIZADOR._cache.has('padaria do bairro')).toBe(true);
  });
});

describe('CATEGORIZADOR.similaridade', function() {
  test('idênticos = 1', function() {
    expect(CATEGORIZADOR.similaridade('uber', 'uber')).toBe(1);
  });

  test('distintos caem abaixo de 0.5', function() {
    expect(CATEGORIZADOR.similaridade('uber', 'netflix')).toBeLessThan(0.5);
  });
});
