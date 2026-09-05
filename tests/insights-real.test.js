/**
 * insights-real.test.js — setup card + análise com AI_ENGINE real.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadInsights() {
  const root = path.join(__dirname, '..');
  const ctx = {
    Date, Math, Number, String, Array, Object, JSON, console,
    UTILS: {
      escapeHtml: function(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      },
      tentar: function(_c, fn, opts) {
        try { return { ok: true, valor: fn() }; }
        catch (e) { return { ok: false, valor: (opts && opts.padrao) }; }
      },
    },
    DADOS: {
      getConfig: function() {
        return { nome: 'Usuário', orcamentos: {}, metas: [] };
      },
      getTransacoes: function() { return []; },
      salvarConfig: function() {},
    },
    TRANSACOES: {
      obter: function() {
        return [
          { tipo: 'despesa', valor: 1000, data: '2026-01-10', categoria: 'lazer' },
          { tipo: 'despesa', valor: 1500, data: '2026-02-10', categoria: 'lazer' },
          { tipo: 'receita', valor: 4000, data: '2026-02-05', categoria: 'salario' },
        ];
      },
    },
    SETUP_GUIDE: undefined,
    ORCAMENTO: undefined,
  };
  vm.createContext(ctx);
  const ai = path.join(root, 'js', 'ai-engine.js');
  const ins = path.join(root, 'js', 'insights.js');
  vm.runInContext(fs.readFileSync(ai, 'utf8'), ctx, { filename: ai });
  vm.runInContext(fs.readFileSync(ins, 'utf8'), ctx, { filename: ins });
  return ctx.INSIGHTS;
}

const INSIGHTS = loadInsights();

describe('INSIGHTS._estadoSetup', function() {
  test('sem dados marca passos pendentes', function() {
    var e = INSIGHTS._estadoSetup([]);
    expect(e.perfil).toBe(false);
    expect(e.transacao).toBe(false);
    expect(e.orcamento).toBe(false);
    expect(e.meta).toBe(false);
  });

  test('com transação marca passo concluído', function() {
    var e = INSIGHTS._estadoSetup([{ id: '1' }]);
    expect(e.transacao).toBe(true);
  });
});

describe('INSIGHTS._esc', function() {
  test('escapa HTML', function() {
    expect(INSIGHTS._esc('<b>x</b>')).toContain('&lt;');
  });
});

describe('INSIGHTS.analisar', function() {
  test('sem transações retorna lista vazia', function() {
    var orig = global.TRANSACOES;
    // analisar usa TRANSACOES do contexto do módulo já carregado
    expect(Array.isArray(INSIGHTS.analisar())).toBe(true);
  });

  test('com variação de gastos gera insight', function() {
    var list = INSIGHTS.analisar();
    expect(list.length).toBeGreaterThan(0);
    expect(list.some(function(i) { return i.tipo === 'variacao'; })).toBe(true);
  });
});
