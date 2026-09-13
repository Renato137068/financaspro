/**
 * resumo-topo-hierarquia.test.js — roadmap da auditoria do Resumo:
 *   1. A tagline "Método 50/30/20…" aparece só no primeiro uso (junto do
 *      onboarding) e some quando já há lançamentos — enxuga o topo.
 *   2. "Disponível para gastar" sobe para logo abaixo do Saldo (hierarquia:
 *      Saldo → Disponível → detalhe), antes dos alertas e dos cards.
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

var RD;
var txs = [];

beforeAll(function() {
  var sandbox = {
    window: window, document: document, console: console,
    DADOS: { getTransacoes: function() { return txs; } },
    CONFIG: {}, UTILS: { formatarMoeda: function(v){ return 'R$ ' + v; } },
    RENDERER_BASE: {
      getEl: function(id){ return document.getElementById(id); },
      create: function(tag, attrs){ var el=document.createElement(tag); if(attrs&&attrs.class)el.className=attrs.class; return el; },
      money: function(v){ return 'R$ ' + v; }, escape: function(s){ return String(s); }
    },
    Object: Object, Date: Date, Math: Math, Number: Number, String: String, Array: Array
  };
  sandbox.window.UI = {}; sandbox.globalThis = sandbox;
  var ctx = vm.createContext(sandbox);
  var file = path.join(__dirname, '..', 'js', 'render-dashboard.js');
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file });
  RD = sandbox.window.RENDER_DASHBOARD;
});

beforeEach(function() {
  document.body.innerHTML =
    '<p id="dashboard-method-tagline">Método 50/30/20</p>' +
    '<section id="dashboard-onboarding" hidden></section>';
});

describe('tagline 50/30/20 — só no primeiro uso', function() {
  test('sem lançamentos → tagline visível (junto do onboarding)', function() {
    txs = [];
    RD.renderOnboarding();
    expect(document.getElementById('dashboard-method-tagline').hidden).toBe(false);
    expect(document.getElementById('dashboard-onboarding').hidden).toBe(false);
  });

  test('com lançamentos → tagline e onboarding escondidos', function() {
    txs = [{ id: 1 }, { id: 2 }];
    RD.renderOnboarding();
    expect(document.getElementById('dashboard-method-tagline').hidden).toBe(true);
    expect(document.getElementById('dashboard-onboarding').hidden).toBe(true);
  });
});

describe('hierarquia do topo — "Disponível para gastar" logo abaixo do Saldo', function() {
  var html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  var resumo = html.slice(html.indexOf('id="aba-resumo"'), html.indexOf('id="aba-novo"'));
  var posSaldo = resumo.indexOf('id="card-saldo-principal"');
  var posDisp = resumo.indexOf('id="secao-disponivel"');
  var posCards = resumo.indexOf('class="cards-container"');
  var posInd = resumo.indexOf('id="dashboard-indicadores"');

  test('secao-disponivel vem depois do Saldo', function() {
    expect(posSaldo).toBeGreaterThan(-1);
    expect(posDisp).toBeGreaterThan(posSaldo);
  });

  test('secao-disponivel vem ANTES dos cards Receitas/Despesas e dos indicadores', function() {
    expect(posDisp).toBeLessThan(posCards);
    expect(posDisp).toBeLessThan(posInd);
  });
});
