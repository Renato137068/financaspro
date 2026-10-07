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
const { carregarDashboard } = require('./helpers/dashboard-renderer.cjs');

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
  RD = carregarDashboard(ctx);
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

describe('primeiro uso — painel sem cartões zerados', function() {
  beforeEach(function() {
    document.body.innerHTML +=
      '<div id="aba-resumo"></div>';
  });

  test('sem lançamentos → #aba-resumo ganha resumo-primeiro-uso', function() {
    txs = [];
    RD.renderOnboarding();
    expect(document.getElementById('aba-resumo').classList.contains('resumo-primeiro-uso')).toBe(true);
  });

  test('com lançamentos → a classe sai', function() {
    txs = [{ id: 1 }];
    RD.renderOnboarding();
    expect(document.getElementById('aba-resumo').classList.contains('resumo-primeiro-uso')).toBe(false);
  });

  test('o CSS esconde os blocos que só mostrariam R$ 0,00', function() {
    var css = fs.readFileSync(path.join(__dirname, '..', 'css', 'layouts', 'dashboard.css'), 'utf8');
    ['.cards-container', '#dashboard-indicadores', '#secao-orcamento-resumo', '#secao-ultimas-transacoes', '#secao-analises']
      .forEach(function(sel) { expect(css).toContain('.resumo-primeiro-uso ' + sel); });
  });
});

describe('saudação', function() {
  // O renderer guarda o elemento em cache: o mesmo nó serve a todas as chamadas.
  var greeting = document.createElement('div');
  greeting.id = 'dashboard-greeting';

  function saudar(nome) {
    document.body.appendChild(greeting);
    RD._ctx = { config: { nome: nome }, agora: new Date(2026, 9, 6, 9), ano: 2026 };
    RD.renderGreeting();
    return greeting.querySelector('.greeting-hello').textContent;
  }

  test('sem nome não cumprimenta "Usuário"', function() {
    expect(saudar('Usuário')).toBe('Bom dia!');
    expect(saudar('Usuario')).toBe('Bom dia!');
    expect(saudar('')).toBe('Bom dia!');
  });

  test('com nome usa o nome', function() {
    expect(saudar('Maria')).toBe('Bom dia, Maria!');
  });
});
