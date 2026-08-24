/**
 * dashboard-resumo-cache.test.js — P2.1: memoização de obterResumoMes no ciclo render
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

var RENDER_DASHBOARD;
var sandbox;

beforeAll(function() {
  sandbox = {
    window: window,
    document: document,
    console: { error: function() {}, warn: function() {}, log: function() {} },
    OBS: { captureError: function() {} },
    UTILS: {
      formatarMoeda: function(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); },
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
      money: function(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); },
      escape: function(s) { return String(s); }
    },
    UI: {
      ComparacaoMes: { html: function() { return ''; } },
      BarChart6M: {
        render: function() {
          var d = document.createElement('div');
          d.className = 'chart-6m';
          return d;
        }
      },
      EmptyState: { html: function() { return ''; }, render: function() { return document.createElement('div'); } },
      Indicador: { render: function() { return document.createElement('div'); } },
      AlertaCard: { render: function() { return null; } },
      CardOrcamento: { renderResumo: function() { return document.createElement('div'); } },
      CardTransacao: { renderResumo: function() { return document.createElement('div'); } },
      DonutChart: { render: function() { return document.createElement('div'); } }
    },
    Object: Object,
    Date: Date,
    Math: Math,
    Number: Number,
    String: String,
    Array: Array
  };
  sandbox.window.UI = sandbox.UI;
  sandbox.globalThis = sandbox;
  var ctx = vm.createContext(sandbox);
  var file = path.join(__dirname, '..', 'js', 'render-dashboard.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  RENDER_DASHBOARD = sandbox.window.RENDER_DASHBOARD;
});

describe('P2.1 — memoização de resumos mensais no ciclo de render', function() {
  test('mesmo (mes, ano) não chama obterResumoMes mais de uma vez', function() {
    var spy = jest.fn(function(mes, ano) {
      return { saldo: mes, receitas: 1000 + mes, despesas: 400 + ano % 100 };
    });

    RENDER_DASHBOARD._ctx = {
      agora: new Date(2026, 7, 15),
      mes: 8,
      ano: 2026,
      tx: { obterResumoMes: spy },
      orc: null,
      config: {},
      resumoCache: {}
    };
    RENDER_DASHBOARD._ctx.resumo = RENDER_DASHBOARD._resumoMes(8, 2026);

    // Releitura do mês atual (comparação / indicadores usam ctx.resumo, mas
    // o helper também pode ser chamado de novo) — deve bater no cache.
    expect(RENDER_DASHBOARD._resumoMes(8, 2026)).toEqual(RENDER_DASHBOARD._ctx.resumo);
    expect(spy).toHaveBeenCalledTimes(1);

    document.body.innerHTML =
      '<div id="graficos-panel"></div>' +
      '<div id="chart-evolucao"></div>' +
      '<div id="comp-receitas"></div>' +
      '<div id="comp-despesas"></div>';
    RENDER_DASHBOARD.clearElementCache();

    RENDER_DASHBOARD.renderChartEvolucao();
    RENDER_DASHBOARD.renderComparacaoMesAnterior();

    var porChave = {};
    spy.mock.calls.forEach(function(args) {
      var k = args[1] + '-' + args[0];
      porChave[k] = (porChave[k] || 0) + 1;
    });
    Object.keys(porChave).forEach(function(k) {
      expect(porChave[k]).toBe(1);
    });
    // 6 meses do gráfico cobrem o mês atual (já cacheado) + 5 novos;
    // comparação pede o mês anterior (já dentro da janela de 6) — sem chamada extra.
    expect(spy).toHaveBeenCalledTimes(6);
  });
});
