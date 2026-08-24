/**
 * economia-indicador.test.js — P2.4: base do indicador Economia/Déficit
 *
 * O indicador usava config.renda (configurada). Com renda variável ou receitas
 * lançadas diferentes do config, o número mentia. Agora usa receitas reais do mês.
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

var RENDER_DASHBOARD;
var indicadoresChamados;

beforeAll(function() {
  indicadoresChamados = [];

  var sandbox = {
    window: window,
    document: document,
    console: console,
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
        render: function(icone, valor, label, tipo) {
          indicadoresChamados.push({ icone: icone, valor: valor, label: label, tipo: tipo });
          var el = document.createElement('div');
          el.className = 'indicador';
          el.setAttribute('data-label', label);
          el.setAttribute('data-valor', valor);
          el.setAttribute('data-tipo', tipo);
          return el;
        }
      }
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

beforeEach(function() {
  indicadoresChamados.length = 0;
  document.body.innerHTML = '<div id="dashboard-indicadores"></div>';
});

function renderCom(resumo, rendaConfig) {
  RENDER_DASHBOARD._ctx = {
    agora: new Date(2026, 7, 15),
    mes: 8,
    ano: 2026,
    config: { renda: rendaConfig },
    resumo: resumo
  };
  RENDER_DASHBOARD.renderIndicadores();
}

describe('indicador Economia/Déficit — base = receitas reais', function() {
  test('usa receitas do mês, não a renda configurada', function() {
    // Config diz 10.000; lançamentos reais: 4.000 − 1.500 = 2.500
    renderCom({ receitas: 4000, despesas: 1500, saldo: 2500 }, 10000);

    var econ = indicadoresChamados.filter(function(c) {
      return /Economia|Déficit/.test(c.label);
    });
    expect(econ).toHaveLength(1);
    expect(econ[0].label).toBe('Economia do mês');
    expect(econ[0].valor).toBe('R$ 2500,00');
    expect(econ[0].tipo).toBe('positivo');
    // Não pode refletir 10000 − 1500 = 8500
    expect(econ[0].valor).not.toBe('R$ 8500,00');
  });

  test('rótulo e sinal de déficit quando despesas > receitas', function() {
    renderCom({ receitas: 2000, despesas: 3500, saldo: -1500 }, 8000);

    var econ = indicadoresChamados.filter(function(c) {
      return /Economia|Déficit/.test(c.label);
    })[0];
    expect(econ.label).toBe('Déficit do mês');
    expect(econ.valor).toBe('R$ 1500,00');
    expect(econ.tipo).toBe('negativo');
  });

  test('não usa mais os rótulos "prevista"/"estimado"', function() {
    renderCom({ receitas: 1000, despesas: 200, saldo: 800 }, 5000);
    var labels = indicadoresChamados.map(function(c) { return c.label; }).join(' ');
    expect(labels).not.toMatch(/prevista|estimado/i);
    expect(labels).toMatch(/Economia do mês/);
  });
});
