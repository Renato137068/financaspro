/**
 * assinaturas-esquecidas.test.js — detector de assinaturas esquecidas (#32)
 * Testa o AI_ENGINE real (carregado via vm), com data e transações fixas.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadAiEngine() {
  const ctx = vm.createContext({ Date, Math, Number, String, Array, Object, JSON });
  const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'ai-engine.js'), 'utf8');
  vm.runInContext(code, ctx, { filename: 'ai-engine.js' });
  return ctx.AI_ENGINE;
}
const AI = loadAiEngine();
const HOJE = new Date(2026, 3, 20); // 20/04/2026

function mensal(desc, valor, meses) {
  return meses.map((m) => ({ tipo: 'despesa', descricao: desc, valor: valor, data: '2026-' + m + '-05' }));
}

describe('AI_ENGINE.detectarAssinaturasEsquecidas (#32)', () => {
  test('expõe as funções', () => {
    expect(typeof AI.detectarAssinaturasEsquecidas).toBe('function');
    expect(typeof AI.mensagemAssinaturasEsquecidas).toBe('function');
  });

  test('sinaliza assinaturas de valor fixo ativas, ordenadas por custo anual', () => {
    const txs = [].concat(
      mensal('Netflix', 34.90, ['01', '02', '03', '04']),
      mensal('Spotify', 19.90, ['02', '03', '04'])
    );
    const r = AI.detectarAssinaturasEsquecidas(txs, { hoje: HOJE });
    expect(r.map((x) => x.nome)).toEqual(['Netflix', 'Spotify']); // custoAnual desc
    expect(r[0].custoAnual).toBeCloseTo(418.80, 2); // 34.90*12
    expect(r[1].custoAnual).toBeCloseTo(238.80, 2); // 19.90*12
    expect(r[0].mesesAtivos).toBe(4);
  });

  test('exclui gasto variável (alta variância)', () => {
    const txs = [
      { tipo: 'despesa', descricao: 'Mercado', valor: 80,  data: '2026-01-08' },
      { tipo: 'despesa', descricao: 'Mercado', valor: 400, data: '2026-02-08' },
      { tipo: 'despesa', descricao: 'Mercado', valor: 150, data: '2026-03-08' },
      { tipo: 'despesa', descricao: 'Mercado', valor: 220, data: '2026-04-08' },
    ];
    expect(AI.detectarAssinaturasEsquecidas(txs, { hoje: HOJE })).toEqual([]);
  });

  test('exclui assinatura que parou de cobrar (inativa)', () => {
    const txs = mensal('Academia', 99.00, ['01']).concat([
      { tipo: 'despesa', descricao: 'Academia', valor: 99, data: '2025-11-01' },
      { tipo: 'despesa', descricao: 'Academia', valor: 99, data: '2025-12-01' },
    ]);
    expect(AI.detectarAssinaturasEsquecidas(txs, { hoje: HOJE })).toEqual([]);
  });

  test('exclui recorrência curta (< minMeses)', () => {
    const txs = mensal('Curso', 50, ['03', '04']); // só 2 meses
    expect(AI.detectarAssinaturasEsquecidas(txs, { hoje: HOJE })).toEqual([]);
  });

  test('custoAnual = valorMensal * 12', () => {
    const txs = mensal('Icloud', 12.90, ['02', '03', '04']);
    const r = AI.detectarAssinaturasEsquecidas(txs, { hoje: HOJE });
    expect(r).toHaveLength(1);
    expect(r[0].custoAnual).toBeCloseTo(r[0].valorMensal * 12, 2);
  });

  test('respeita opts.limite', () => {
    const txs = [].concat(
      mensal('A-serv', 10, ['02', '03', '04']),
      mensal('B-serv', 20, ['02', '03', '04']),
      mensal('C-serv', 30, ['02', '03', '04'])
    );
    expect(AI.detectarAssinaturasEsquecidas(txs, { hoje: HOJE, limite: 2 })).toHaveLength(2);
  });

  test('entrada inválida retorna []', () => {
    expect(AI.detectarAssinaturasEsquecidas(null, { hoje: HOJE })).toEqual([]);
    expect(AI.detectarAssinaturasEsquecidas([], { hoje: HOJE })).toEqual([]);
  });
});

describe('AI_ENGINE.mensagemAssinaturasEsquecidas (#32)', () => {
  test('resume quantidade e total anual', () => {
    const txs = [].concat(
      mensal('Netflix', 34.90, ['01', '02', '03', '04']),
      mensal('Spotify', 19.90, ['02', '03', '04'])
    );
    const m = AI.mensagemAssinaturasEsquecidas(txs, { hoje: HOJE });
    expect(m.quantidade).toBe(2);
    expect(m.totalAnual).toBeCloseTo(657.60, 2);
    expect(m.texto).toContain('/ano');
  });

  test('null quando não há assinaturas', () => {
    expect(AI.mensagemAssinaturasEsquecidas([], { hoje: HOJE })).toBeNull();
  });
});
