/**
 * indicador-gasto-dia.test.js — indicador "Gasto médio/dia" no Resumo
 *
 * Substitui o antigo "Economia do mês", que repetia a mesma cifra do card de
 * Saldo (receitas − despesas) — redundância apontada na auditoria de UI/UX.
 * O ritmo diário usa despesas REAIS do mês ÷ dias decorridos; nunca a renda
 * configurada (que enganaria quem tem renda variável).
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
    agora: new Date(2026, 7, 15),   // 15 de agosto → 15 dias decorridos
    mes: 8,
    ano: 2026,
    config: { renda: rendaConfig },
    resumo: resumo
  };
  RENDER_DASHBOARD.renderIndicadores();
}

function gastoDia() {
  return indicadoresChamados.filter(function(c) {
    return c.label === 'Gasto médio/dia';
  });
}

describe('indicador Gasto médio/dia — base = despesas reais ÷ dias decorridos', function() {
  test('média diária = despesas do mês / dias decorridos', function() {
    // 1500 de despesa em 15 dias → 100/dia. A renda configurada não entra.
    renderCom({ receitas: 4000, despesas: 1500, saldo: 2500 }, 10000);

    var ind = gastoDia();
    expect(ind).toHaveLength(1);
    expect(ind[0].valor).toBe('R$ 100,00');
    expect(ind[0].tipo).toBe('neutro');
  });

  test('não repete mais a cifra de Saldo (Economia/Déficit sumiu)', function() {
    renderCom({ receitas: 2000, despesas: 3500, saldo: -1500 }, 8000);

    var labels = indicadoresChamados.map(function(c) { return c.label; }).join(' ');
    expect(labels).not.toMatch(/Economia do mês|Déficit do mês/);
    // 3500 / 15 = 233,33
    expect(gastoDia()[0].valor).toBe('R$ 233,33');
  });

  test('não aparece quando não há despesas no mês', function() {
    renderCom({ receitas: 1000, despesas: 0, saldo: 1000 }, 5000);
    expect(gastoDia()).toHaveLength(0);
  });

  test('não usa a renda configurada como base', function() {
    // Renda alta não deve inflar o gasto/dia — só as despesas contam.
    renderCom({ receitas: 200, despesas: 300, saldo: -100 }, 99999);
    expect(gastoDia()[0].valor).toBe('R$ 20,00'); // 300 / 15
  });
});
