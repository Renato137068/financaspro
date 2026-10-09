/**
 * resumo-aviso-renda.test.js — auditoria de ativação (09/10/2026): o primeiro
 * gasto sem renda deixava o Resumo só com um saldo vermelho. O cartão do saldo
 * ganha "Só gastos até agora." e o botão "Informe sua renda do mês", que abre
 * o Novo já em Receita (data-tipo no 'mudar-aba', o mesmo passo "renda" do guia "Comece aqui").
 * @jest-environment jsdom
 */
const path = require('path');
const vm = require('vm');
const { carregarDashboard } = require('./helpers/dashboard-renderer.cjs');
const { rodarNoContexto } = require('./helpers/esm-como-script.cjs');

var RD;
var txs = [];

beforeAll(function() {
  const sg = vm.createContext({ Math, Array, Object, String, Number });
  rodarNoContexto(sg, path.join(__dirname, '..', 'js', 'core', 'setup-guide.js'));
  var sandbox = {
    window: window, document: document, console: console,
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    DADOS: { getTransacoes: function() { return txs; } },
    SETUP_GUIDE: sg.SETUP_GUIDE,
    CONFIG: {}, UTILS: { formatarMoeda: function(v) { return 'R$ ' + v; } },
    RENDERER_BASE: {
      getEl: function(id) { return document.getElementById(id); },
      create: function(tag, attrs, content) {
        var el = document.createElement(tag);
        Object.keys(attrs || {}).forEach(function(k) { el.setAttribute(k, attrs[k]); });
        [].concat(content || []).forEach(function(c) {
          el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
        });
        return el;
      },
      money: function(v) { return 'R$ ' + v; }, escape: function(s) { return String(s); },
    },
    Object: Object, Date: Date, Math: Math, Number: Number, String: String, Array: Array,
  };
  sandbox.window.UI = {}; sandbox.globalThis = sandbox;
  RD = carregarDashboard(vm.createContext(sandbox));
});

function render(resumo, config) {
  // O renderer guarda os elementos em cache: o cartão é o mesmo em todo teste.
  if (!document.getElementById('card-saldo-principal')) {
    document.body.innerHTML = '<div id="card-saldo-principal"></div><span id="saldo-anuncio"></span>';
  }
  RD._ctx = { resumo: resumo, config: config || {} };
  RD.renderCardSaldo();
  // O cartão desenhou de verdade (sem cair no "Não foi possível carregar").
  expect(document.querySelector('#card-saldo-principal .saldo-valor')).not.toBeNull();
  var btn = document.querySelector('#card-saldo-principal button[data-tipo="receita"]');
  return btn && btn.parentNode;
}

describe('aviso de renda no cartão do saldo', function() {
  test('primeiro gasto sem renda: explica o saldo e oferece lançar a receita', function() {
    txs = [{ id: 1, tipo: 'despesa', valor: 45 }];
    var aviso = render({ saldo: -45, receitas: 0, despesas: 45 });
    expect(aviso).not.toBeNull();
    expect(aviso.textContent).toMatch(/Só gastos até agora/);
    var btn = aviso.querySelector('button');
    expect(btn.textContent).toBe('Informe sua renda do mês');
    expect(btn.getAttribute('data-action')).toBe('mudar-aba');
    expect(btn.getAttribute('data-aba')).toBe('novo');
    expect(btn.getAttribute('type')).toBe('button');
  });

  test('receita no mês ou em qualquer mês: sem aviso', function() {
    txs = [{ id: 1, tipo: 'despesa' }];
    expect(render({ saldo: 55, receitas: 100, despesas: 45 })).toBeNull();
    txs = [{ id: 1, tipo: 'despesa' }, { id: 2, tipo: 'receita' }];
    expect(render({ saldo: -45, receitas: 0, despesas: 45 })).toBeNull();
  });

  test('renda planejada (Orçamento ou tour) conta como informada', function() {
    txs = [{ id: 1, tipo: 'despesa' }];
    expect(render({ saldo: -45, receitas: 0, despesas: 45 }, { renda: 3000 })).toBeNull();
    expect(render({ saldo: -45, receitas: 0, despesas: 45 }, { rendaMensal: 3000 })).toBeNull();
  });

  test('mês sem gasto: sem aviso', function() {
    txs = [];
    expect(render({ saldo: 0, receitas: 0, despesas: 0 })).toBeNull();
  });
});
