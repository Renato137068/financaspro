/**
 * dashboard-onrender.test.js — P2.5: render() não cita INIT_*; hooks onRender
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const dashSrc = fs.readFileSync(path.join(__dirname, '..', 'js', 'render-dashboard.js'), 'utf8');

describe('P2.5 — desacoplamento INIT_* via onRender', function() {
  test('render() do dashboard não referencia INIT_* por nome', function() {
    const renderFn = dashSrc.match(/DashboardRenderer\.render\s*=\s*function\s*\([\s\S]*?\n  \};/);
    expect(renderFn).toBeTruthy();
    expect(renderFn[0]).not.toMatch(/INIT_METAS|INIT_CONTAS_PAGAR|INIT_ASSINATURAS|INIT_PATRIMONIO|INIT_RELATORIOS/);
    expect(renderFn[0]).toMatch(/_onRenderFns/);
    expect(dashSrc).toMatch(/DashboardRenderer\.onRender\s*=\s*function/);
  });

  test('onRender respeita ordem numérica dos inscritos', function() {
    var sandbox = {
      window: window,
      document: document,
      console: console,
      UTILS: { formatarMoeda: function(v) { return String(v); }, escapeHtml: function(s) { return String(s); } },
      CONFIG: { CORES_CATEGORIAS: {}, NOMES_MESES: [] },
      RENDERER_BASE: {
        getEl: function() { return null; },
        create: function(t) { return document.createElement(t); },
        money: function(v) { return String(v); },
        escape: function(s) { return String(s); }
      },
      UI: {},
      Object: Object,
      Date: Date,
      Math: Math,
      Array: Array,
      String: String,
      Number: Number
    };
    sandbox.window.UI = sandbox.UI;
    sandbox.globalThis = sandbox;
    var ctx = vm.createContext(sandbox);
    var file = path.join(__dirname, '..', 'js', 'render-dashboard.js');
    vm.runInContext(dashSrc, ctx, { filename: file });

    var ordem = [];
    var RD = sandbox.window.RENDER_DASHBOARD;
    RD.onRender(function() { ordem.push('relatorios'); }, 50);
    RD.onRender(function() { ordem.push('metas'); }, 10);
    RD.onRender(function() { ordem.push('patrimonio'); }, 40);

    // Dispara só os hooks (sub-renderers saem cedo sem DOM)
    document.body.innerHTML = '';
    RD.clearElementCache();
    RD.render();

    expect(ordem).toEqual(['metas', 'patrimonio', 'relatorios']);
  });
});
