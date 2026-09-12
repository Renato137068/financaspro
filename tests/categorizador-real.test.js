/**
 * categorizador-real.test.js — dicionário + fuzzy do módulo real.
 */
const CATEGORIZADOR = require('../js/categorizador.js');
const AUTO = require('../js/auto-categorizer.js');

describe('CATEGORIZADOR.detectar', function() {
  beforeEach(function() {
    CATEGORIZADOR._cache.clear();
  });

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

  test('uber eats é alimentação, não transporte', function() {
    expect(CATEGORIZADOR.detectar('UBER EATS HELP.UBER').categoria).toBe('alimentacao');
  });

  test('amazon prime é assinatura, não compra', function() {
    expect(CATEGORIZADOR.detectar('Amazon Prime').categoria).toBe('assinaturas');
  });

  test('mercado livre é compras, não alimentação', function() {
    expect(CATEGORIZADOR.detectar('Mercado Livre ML').categoria).toBe('compras');
  });

  test('aluguel recebido é receita', function() {
    var r = CATEGORIZADOR.detectar('Aluguel recebido apto');
    expect(r.categoria).toBe('aluguel_recebido');
    expect(r.tipo).toBe('receita');
  });

  test('não mapeia "casa" para vestuário via prefixo casaco', function() {
    var r = CATEGORIZADOR.detectar('uberr até casa');
    expect(r.categoria).toBe('transporte');
  });

  test('não acha "game" dentro de "pagamentos"', function() {
    expect(CATEGORIZADOR.detectar('NUBANK NU PAGAMENTOS')).toBeNull();
  });
});

describe('AUTO_CATEGORIZER.detectar — conflitos', function() {
  test('uber eats → alimentacao', function() {
    expect(AUTO.detectar('UBER EATS HELP.UBER').categoria).toBe('alimentacao');
  });

  test('amazon prime → assinaturas', function() {
    expect(AUTO.detectar('Amazon Prime').categoria).toBe('assinaturas');
  });

  test('pix/pag genérico não vira beneficios via "va" em SILVA', function() {
    expect(AUTO.detectar('PAG*JOAO DA SILVA').categoria).toBe('outro');
  });

  test('juros de cheque → servicos_financeiros', function() {
    expect(AUTO.detectar('Juros cheque especial').categoria).toBe('servicos_financeiros');
  });

  test('aluguel recebido antes de aluguel', function() {
    var r = AUTO.detectar('Aluguel recebido apto');
    expect(r.categoria).toBe('aluguel_recebido');
    expect(r.tipo).toBe('receita');
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
