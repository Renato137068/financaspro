/**
 * dashboard-erros-observaveis.test.js — P2.3: catch de sub-renderer
 * reporta em OBS e deixa mensagem discreta no container.
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

var RENDER_DASHBOARD;
var obsCalls;
var sandbox;

beforeAll(function() {
  obsCalls = [];
  sandbox = {
    window: window,
    document: document,
    console: {
      error: function() {},
      warn: function() {},
      log: function() {}
    },
    OBS: {
      captureError: function(err, ctx) {
        obsCalls.push({ err: err, ctx: ctx });
      }
    },
    UTILS: {
      formatarMoeda: function(v) {
        return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
      },
      escapeHtml: function(s) { return String(s); }
    },
    CONFIG: {
      CORES_CATEGORIAS: {},
      NOMES_MESES: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']
    },
    RENDERER_BASE: {
      getEl: function(id) { return document.getElementById(id); },
      create: function(tag, attrs) {
        var el = document.createElement(tag);
        if (attrs && attrs.class) el.className = attrs.class;
        return el;
      },
      money: function(v) {
        return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
      },
      escape: function(s) { return String(s); }
    },
    UI: {
      Indicador: {
        render: function() {
          throw new Error('falha simulada nos indicadores');
        }
      }
    },
    Object: Object,
    Date: Date,
    Math: Math,
    Number: Number,
    String: String,
    Array: Array,
    typeof: undefined
  };
  sandbox.window.UI = sandbox.UI;
  sandbox.window.OBS = sandbox.OBS;
  sandbox.globalThis = sandbox;
  var ctx = vm.createContext(sandbox);

  var file = path.join(__dirname, '..', 'js', 'render-dashboard.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  RENDER_DASHBOARD = sandbox.window.RENDER_DASHBOARD;
});

beforeEach(function() {
  obsCalls.length = 0;
  document.body.innerHTML = '<div id="dashboard-indicadores">conteúdo prévio</div>';
  if (RENDER_DASHBOARD.clearElementCache) RENDER_DASHBOARD.clearElementCache();
});

describe('P2.3 — erros de sub-renderer observáveis', function() {
  test('OBS.captureError recebe contexto render:indicadores e UI explica a falha', function() {
    RENDER_DASHBOARD._ctx = {
      agora: new Date(2026, 7, 15),
      mes: 8,
      ano: 2026,
      config: { renda: 5000 },
      resumo: { receitas: 4000, despesas: 1500, saldo: 2500 }
    };

    expect(function() {
      RENDER_DASHBOARD.renderIndicadores();
    }).not.toThrow();

    expect(obsCalls.length).toBe(1);
    expect(obsCalls[0].ctx).toEqual({ contexto: 'render:indicadores' });
    expect(String(obsCalls[0].err && obsCalls[0].err.message)).toMatch(/falha simulada/);

    var el = document.getElementById('dashboard-indicadores');
    expect(el.textContent).toBe('Não foi possível carregar esta seção');
  });

  test('sem OBS disponível o catch não propaga', function() {
    var bak = sandbox.OBS;
    sandbox.OBS = undefined;
    RENDER_DASHBOARD._ctx = {
      agora: new Date(2026, 7, 15),
      mes: 8,
      ano: 2026,
      config: { renda: 5000 },
      resumo: { receitas: 4000, despesas: 1500, saldo: 2500 }
    };
    expect(function() {
      RENDER_DASHBOARD.renderIndicadores();
    }).not.toThrow();
    expect(document.getElementById('dashboard-indicadores').textContent)
      .toBe('Não foi possível carregar esta seção');
    sandbox.OBS = bak;
  });
});
