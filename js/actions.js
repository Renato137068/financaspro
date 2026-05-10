/**
 * actions.js — Catálogo de ações e handlers de domínio
 * v11.0 — Depende de: store.js
 *
 * Padrão de uso:
 *   APP_STORE.dispatch(ACTIONS.TRANSACAO_CRIAR, transacao);
 *
 * Para observar mudanças:
 *   APP_STORE.subscribe('dados.transacoesVer', function() {
 *     var txs = DADOS.getTransacoes(); // relê da fonte da verdade
 *     render(txs);
 *   });
 */

var ACTIONS = Object.freeze({
  // Transações
  TRANSACAO_CRIAR:   'transacao/criar',
  TRANSACAO_EDITAR:  'transacao/editar',
  TRANSACAO_DELETAR: 'transacao/deletar',

  // Config
  CONFIG_SALVAR: 'config/salvar',

  // Contas
  CONTAS_SALVAR: 'contas/salvar',

  // Orçamentos
  ORCAMENTO_DEFINIR: 'orcamento/definir',
  ORCAMENTO_REMOVER: 'orcamento/remover',

  // Sincronização com API
  SYNC_INICIAR:   'sync/iniciar',
  SYNC_CONCLUIR:  'sync/concluir',
  SYNC_FALHAR:    'sync/falhar',

  // UI
  UI_ABA_MUDAR:       'ui/aba/mudar',
  UI_FILTRO_DEFINIR:  'ui/filtro/definir',
  UI_FILTROS_LIMPAR:  'ui/filtros/limpar',
  UI_EDICAO_INICIAR:  'ui/edicao/iniciar',
  UI_EDICAO_CANCELAR: 'ui/edicao/cancelar'
});

// ============================================================
// HANDLERS DE AÇÃO
// Cada handler recebe o payload e pode acessar APP_STORE.
// Regra: handlers são puros em relação ao DOM — sem render aqui.
// ============================================================

function _registrarActionHandlers() {
  if (typeof APP_STORE === 'undefined') {
    console.warn('[ACTIONS] APP_STORE não disponível — handlers não registrados');
    return;
  }

  // --- Transações ---

  APP_STORE.registerActionHandler(ACTIONS.TRANSACAO_CRIAR, function(transacao) {
    APP_STORE.cache.invalidar('transacoes');
    APP_STORE.cache.invalidar('orcamentos');
    var ver = (APP_STORE.get('dados.transacoesVer') || 0) + 1;
    APP_STORE.set('dados.transacoesVer', ver);
  });

  APP_STORE.registerActionHandler(ACTIONS.TRANSACAO_EDITAR, function(transacao) {
    APP_STORE.cache.invalidar('transacoes');
    APP_STORE.cache.invalidar('orcamentos');
    var ver = (APP_STORE.get('dados.transacoesVer') || 0) + 1;
    APP_STORE.set('dados.transacoesVer', ver);
  });

  APP_STORE.registerActionHandler(ACTIONS.TRANSACAO_DELETAR, function(id) {
    APP_STORE.cache.invalidar('transacoes');
    APP_STORE.cache.invalidar('orcamentos');
    var ver = (APP_STORE.get('dados.transacoesVer') || 0) + 1;
    APP_STORE.set('dados.transacoesVer', ver);
  });

  // --- Config ---

  APP_STORE.registerActionHandler(ACTIONS.CONFIG_SALVAR, function(config) {
    APP_STORE.cache.invalidar('config');
    var ver = (APP_STORE.get('dados.configVer') || 0) + 1;
    APP_STORE.set('dados.configVer', ver);
  });

  // --- Contas ---

  APP_STORE.registerActionHandler(ACTIONS.CONTAS_SALVAR, function(contas) {
    APP_STORE.cache.invalidar('transacoes'); // saldos calculados podem mudar
    var ver = (APP_STORE.get('dados.contasVer') || 0) + 1;
    APP_STORE.set('dados.contasVer', ver);
  });

  // --- Orçamentos ---

  APP_STORE.registerActionHandler(ACTIONS.ORCAMENTO_DEFINIR, function(payload) {
    APP_STORE.cache.invalidar('orcamentos');
    var ver = (APP_STORE.get('dados.orcamentosVer') || 0) + 1;
    APP_STORE.set('dados.orcamentosVer', ver);
  });

  APP_STORE.registerActionHandler(ACTIONS.ORCAMENTO_REMOVER, function(categoria) {
    APP_STORE.cache.invalidar('orcamentos');
    var ver = (APP_STORE.get('dados.orcamentosVer') || 0) + 1;
    APP_STORE.set('dados.orcamentosVer', ver);
  });

  // --- Sincronização ---

  APP_STORE.registerActionHandler(ACTIONS.SYNC_INICIAR, function() {
    APP_STORE.sync.setPending(true);
  });

  APP_STORE.registerActionHandler(ACTIONS.SYNC_CONCLUIR, function() {
    APP_STORE.sync.setPending(false);
    APP_STORE.sync.setLastSync(Date.now());
    APP_STORE.sync.setOnline(true);
    // Invalida todos os caches — dados frescos vieram da API
    APP_STORE.cache.invalidar();
    // Incrementa todos os versioners para notificar subscribers
    APP_STORE.set('dados.transacoesVer', (APP_STORE.get('dados.transacoesVer') || 0) + 1);
    APP_STORE.set('dados.configVer',     (APP_STORE.get('dados.configVer')     || 0) + 1);
    APP_STORE.set('dados.contasVer',     (APP_STORE.get('dados.contasVer')     || 0) + 1);
    APP_STORE.set('dados.orcamentosVer', (APP_STORE.get('dados.orcamentosVer') || 0) + 1);
  });

  APP_STORE.registerActionHandler(ACTIONS.SYNC_FALHAR, function(erro) {
    APP_STORE.sync.setPending(false);
    APP_STORE.sync.setOnline(false);
  });

  // --- UI ---

  APP_STORE.registerActionHandler(ACTIONS.UI_ABA_MUDAR, function(aba) {
    APP_STORE.ui.setAba(aba);
  });

  APP_STORE.registerActionHandler(ACTIONS.UI_FILTRO_DEFINIR, function(payload) {
    APP_STORE.ui.setFiltro(payload.tipo, payload.valor);
  });

  APP_STORE.registerActionHandler(ACTIONS.UI_FILTROS_LIMPAR, function() {
    APP_STORE.ui.limparFiltros();
  });

  APP_STORE.registerActionHandler(ACTIONS.UI_EDICAO_INICIAR, function(id) {
    APP_STORE.form.setEdicao(id);
  });

  APP_STORE.registerActionHandler(ACTIONS.UI_EDICAO_CANCELAR, function() {
    APP_STORE.form.limpar();
  });

  console.log('[ACTIONS] ' + Object.keys(ACTIONS).length + ' ações registradas');
}

// Auto-registrar: se store já existe, registra imediatamente;
// caso contrário aguarda DOMContentLoaded (quando todos os scripts já carregaram).
if (typeof APP_STORE !== 'undefined') {
  _registrarActionHandlers();
} else {
  document.addEventListener('DOMContentLoaded', _registrarActionHandlers);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ACTIONS: ACTIONS };
}
