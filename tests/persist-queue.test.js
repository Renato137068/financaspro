/**
 * persist-queue.test.js — fila local + idempotência + estados
 * @jest-environment jsdom
 */
const path = require('path');
const fs = require('fs');
const vm = require('vm');

const ARQUIVO = path.join(__dirname, '..', 'js', 'core', 'persist-queue.js');

function loadPersistQueue() {
  var code = fs.readFileSync(ARQUIVO, 'utf8');
  var store = {};
  var sessionStorage = {
    getItem: function(k) { return store[k] || null; },
    setItem: function(k, v) { store[k] = String(v); },
    removeItem: function(k) { delete store[k]; }
  };
  var txs = [];
  var DADOS = {
    getTransacoesRaw: function() { return txs.slice(); },
    salvarTransacao: function(t) {
      var i = txs.findIndex(function(x) { return x.clientKey && x.clientKey === t.clientKey; });
      if (i >= 0) { txs[i] = t; return t; }
      txs.push(t);
      return t;
    },
    aguardarDisco: function() { return Promise.resolve(true); }
  };
  var TRANSACOES = {
    criar: function(tipo, valor, categoria, data, descricao, banco, cartao, opts) {
      opts = opts || {};
      var tx = {
        id: 'id-' + (txs.length + 1),
        tipo: tipo,
        valor: valor,
        categoria: categoria,
        data: data,
        descricao: descricao || '',
        banco: banco || '',
        cartao: cartao || '',
        clientKey: opts.clientKey
      };
      return DADOS.salvarTransacao(tx);
    }
  };
  var UTILS = {
    gerarUuid: function() { return 'uuid-' + Math.random().toString(36).slice(2, 10); },
    gerarId: function() { return 'gid-' + Date.now(); }
  };
  // vm com o caminho real do arquivo: a cobertura V8 do Jest só conta script
  // com filename em js/ (com `new Function` o módulo aparecia com 0%).
  var mod = { exports: {} };
  var ctx = vm.createContext({
    module: mod, exports: mod.exports, console: console, sessionStorage: sessionStorage,
    document: document, window: window, UTILS: UTILS, DADOS: DADOS, TRANSACOES: TRANSACOES,
    OBS: undefined, Promise: Promise, setTimeout: setTimeout, CustomEvent: CustomEvent,
  });
  vm.runInContext(code, ctx, { filename: ARQUIVO });
  var PQ = ctx.PERSIST_QUEUE || mod.exports;
  PQ._resetForTests();
  PQ.__txs = txs;
  PQ.__DADOS = DADOS;
  return PQ;
}

describe('PERSIST_QUEUE', function() {
  test('enfileira, salva e confirma no storage', async function() {
    var PQ = loadPersistQueue();
    var item = await PQ.enqueueLancamento({
      tipo: 'despesa',
      valor: 10,
      categoria: 'alimentacao',
      data: '2026-08-01',
      descricao: 'teste'
    });
    expect(item.status).toBe('saved');
    expect(item.txId).toBeTruthy();
    expect(PQ.__txs.length).toBe(1);
    expect(PQ.getSnapshot().failed).toBe(0);
  });

  test('mesmo clientKey não duplica', async function() {
    var PQ = loadPersistQueue();
    var key = 'ck-fix';
    await PQ.enqueueLancamento({
      tipo: 'receita', valor: 100, categoria: 'salario', data: '2026-08-01', descricao: 'a'
    }, { clientKey: key });
    await PQ.enqueueLancamento({
      tipo: 'receita', valor: 100, categoria: 'salario', data: '2026-08-01', descricao: 'a'
    }, { clientKey: key });
    expect(PQ.__txs.length).toBe(1);
  });

  test('serializa 20 lançamentos rápidos sem perda', async function() {
    var PQ = loadPersistQueue();
    var jobs = [];
    for (var i = 0; i < 20; i++) {
      jobs.push(PQ.enqueueLancamento({
        tipo: i % 2 ? 'despesa' : 'receita',
        valor: 10 + i,
        categoria: 'outro',
        data: '2026-08-05',
        descricao: 'batch-' + i
      }));
    }
    await Promise.all(jobs);
    expect(PQ.__txs.length).toBe(20);
    expect(PQ.getSnapshot().failed).toBe(0);
    expect(PQ.isIdle()).toBe(true);
  });
});
