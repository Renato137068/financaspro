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
    /\bconst (CONFIG|UTILS|VALIDATIONS|SCORE|PARSER|PIPELINE|ORCAMENTO|TRANSACOES|APP_STORE) =/g,
    'var $1 =',
  );
  vm.runInContext(code, context, { filename: file });
}

function loadCoreModules() {
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
    'var ariaLive = { announce:function(){}, announceToast:function(){}, announceSuccess:function(){}, announceError:function(){} };'
    + 'var EVENT_BUS = { on:function(){}, off:function(){}, emit:function(){} };'
    + 'var APRENDIZADO = { sugerir:function(){ return null; } };'
    + 'var CATEGORIZADOR = { detectar:function(){ return null; } };'
    + 'var DOMUTILS = { set:function(){} };'
    + 'var APP_STATE = { setState:function(){} };'
    + 'var ACTIONS = { TRANSACAO_CRIAR:"TRANSACAO_CRIAR", TRANSACAO_EDITAR:"TRANSACAO_EDITAR", TRANSACAO_DELETAR:"TRANSACAO_DELETAR", CONFIG_SALVAR:"CONFIG_SALVAR", CONTAS_SALVAR:"CONTAS_SALVAR", SYNC_CONCLUIR:"SYNC_CONCLUIR" };'
    + 'var DADOS = (function(){ var txs=[]; var cfg={orcamentos:{},recorrentes:[]};'
    + ' return { getConfig:function(){return cfg;}, getTransacoes:function(){return txs.slice();},'
    + ' salvarConfig:function(p){cfg=Object.assign({},cfg,p);return cfg;},'
    + ' salvarTransacao:function(t){txs.push(t);return t;} }; })();',
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
  loadScript(context, 'js/core/store.js');
}

module.exports = { loadCoreModules, loadScript };
