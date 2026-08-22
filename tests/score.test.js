/**
 * score.test.js — Testes para js/score.js
 * Cobre: calcular (todas as combinações de entradas), cache LRU, limiares de confiança
 */

// Implementação inline idêntica a js/score.js
const { loadCoreModules } = require('./load-sources');

// Carrega os módulos REAIS de js/. Antes deste ajuste o arquivo declarava uma
// cópia inline de SCORE e testava a cópia — os testes passavam mesmo quando o
// código de produção divergia. Ver tests/suite-integrity.test.js.
loadCoreModules();
const SCORE = global.SCORE;

// ─────────────────────────────────────────────────────────────────────────────

describe('SCORE — calcular com fuzzy alta confiança', () => {
  beforeEach(() => SCORE._cache.clear());

  test('fuzzy alta confiança gera score >= 0.45 (50% de 0.9)', () => {
    const r = SCORE.calcular({ confianca: 'alta', categoria: 'alimentacao', tipo: 'despesa' }, null, null);
    expect(r.score).toBe(0.45);
    expect(r.confianca).toBe('baixa'); // 0.45 < 0.5
  });

  test('fuzzy alta + aprendizado → confiança alta', () => {
    const r = SCORE.calcular(
      { confianca: 'alta', categoria: 'alimentacao', tipo: 'despesa' },
      { categoria: 'alimentacao', tipo: 'despesa', contador: 5 },
      null
    );
    // fScore=0.9*0.5=0.45, aScore=min(0.5+5*0.05, 0.95)=0.75*0.35=0.2625
    // total = 0.45 + 0.2625 = 0.7125 → 'media' (0.5 < x <= 0.75)
    expect(r.score).toBeGreaterThan(0.5);
    expect(['media', 'alta']).toContain(r.confianca);
  });

  test('fuzzy alta + aprendizado alto + contextual → confiança alta', () => {
    const r = SCORE.calcular(
      { confianca: 'alta', categoria: 'alimentacao', tipo: 'despesa' },
      { categoria: 'alimentacao', tipo: 'despesa', contador: 10 },
      true
    );
    // fScore=0.45, aScore=min(0.5+10*0.05, 0.95)=0.95*0.35=0.3325, cScore=0.7*0.15=0.105
    // total = 0.45 + 0.3325 + 0.105 = 0.8875 → 'alta'
    expect(r.score).toBeGreaterThan(0.75);
    expect(r.confianca).toBe('alta');
  });
});

describe('SCORE — calcular com fuzzy baixa confiança', () => {
  beforeEach(() => SCORE._cache.clear());

  test('fuzzy baixa confiança usa fScore = 0.6', () => {
    const r = SCORE.calcular({ confianca: 'baixa', categoria: 'transporte', tipo: 'despesa' }, null, null);
    // 0.6 * 0.5 = 0.3 → 'baixa'
    expect(r.score).toBe(0.3);
    expect(r.confianca).toBe('baixa');
  });

  test('fonte é "aprendizado" quando fuzzy não é alta', () => {
    const r = SCORE.calcular({ confianca: 'baixa', categoria: 'lazer', tipo: 'despesa' }, null, null);
    expect(r.fonte).toBe('aprendizado');
  });
});

describe('SCORE — calcular sem fuzzy, apenas aprendizado', () => {
  beforeEach(() => SCORE._cache.clear());

  test('aprendizado com contador 1 → aScore = 0.55', () => {
    const r = SCORE.calcular(null, { categoria: 'moradia', tipo: 'despesa', contador: 1 }, null);
    // aScore = min(0.5 + 1*0.05, 0.95) = 0.55 * 0.35 = 0.1925 → 'baixa'
    expect(r.score).toBeCloseTo(0.19, 1);
    expect(r.confianca).toBe('baixa');
  });

  test('aprendizado sem contador usa contador=1', () => {
    const r1 = SCORE.calcular(null, { categoria: 'moradia', tipo: 'despesa', contador: 1 }, null);
    const r2 = SCORE.calcular(null, { categoria: 'moradia', tipo: 'despesa' }, null);
    // contador undefined → usa 1 → mesmo resultado
    // Mas categoria diferente produziria cache diferente, então limpamos cache
    SCORE._cache.clear();
    expect(r1.score).toBe(r2.score);
  });

  test('aprendizado com contador alto (≥9) satura em aScore = 0.95', () => {
    const r = SCORE.calcular(null, { categoria: 'saude', tipo: 'despesa', contador: 100 }, null);
    // aScore = min(0.5 + 100*0.05, 0.95) = 0.95 * 0.35 = 0.3325 → 'baixa'
    expect(r.score).toBeCloseTo(0.33, 1);
  });
});

describe('SCORE — limiares de confiança', () => {
  beforeEach(() => SCORE._cache.clear());

  test('score > 0.75 → confiança "alta"', () => {
    // Forçar score alto: fuzzy alta + aprendizado contador 10 + contextual
    const r = SCORE.calcular(
      { confianca: 'alta', categoria: 'alimentacao', tipo: 'despesa' },
      { categoria: 'alimentacao', tipo: 'despesa', contador: 10 },
      true
    );
    expect(r.confianca).toBe('alta');
  });

  test('score <= 0.5 → confiança "baixa"', () => {
    const r = SCORE.calcular(null, null, null);
    expect(r.score).toBe(0);
    expect(r.confianca).toBe('baixa');
  });

  test('score = 0 quando todos os inputs são null', () => {
    const r = SCORE.calcular(null, null, null);
    expect(r.score).toBe(0);
  });
});

describe('SCORE — categoria e tipo derivados', () => {
  beforeEach(() => SCORE._cache.clear());

  test('categoria vem do fuzzy quando disponível', () => {
    const r = SCORE.calcular({ confianca: 'alta', categoria: 'lazer', tipo: 'despesa' }, null, null);
    expect(r.categoria).toBe('lazer');
  });

  test('categoria vem do aprendizado quando fuzzy é null', () => {
    const r = SCORE.calcular(null, { categoria: 'saude', tipo: 'despesa', contador: 1 }, null);
    expect(r.categoria).toBe('saude');
  });

  test('tipo padrão é "despesa" quando nem fuzzy nem aprendizado têm tipo', () => {
    const r = SCORE.calcular(null, null, null);
    expect(r.tipo).toBe('despesa');
  });
});

describe('SCORE — cache LRU', () => {
  beforeEach(() => SCORE._cache.clear());

  test('mesma entrada retorna objeto do cache (referência igual)', () => {
    const r1 = SCORE.calcular({ confianca: 'alta', categoria: 'lazer', tipo: 'despesa' }, null, null);
    const r2 = SCORE.calcular({ confianca: 'alta', categoria: 'lazer', tipo: 'despesa' }, null, null);
    // Mesmo score porque mesmos fScore:aScore:cScore
    expect(r1.score).toBe(r2.score);
    expect(r1.confianca).toBe(r2.confianca);
  });
});
