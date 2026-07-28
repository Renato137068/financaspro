/**
 * load-sources.js — carrega módulos frontend (globals) para cobertura Jest
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function loadScript(context, relativePath) {
  const file = path.join(root, relativePath);
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(
    /\bconst (CONFIG|UTILS|VALIDATIONS|SCORE|PARSER|PIPELINE|ORCAMENTO|TRANSACOES|APP_STORE|METAS) =/g,
    'var $1 =',
  );
  vm.runInContext(code, context, { filename: file });
}

function loadCoreModules() {
  var jsdomWindow = (typeof window !== 'undefined' && window) || global;
  var jsdomDocument = (typeof document !== 'undefined' && document)
    || global.document
    || (jsdomWindow && jsdomWindow.document)
    || null;

  // Sandbox PRÓPRIO com os globais de HOST que os módulos usam como identificador
  // nu. vm.createContext(global) NÃO projeta host globals (document, timers,
  // console, TextEncoder, ...) para dentro do sandbox no Node 18 — só os built-ins
  // (Object/Array/JSON/Math/Date/Intl/Promise) e propriedades próprias do objeto
  // contextificado. Injetá-los como PROPRIEDADES PRÓPRIAS de um sandbox resolve em
  // TODAS as versões do Node. Os módulos são carregados aqui (var → prop do
  // sandbox) e depois copiados para `global` para os testes acessarem.
  // Timers como wrappers que delegam ao GLOBAL ATUAL em cada chamada — assim
  // `jest.useFakeTimers()` (que troca os globais depois do load) intercepta os
  // módulos. Referência estática quebraria os fake timers. São funções planas,
  // então projetam no sandbox em qualquer versão do Node.
  var sandbox = {
    window: jsdomWindow,
    document: jsdomDocument,
    localStorage: global.localStorage,
    console: global.console,
    setTimeout: function() { return global.setTimeout.apply(null, arguments); },
    clearTimeout: function() { return global.clearTimeout.apply(null, arguments); },
    setInterval: function() { return global.setInterval.apply(null, arguments); },
    clearInterval: function() { return global.clearInterval.apply(null, arguments); },
    queueMicrotask: function() { return global.queueMicrotask.apply(null, arguments); },
    fetch: function() { return global.fetch.apply(null, arguments); },
    Intl: global.Intl,
  };
  sandbox.globalThis = sandbox;
  const context = vm.createContext(sandbox);

  // Fixtures das dependências dos módulos, declarados como `var` no contexto
  // (viram propriedades do sandbox, resolvíveis por nome nu em qualquer versão).
  vm.runInContext(
    'var ariaLive = { announce:function(){}, announceToast:function(){}, announceSuccess:function(){}, announceError:function(){} };'
    + 'var EVENT_BUS = { on:function(){}, off:function(){}, emit:function(){} };'
    + 'var APRENDIZADO = { sugerir:function(){ return null; } };'
    + 'var CATEGORIZADOR = { detectar:function(){ return null; } };'
    + 'var DOMUTILS = { set:function(){} };'
    + 'var APP_STATE = { setState:function(){} };'
    + 'var ACTIONS = { TRANSACAO_CRIAR:"TRANSACAO_CRIAR", TRANSACAO_EDITAR:"TRANSACAO_EDITAR", TRANSACAO_DELETAR:"TRANSACAO_DELETAR", CONFIG_SALVAR:"CONFIG_SALVAR", CONTAS_SALVAR:"CONTAS_SALVAR", SYNC_CONCLUIR:"SYNC_CONCLUIR" };'
    // Fixture DADOS fiel o suficiente para exercitar upsert/delete/reset dos
    // módulos reais (TRANSACOES.atualizar/deletar, ORCAMENTO.*). salvarTransacao
    // faz upsert por id — sem isso, atualizar() duplicaria em vez de substituir.
    + 'var DADOS = (function(){ var txs=[]; var cfg={orcamentos:{},recorrentes:[]};'
    + ' function idx(id){ for(var i=0;i<txs.length;i++){ if(txs[i].id===id) return i; } return -1; }'
    + ' return { getConfig:function(){return cfg;}, getTransacoes:function(){return txs.slice();},'
    + ' salvarConfig:function(p){cfg=Object.assign({},cfg,p);return cfg;},'
    + ' salvarTransacao:function(t){ var i=idx(t.id); if(i>=0){txs[i]=t;}else{txs.push(t);} return t; },'
    + ' deletarTransacao:function(id){ var i=idx(id); if(i>=0){txs.splice(i,1);return true;} return false; },'
    + ' _resetFixture:function(){ txs.length=0; cfg={orcamentos:{},recorrentes:[]}; } }; })();',
    context,
    { filename: 'test-fixtures-bootstrap' },
  );

  loadScript(context, 'js/core/config.js');
  loadScript(context, 'js/core/utils.js');
  loadScript(context, 'js/core/validations.js');
  loadScript(context, 'js/score.js');
  loadScript(context, 'js/parser.js');
  loadScript(context, 'js/pipeline.js');
  loadScript(context, 'js/orcamento.js');
  loadScript(context, 'js/transacoes.js');
  loadScript(context, 'js/metas.js');
  loadScript(context, 'js/core/store.js');

  // Expõe os módulos e fixtures carregados (propriedades do sandbox) ao `global`,
  // para os testes acessarem via global.UTILS/PIPELINE/DADOS/etc.
  [
    'CONFIG', 'UTILS', 'VALIDATIONS', 'SCORE', 'PARSER', 'PIPELINE', 'ORCAMENTO',
    'TRANSACOES', 'METAS', 'APP_STORE', 'APP_STATE', 'DADOS', 'ACTIONS',
  ].forEach(function(k) {
    if (typeof sandbox[k] !== 'undefined') global[k] = sandbox[k];
  });

  // Flags de compatibilidade (com o sandbox injetado, devem ser true em todas as
  // versões; permanecem como rede de segurança para os testes de DOM/timers).
  function probe(expr) {
    try { return !!vm.runInContext(expr, context); } catch (e) { return false; }
  }
  global.__vmHasDocument = probe(
    'typeof document !== "undefined" && !!document && typeof document.getElementById === "function"',
  );
  global.__vmHasTimers = probe(
    'typeof setTimeout === "function" && typeof clearTimeout === "function" && typeof setInterval === "function"',
  );
}

// Reseta o estado in-memory do fixture DADOS e os caches dos módulos, para
// isolar testes entre si sem recarregar todo o contexto VM.
function resetFixtures() {
  if (global.DADOS && typeof global.DADOS._resetFixture === 'function') {
    global.DADOS._resetFixture();
  }
  if (global.TRANSACOES) {
    global.TRANSACOES._cache = null;
    global.TRANSACOES._cacheTimestamp = null;
  }
  if (global.ORCAMENTO) global.ORCAMENTO._cache = null;
}

module.exports = { loadCoreModules, loadScript, resetFixtures };
