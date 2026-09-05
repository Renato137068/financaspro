/**
 * previsao-real.test.js — cache e formatação do módulo previsao.js.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadPrevisao() {
  const aiFile = path.join(__dirname, '..', 'js', 'ai-engine.js');
  const prevFile = path.join(__dirname, '..', 'js', 'previsao.js');
  const ctx = {
    Date, Math, Number, String, Array, Object, JSON, console,
    document: { getElementById: function() { return null; } },
    DADOS: {
      getTransacoes: function() {
        return [
          { id: '1', tipo: 'receita', valor: 5000, data: '2026-01-05', categoria: 'salario' },
          { id: '2', tipo: 'despesa', valor: 2000, data: '2026-01-10', categoria: 'moradia' },
          { id: '3', tipo: 'receita', valor: 5000, data: '2026-02-05', categoria: 'salario' },
          { id: '4', tipo: 'despesa', valor: 2200, data: '2026-02-12', categoria: 'moradia' },
          { id: '5', tipo: 'receita', valor: 5000, data: '2026-03-05', categoria: 'salario' },
          { id: '6', tipo: 'despesa', valor: 1800, data: '2026-03-08', categoria: 'moradia' },
        ];
      },
      getConfig: function() { return {}; },
    },
    BILLING: { canUse: function() { return true; } },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(aiFile, 'utf8'), ctx, { filename: aiFile });
  vm.runInContext(fs.readFileSync(prevFile, 'utf8'), ctx, { filename: prevFile });
  return ctx.PREVISAO;
}

const PREVISAO = loadPrevisao();

describe('PREVISAO.calcular', function() {
  beforeEach(function() {
    PREVISAO.invalidarCache();
  });

  test('retorna meses e tendência com histórico', function() {
    var prev = PREVISAO.calcular();
    expect(prev).toBeTruthy();
    expect(Array.isArray(prev.meses)).toBe(true);
    expect(prev.meses.length).toBeGreaterThan(0);
    expect(prev.tendencia).toBeTruthy();
  });

  test('cache evita recalcular com mesmos dados', function() {
    var a = PREVISAO.calcular();
    var b = PREVISAO.calcular();
    expect(a).toBe(b);
  });

  test('invalidarCache força novo objeto', function() {
    var a = PREVISAO.calcular();
    PREVISAO.invalidarCache();
    var b = PREVISAO.calcular();
    expect(a).not.toBe(b);
    expect(a.meses.length).toBe(b.meses.length);
  });
});

describe('PREVISAO — formatação', function() {
  test('_formatarMes', function() {
    expect(PREVISAO._formatarMes('2026-09')).toBe('Set/26');
  });

  test('_formatarMoeda', function() {
    expect(PREVISAO._formatarMoeda(127.45)).toMatch(/127/);
  });

  test('_tendenciaIcon cobre estável', function() {
    var t = PREVISAO._tendenciaIcon('estavel');
    expect(t.texto).toMatch(/estável/i);
  });
});
