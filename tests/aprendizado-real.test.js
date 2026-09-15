/**
 * aprendizado-real.test.js — exercita js/aprendizado.js REAL.
 *
 * O aprendizado é o pilar PRO da autocategorização: o app aprende com o
 * histórico e com as correções do usuário. O laço de correção só vale se a
 * categoria corrigida realmente passar a ser sugerida — era o que estava
 * quebrado (a alternativa correta nunca concorria com a primária errada).
 */
const APRENDIZADO = require('../js/aprendizado.js');

beforeEach(function() {
  global.DADOS = { obterAprendizado: function() { return {}; }, salvarAprendizado: function() {} };
  global.UTILS = { dataLocalIso: function() { return '2026-09-15'; } };
  delete global.BILLING; // _podeAprender() → true
  APRENDIZADO.HISTORICO = {};
});

describe('APRENDIZADO.sugerir — primária vs alternativa', function() {
  test('alternativa reforçada vence primária penalizada', function() {
    APRENDIZADO.HISTORICO = {
      'uber':       { categoria: 'transporte', tipo: 'despesa', contador: 1, penalidades: 1 },
      'uber__lazer':{ categoria: 'lazer',      tipo: 'despesa', contador: 5, penalidades: 0 },
    };
    const s = APRENDIZADO.sugerir('uber');
    expect(s).toBeTruthy();
    // Regressão: antes só a primária era considerada quando existia — a
    // alternativa correta nunca aparecia, então voltava 'transporte'.
    expect(s.categoria).toBe('lazer');
  });

  test('primária sozinha continua sendo sugerida', function() {
    APRENDIZADO.HISTORICO = {
      'mercado': { categoria: 'alimentacao', tipo: 'despesa', contador: 3, penalidades: 0 },
    };
    expect(APRENDIZADO.sugerir('mercado').categoria).toBe('alimentacao');
  });

  test('só alternativas (sem primária) continua funcionando', function() {
    APRENDIZADO.HISTORICO = {
      'padoca__alimentacao': { categoria: 'alimentacao', tipo: 'despesa', contador: 2, penalidades: 0 },
    };
    expect(APRENDIZADO.sugerir('padoca').categoria).toBe('alimentacao');
  });

  test('descrição desconhecida devolve null', function() {
    expect(APRENDIZADO.sugerir('inexistente')).toBeNull();
  });
});

describe('APRENDIZADO — laço de correção ponta a ponta', function() {
  test('após corrigir e reforçar, a categoria correta passa a ser sugerida', function() {
    // 1) Aprende errado como primária
    APRENDIZADO.registrar('uber', 'transporte', 'despesa');
    // 2) Usuário corrige transporte → lazer (penaliza a errada)
    APRENDIZADO.registrarCorrecao('uber', 'transporte', 'lazer');
    // 3) O submit normal registra a categoria correta (vira alternativa)
    APRENDIZADO.registrar('uber', 'lazer', 'despesa');
    APRENDIZADO.registrar('uber', 'lazer', 'despesa');
    APRENDIZADO.registrar('uber', 'lazer', 'despesa');

    const s = APRENDIZADO.sugerir('uber');
    expect(s.categoria).toBe('lazer'); // não a 'transporte' penalizada
  });
});
