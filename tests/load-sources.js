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
  // Captura document/window do jsdom e os fixa no global ANTES de contextificar.
  // No Node 18, propriedades presentes no global NO MOMENTO do vm.createContext
  // são resolvíveis dentro do sandbox (mesmo padrão do localStorage do
  // setup-globals); propriedades adicionadas DEPOIS não são. Prioriza os
  // identificadores diretos `document`/`window` (globais do ambiente jsdom).
  var _jsdomWindow = (typeof window !== 'undefined' && window) || global;
  var _jsdomDocument = (typeof document !== 'undefined' && document)
    || global.document
    || (_jsdomWindow && _jsdomWindow.document)
    || null;
  global.__jsdomWindow = _jsdomWindow;
  global.__jsdomDocument = _jsdomDocument;

  const context = vm.createContext(global);

  global.ariaLive = global.ariaLive || {
    announce: function() {},
    announceToast: function() {},
    announceSuccess: function() {},
    announceError: function() {},
  };
  global.EVENT_BUS = global.EVENT_BUS || {
    on: function() {},
    off: function() {},
    emit: function() {},
  };
  global.APRENDIZADO = global.APRENDIZADO || { sugerir: function() { return null; } };
  global.CATEGORIZADOR = global.CATEGORIZADOR || { detectar: function() { return null; } };
  global.DOMUTILS = global.DOMUTILS || { set: function() {} };
  global.APP_STATE = global.APP_STATE || { setState: function() {} };
  global.DADOS = global.DADOS || (function() {
    var txs = [];
    var cfg = { orcamentos: {}, recorrentes: [] };
    return {
      getConfig: function() { return cfg; },
      getTransacoes: function() { return txs.slice(); },
      salvarConfig: function(partial) {
        cfg = Object.assign({}, cfg, partial);
        return cfg;
      },
      salvarTransacao: function(tx) {
        txs.push(tx);
        return tx;
      },
    };
  }());
  global.ACTIONS = global.ACTIONS || {
    TRANSACAO_CRIAR: 'TRANSACAO_CRIAR',
    TRANSACAO_EDITAR: 'TRANSACAO_EDITAR',
    TRANSACAO_DELETAR: 'TRANSACAO_DELETAR',
    CONFIG_SALVAR: 'CONFIG_SALVAR',
    CONTAS_SALVAR: 'CONTAS_SALVAR',
    SYNC_CONCLUIR: 'SYNC_CONCLUIR',
  };

  // Alguns módulos referenciam estes fixtures como identificador nu (ex.:
  // pipeline.js: `APRENDIZADO.sugerir(...)`, sem guarda typeof). Defini-los via
  // `global.X = ...` resolve no Node ≥20, mas no ambiente jsdom do Jest sob
  // Node 18 uma propriedade adicionada ao global depois da contextificação não
  // liga a um identificador nu → ReferenceError. Declará-los como `var` via
  // CÓDIGO rodado no contexto (idêntico a como UTILS/PARSER são carregados)
  // cria bindings que resolvem igual em todas as versões suportadas.
  vm.runInContext(
    // Liga document/window do jsdom ao contexto VM. Sem isto, identificadores
    // nus como `document.createElement` dentro dos módulos (toasts, preenchimento
    // de formulário) não resolvem contra o sandbox e lançam ReferenceError.
    // IMPORTANTE: lemos via `globalThis.__jsdomX` (property access em runtime), e
    // NÃO por identificador nu `__jsdomX`. No Node 18, uma propriedade adicionada
    // ao global DEPOIS do vm.createContext não vira binding acessível por nome nu
    // dentro do sandbox — mas a leitura por propriedade em globalThis sempre funciona.
    'var window = globalThis.__jsdomWindow; var document = globalThis.__jsdomDocument;'
    + 'var ariaLive = { announce:function(){}, announceToast:function(){}, announceSuccess:function(){}, announceError:function(){} };'
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

  // Detecta se o `document` do jsdom é utilizável DENTRO do contexto VM. No
  // Node 18, o objeto document não vira identificador nu resolvível no sandbox
  // (funciona no Node 20/24). Testes que exercitam DOM via os módulos usam esta
  // flag para pular graciosamente onde o VM não tem document (a cobertura desses
  // caminhos é medida no job Node 20 do CI, que roda o coverage).
  try {
    global.__vmHasDocument = vm.runInContext(
      'typeof document !== "undefined" && !!document && typeof document.getElementById === "function"',
      context,
    );
  } catch (e) {
    global.__vmHasDocument = false;
  }
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
