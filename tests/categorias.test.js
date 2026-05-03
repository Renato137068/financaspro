/**
 * Tests for categorias.js - Auto-categorization module
 */

const CATEGORIAS = require('../js/categorias.js');

describe('CATEGORIAS.detectar', function() {
  
  // === RECEITAS ===
  test('detecta "salário" como receita/salario', function() {
    var result = CATEGORIAS.detectar('Salário mensal');
    expect(result).not.toBeNull();
    expect(result.tipo).toBe('receita');
    expect(result.categoria).toBe('salario');
  });

  test('detecta "freelance" como receita', function() {
    var result = CATEGORIAS.detectar('Freelance design');
    expect(result).not.toBeNull();
    expect(result.tipo).toBe('receita');
  });

  test('detecta "rendimento" como receita', function() {
    var result = CATEGORIAS.detectar('Rendimento CDB');
    expect(result).not.toBeNull();
    expect(result.tipo).toBe('receita');
  });

  test('detecta "dividendo" como receita', function() {
    var result = CATEGORIAS.detectar('Dividendo ITUB4');
    expect(result).not.toBeNull();
    expect(result.tipo).toBe('receita');
  });

  // === ALIMENTAÇÃO ===
  test('detecta "supermercado" como alimentacao', function() {
    var result = CATEGORIAS.detectar('Supermercado Extra');
    expect(result).not.toBeNull();
    expect(result.tipo).toBe('despesa');
    expect(result.categoria).toBe('alimentacao');
  });

  test('detecta "ifood" como alimentacao', function() {
    var result = CATEGORIAS.detectar('iFood pedido');
    expect(result).not.toBeNull();
    expect(result.categoria).toBe('alimentacao');
  });

  test('detecta "restaurante" como alimentacao', function() {
    var result = CATEGORIAS.detectar('Restaurante japonês');
    expect(result).not.toBeNull();
    expect(result.categoria).toBe('alimentacao');
  });

  // === TRANSPORTE ===
  test('detecta "uber" como transporte', function() {
    var result = CATEGORIAS.detectar('Uber corrida');
    expect(result).not.toBeNull();
    expect(result.tipo).toBe('despesa');
    expect(result.categoria).toBe('transporte');
  });

  test('detecta "gasolina" como transporte', function() {
    var result = CATEGORIAS.detectar('Gasolina Shell');
    expect(result).not.toBeNull();
    expect(result.categoria).toBe('transporte');
  });

  test('detecta "metrô" como transporte', function() {
    var result = CATEGORIAS.detectar('Metrô bilhete');
    expect(result).not.toBeNull();
    expect(result.categoria).toBe('transporte');
  });

  // === MORADIA ===
  test('detecta "aluguel" como moradia', function() {
    var result = CATEGORIAS.detectar('Aluguel apartamento');
    expect(result).not.toBeNull();
    expect(result.tipo).toBe('despesa');
    expect(result.categoria).toBe('moradia');
  });

  test('detecta "energia" como moradia', function() {
    var result = CATEGORIAS.detectar('Conta de energia');
    expect(result).not.toBeNull();
    expect(result.categoria).toBe('moradia');
  });

  test('detecta "internet" como moradia', function() {
    var result = CATEGORIAS.detectar('Internet Vivo');
    expect(result).not.toBeNull();
    expect(result.categoria).toBe('moradia');
  });

  // === SAÚDE ===
  test('detecta "farmácia" como saude', function() {
    var result = CATEGORIAS.detectar('Farmácia Drogasil');
    expect(result).not.toBeNull();
    expect(result.tipo).toBe('despesa');
    expect(result.categoria).toBe('saude');
  });

  test('detecta "consulta médica" como saude', function() {
    var result = CATEGORIAS.detectar('Consulta médico');
    expect(result).not.toBeNull();
    expect(result.categoria).toBe('saude');
  });

  test('detecta "academia" como saude', function() {
    var result = CATEGORIAS.detectar('Academia Smart Fit');
    expect(result).not.toBeNull();
    expect(result.categoria).toBe('saude');
  });

  // === LAZER ===
  test('detecta "netflix" como lazer', function() {
    var result = CATEGORIAS.detectar('Netflix assinatura');
    expect(result).not.toBeNull();
    expect(result.tipo).toBe('despesa');
    expect(result.categoria).toBe('lazer');
  });

  test('detecta "cinema" como lazer', function() {
    var result = CATEGORIAS.detectar('Cinema ingresso');
    expect(result).not.toBeNull();
    expect(result.categoria).toBe('lazer');
  });

  test('detecta "viagem" como lazer', function() {
    var result = CATEGORIAS.detectar('Viagem fim de semana');
    expect(result).not.toBeNull();
    expect(result.categoria).toBe('lazer');
  });

  // === EDGE CASES ===
  test('retorna null para string vazia', function() {
    expect(CATEGORIAS.detectar('')).toBeNull();
  });

  test('retorna null para null', function() {
    expect(CATEGORIAS.detectar(null)).toBeNull();
  });

  test('retorna null para texto sem correspondência', function() {
    expect(CATEGORIAS.detectar('xyz123')).toBeNull();
  });

  test('retorna null para texto muito curto', function() {
    expect(CATEGORIAS.detectar('a')).toBeNull();
  });

  test('é case-insensitive', function() {
    var r1 = CATEGORIAS.detectar('SALÁRIO');
    var r2 = CATEGORIAS.detectar('salário');
    expect(r1).not.toBeNull();
    expect(r2).not.toBeNull();
    expect(r1.tipo).toBe(r2.tipo);
    expect(r1.categoria).toBe(r2.categoria);
  });
});

describe('CATEGORIAS.sugerirCategoria', function() {
  test('retorna sugestão com tipo e categoria', function() {
    var result = CATEGORIAS.sugerirCategoria('Salário', 'despesa');
    expect(result).not.toBeNull();
    expect(result.tipo).toBe('receita');
    expect(result.categoria).toBe('salario');
  });

  test('retorna null sem correspondência', function() {
    var result = CATEGORIAS.sugerirCategoria('xyz', 'despesa');
    expect(result).toBeNull();
  });
});
