/**
 * indicador-renda-cta.test.js — duas correções da auditoria da aba Resumo:
 *   1. A barra do indicador "% da renda" usa TOKENS do design-system
 *      (var(--color-danger|warning|success)), não hex fixos — assim adapta
 *      ao tema escuro e não escapa do verificador de tokens.
 *   2. Sem renda cadastrada, o espaço vira um CTA "Defina sua renda" que
 *      leva a Orçamento › Planejamento, em vez de sumir sem convite.
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

var RENDER_DASHBOARD;
var indicadoresChamados;
var ctasCriados;

beforeAll(function() {
  indicadoresChamados = [];
  ctasCriados = [];

  var sandbox = {
    window: window,
    document: document,
    console: console,
    UTILS: { formatarMoeda: function(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); } },
    CONFIG: { CORES_CATEGORIAS: {}, NOMES_MESES: ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'] },
    RENDERER_BASE: {
      getEl: function(id) { return document.getElementById(id); },
      // create mais completo: class, textContent e demais atributos (data-*).
      create: function(tag, attrs) {
        var el = document.createElement(tag);
        if (attrs) {
          Object.keys(attrs).forEach(function(k) {
            if (k === 'class') el.className = attrs[k];
            else if (k === 'textContent') el.textContent = attrs[k];
            else el.setAttribute(k, attrs[k]);
          });
        }
        // Rastreia o CTA da renda direto na criação: o vm+jsdom tem identidade
        // de document instável entre testes, então não dá para confiar em
        // document.querySelector aqui (o teste gasto-dia também evita o DOM).
        if (attrs && typeof attrs.class === 'string' && attrs.class.indexOf('indicador-cta') !== -1) {
          ctasCriados.push(el);
        }
        return el;
      },
      money: function(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); },
      escape: function(s) { return String(s); }
    },
    UI: {
      Indicador: {
        render: function(icone, valor, label, tipo, barra) {
          indicadoresChamados.push({ icone: icone, valor: valor, label: label, tipo: tipo, barra: barra });
          var el = document.createElement('div');
          el.className = 'indicador';
          el.setAttribute('data-label', label);
          return el;
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
  ctasCriados.length = 0;
  document.body.innerHTML = '<div id="dashboard-indicadores"></div>';
});

function renderCom(resumo, rendaConfig) {
  RENDER_DASHBOARD._ctx = {
    agora: new Date(2026, 7, 15),
    mes: 8, ano: 2026,
    config: { renda: rendaConfig },
    resumo: resumo
  };
  RENDER_DASHBOARD.renderIndicadores();
}

function indRenda() {
  return indicadoresChamados.filter(function(c) { return /% da renda/.test(String(c.valor)); });
}

describe('correção 1 — barra "% da renda" por tokens', function() {
  test('gasto acima da renda → var(--color-danger)', function() {
    renderCom({ receitas: 5000, despesas: 6000, saldo: -1000 }, 5000); // 120%
    expect(indRenda()[0].barra.cor).toBe('var(--color-danger)');
  });

  test('gasto entre 80% e 100% → var(--color-warning)', function() {
    renderCom({ receitas: 5000, despesas: 4500, saldo: 500 }, 5000); // 90%
    expect(indRenda()[0].barra.cor).toBe('var(--color-warning)');
  });

  test('gasto confortável → var(--color-success)', function() {
    renderCom({ receitas: 5000, despesas: 2000, saldo: 3000 }, 5000); // 40%
    expect(indRenda()[0].barra.cor).toBe('var(--color-success)');
  });

  test('nenhuma cor hex crua é passada para a barra', function() {
    renderCom({ receitas: 5000, despesas: 6000, saldo: -1000 }, 5000);
    expect(indRenda()[0].barra.cor).not.toMatch(/#[0-9a-fA-F]{3,6}/);
  });
});

describe('correção 2 — CTA "Defina sua renda" quando renda = 0', function() {
  test('renda 0 não renderiza o indicador "% da renda"', function() {
    renderCom({ receitas: 3000, despesas: 1000, saldo: 2000 }, 0);
    expect(indRenda()).toHaveLength(0);
  });

  test('renda 0 renderiza um botão que leva a Orçamento › Planejamento', function() {
    renderCom({ receitas: 3000, despesas: 1000, saldo: 2000 }, 0);
    expect(ctasCriados).toHaveLength(1);
    var cta = ctasCriados[0];
    expect(cta.tagName).toBe('BUTTON');
    expect(cta.getAttribute('data-mudar-aba')).toBe('orcamento');
    expect(cta.getAttribute('data-orc-sub')).toBe('planejamento');
    expect(cta.getAttribute('aria-label')).toMatch(/renda/i);
  });

  test('com renda cadastrada, não há CTA', function() {
    renderCom({ receitas: 5000, despesas: 2000, saldo: 3000 }, 5000);
    expect(ctasCriados).toHaveLength(0);
    expect(indRenda()).toHaveLength(1);
  });
});

describe('regressão estática', function() {
  test('render-dashboard.js não passa mais hex fixo para a barra da renda', function() {
    var src = fs.readFileSync(path.join(__dirname, '..', 'js', 'render-dashboard.js'), 'utf8');
    var trecho = src.slice(src.indexOf('var corBarra'), src.indexOf('var corBarra') + 200);
    expect(trecho).toContain('var(--color-danger)');
    expect(trecho).toContain('var(--color-warning)');
    expect(trecho).toContain('var(--color-success)');
  });

  test('o CSS do CTA existe e usa tokens', function() {
    var css = fs.readFileSync(path.join(__dirname, '..', 'css', 'layouts', 'dashboard.css'), 'utf8');
    var bloco = css.slice(css.indexOf('.indicador-cta {'), css.indexOf('.indicador-cta:hover'));
    expect(bloco).toContain('var(--color-border)');
    expect(bloco).not.toMatch(/#[0-9a-fA-F]{3,6}(?![\w-])/);
  });
});
