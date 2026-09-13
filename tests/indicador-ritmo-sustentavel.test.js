/**
 * indicador-ritmo-sustentavel.test.js — referência de ritmo no "Gasto médio/dia"
 *
 * Item 1 da auditoria da aba Resumo: o número sozinho não dizia se o ritmo era
 * saudável. Agora, quando há renda (ou, sem renda, total de limites de
 * orçamento), o indicador compara o gasto/dia com o que caberia por dia no mês:
 *   gastoDia ≤ refDia → "dentro do ritmo" (positivo)
 *   gastoDia > refDia → "acima do sustentável" (alerta)
 * Sem renda nem orçamento, mantém a leitura neutra, sem inventar meta.
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
    window: window, document: document, console: console,
    UTILS: { formatarMoeda: function(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); } },
    CONFIG: { CORES_CATEGORIAS: {}, NOMES_MESES: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'] },
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
      Indicador: {
        render: function(icone, valor, label, tipo) {
          indicadoresChamados.push({ icone: icone, valor: valor, label: label, tipo: tipo });
          var el = document.createElement('div'); el.className = 'indicador'; return el;
        }
      }
    },
    Object: Object, Date: Date, Math: Math, Number: Number, String: String, Array: Array
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

// agosto/2026 tem 31 dias; dia 15 → 15 dias decorridos.
function renderCom(resumo, rendaConfig, orcMock) {
  RENDER_DASHBOARD._ctx = {
    agora: new Date(2026, 7, 15), mes: 8, ano: 2026,
    config: { renda: rendaConfig }, resumo: resumo, orc: orcMock || null
  };
  RENDER_DASHBOARD.renderIndicadores();
}

function ritmo() {
  return indicadoresChamados.filter(function(c) { return /^Gasto médio\/dia/.test(String(c.label)); })[0];
}

describe('ritmo por renda', function() {
  test('dentro do ritmo → positivo', function() {
    // renda 6000 / 31 ≈ 193,5/dia. Gasto 1500/15 = 100/dia < ref → dentro.
    renderCom({ receitas: 6000, despesas: 1500, saldo: 4500 }, 6000);
    expect(ritmo().tipo).toBe('positivo');
    expect(ritmo().label).toMatch(/dentro do ritmo/);
  });

  test('acima do sustentável → alerta', function() {
    // renda 3000 / 31 ≈ 96,8/dia. Gasto 3000/15 = 200/dia > ref → acima.
    renderCom({ receitas: 3000, despesas: 3000, saldo: 0 }, 3000);
    expect(ritmo().tipo).toBe('alerta');
    expect(ritmo().label).toMatch(/acima do sustent/);
  });
});

describe('ritmo por orçamento quando não há renda', function() {
  function orcCom(totalLimites) {
    return {
      obterStatusTodos: function() {
        return [
          { categoria: 'alimentacao', limite: totalLimites * 0.6 },
          { categoria: 'transporte', limite: totalLimites * 0.4 },
          { categoria: 'semlimite', limite: null }
        ];
      }
    };
  }

  test('sem renda, usa a soma dos limites (dentro → positivo)', function() {
    // limites somam 9300 → /31 ≈ 300/dia. Gasto 1500/15 = 100/dia → dentro.
    renderCom({ receitas: 0, despesas: 1500, saldo: -1500 }, 0, orcCom(9300));
    expect(ritmo().tipo).toBe('positivo');
    expect(ritmo().label).toMatch(/dentro do ritmo/);
  });

  test('sem renda, acima da soma dos limites → alerta', function() {
    // limites somam 1550 → /31 = 50/dia. Gasto 1500/15 = 100/dia → acima.
    renderCom({ receitas: 0, despesas: 1500, saldo: -1500 }, 0, orcCom(1550));
    expect(ritmo().tipo).toBe('alerta');
  });
});

describe('sem base real', function() {
  test('sem renda e sem orçamento → neutro, sem rótulo de ritmo', function() {
    renderCom({ receitas: 0, despesas: 1500, saldo: -1500 }, 0, null);
    var r = ritmo();
    expect(r.tipo).toBe('neutro');
    expect(r.label).toBe('Gasto médio/dia');
  });

  test('orçamento sem nenhum limite definido → neutro', function() {
    var orcVazio = { obterStatusTodos: function() { return [{ categoria: 'x', limite: null }]; } };
    renderCom({ receitas: 0, despesas: 1500, saldo: -1500 }, 0, orcVazio);
    expect(ritmo().tipo).toBe('neutro');
    expect(ritmo().label).toBe('Gasto médio/dia');
  });
});
