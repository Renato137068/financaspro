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
