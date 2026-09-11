/**
 * extrato-lista-click.test.js — P0.1: listener delegado não acumula por render
 * @jest-environment jsdom
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
var INIT_EXTRATO;
var editCalls;

function carregarModulo() {
  editCalls = [];
  var sandbox = {
    window: window,
    document: document,
    console: { error: function() {}, warn: function() {}, log: function() {} },
    CONFIG: {
      TIPO_RECEITA: 'receita',
      TIPO_DESPESA: 'despesa',
      TIPO_TRANSFERENCIA: 'transferencia',
      getCatLabel: function(s) { return s; }
    },
    UTILS: {
      escapeHtml: function(s) {
        return String(s)
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;');
      },
      formatarMoeda: function(v) { return 'R$ ' + Number(v).toFixed(2).replace('.', ','); }
    },
    TRANSACOES: { obter: function() { return []; } },
    Object: Object,
    Array: Array,
    String: String,
    Number: Number,
    Date: Date,
    Math: Math
  };
  sandbox.globalThis = sandbox;
  var code = fs.readFileSync(path.join(root, 'js', 'modules', 'init-extrato.js'), 'utf8')
    .replace(/\bconst INIT_EXTRATO =/, 'var INIT_EXTRATO =');
  var ctx = vm.createContext(sandbox);
  vm.runInContext(code, ctx, { filename: path.join(root, 'js', 'modules', 'init-extrato.js') });
  var mod = sandbox.INIT_EXTRATO || ctx.INIT_EXTRATO;
  mod.editarTransacao = function(id) { editCalls.push(id); };
  mod._carregarMais = function() {};
  mod.getCatIcon = function() { return ''; };
  mod.getCatCor = function() { return '#000'; };
  mod.state.selecionados = [];
  mod.state.virtualScroll.pageSize = 50;
  return mod;
}

describe('P0.1 — clique na lista executa uma vez após vários renders', function() {
  beforeEach(function() {
    document.body.innerHTML = '<div id="lista-transacoes"></div>';
    INIT_EXTRATO = carregarModulo();
    INIT_EXTRATO.listaTransacoesListener = false;
  });

  test('3 renders + 1 clique → editarTransacao chamado 1×', function() {
    var txs = [{
      id: 'tx-1',
      data: '2026-08-24',
      descricao: 'Mercado',
      categoria: 'alimentacao',
      tipo: 'despesa',
      valor: 42
    }];
    var grupos = { HOJE: txs };

    for (var i = 0; i < 3; i++) {
      INIT_EXTRATO._renderGrupos(grupos, txs);
    }

    var item = document.querySelector('.ext-tx');
    expect(item).toBeTruthy();
    item.click();

    expect(editCalls).toEqual(['tx-1']);
  });

  test('_bindListaTransacoesClick só registra listeners uma vez', function() {
    var container = document.getElementById('lista-transacoes');
    var spy = jest.spyOn(container, 'addEventListener');
    INIT_EXTRATO._bindListaTransacoesClick();
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockClear();
    INIT_EXTRATO._bindListaTransacoesClick();
    expect(spy).toHaveBeenCalledTimes(0);
    spy.mockRestore();
  });
});
