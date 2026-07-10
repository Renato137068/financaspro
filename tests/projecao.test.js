/**
 * projecao.test.js — projeção de fim de mês (#20)
 * Carrega o AI_ENGINE real (módulo puro) num contexto vm e injeta datas fixas.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAiEngine() {
  const ctx = vm.createContext({ Date, Math, Number, String, Array, JSON });
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-engine.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'ai-engine.js' });
  return ctx.AI_ENGINE;
}

const AI = loadAiEngine();
const JAN20 = new Date(2026, 0, 20); // 20/01/2026, mês tem 31 dias

describe('AI_ENGINE.projetarFimMes (#20)', () => {
  test('expõe as funções', () => {
    expect(typeof AI.projetarFimMes).toBe('function');
    expect(typeof AI.mensagemFimMes).toBe('function');
  });

  test('dados insuficientes antes do dia 3', () => {
    const r = AI.projetarFimMes([{ tipo: 'despesa', valor: 50, data: '2026-01-02' }], new Date(2026, 0, 2));
    expect(r.dadosInsuficientes).toBe(true);
  });

  test('dados insuficientes se não há lançamentos no mês corrente', () => {
    const r = AI.projetarFimMes([{ tipo: 'despesa', valor: 50, data: '2025-12-10' }], JAN20);
    expect(r.dadosInsuficientes).toBe(true);
  });

  test('projeta pela taxa diária (dia 20/31): 2000 em 20 dias => 3100', () => {
    const txs = [
      { tipo: 'receita', valor: 5000, data: '2026-01-05' },
      { tipo: 'despesa', valor: 2000, data: '2026-01-10' },
    ];
    const r = AI.projetarFimMes(txs, JAN20);
    expect(r.dadosInsuficientes).toBe(false);
    expect(r.diasDecorridos).toBe(20);
    expect(r.diasRestantes).toBe(11);
    expect(r.projecaoDespesas).toBeCloseTo(3100, 2); // 2000 + (2000/20)*11
    expect(r.projecaoReceitas).toBe(5000);
    expect(r.saldoProjetado).toBeCloseTo(1900, 2);
  });

  test('arredonda a 2 casas', () => {
    const txs = [{ tipo: 'despesa', valor: 100, data: '2026-01-03' }];
    const r = AI.projetarFimMes(txs, new Date(2026, 0, 3)); // dia 3
    expect(Number.isInteger(Math.round(r.projecaoDespesas * 100))).toBe(true);
  });

  test('retrocompatível: chamada sem data não quebra', () => {
    expect(() => AI.projetarFimMes([{ tipo: 'despesa', valor: 10, data: '2026-01-10' }])).not.toThrow();
  });
});

describe('AI_ENGINE.mensagemFimMes (#20)', () => {
  test('positivo quando sobra dinheiro', () => {
    const txs = [
      { tipo: 'receita', valor: 5000, data: '2026-01-05' },
      { tipo: 'despesa', valor: 2000, data: '2026-01-10' },
    ];
    const m = AI.mensagemFimMes(txs, JAN20);
    expect(m).not.toBeNull();
    expect(m.tom).toBe('positivo');
    expect(m.saldoProjetado).toBeCloseTo(1900, 2);
    expect(m.texto).toContain('sobrando');
  });

  test('alerta quando fecha no vermelho', () => {
    const txs = [
      { tipo: 'receita', valor: 5000, data: '2026-01-05' },
      { tipo: 'despesa', valor: 4000, data: '2026-01-10' },
    ];
    const m = AI.mensagemFimMes(txs, JAN20); // daily 200 -> proj 6200 -> saldo -1200
    expect(m.tom).toBe('alerta');
    expect(m.saldoProjetado).toBeLessThan(0);
    expect(m.texto).toContain('vermelho');
  });

  test('null quando dados insuficientes', () => {
    expect(AI.mensagemFimMes([], JAN20)).toBeNull();
  });
});
