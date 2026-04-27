/**
 * dados.js - Data Persistence Layer
 * Tier 0: No dependencies (except CONFIG)
 */

var DADOS = {
  _initialized: false,

  init: function() {
    if (this._initialized) return;
    this._initialized = true;
    if (!localStorage.getItem(CONFIG.STORAGE_TRANSACOES)) {
      localStorage.setItem(CONFIG.STORAGE_TRANSACOES, JSON.stringify([]));
    }
    if (!localStorage.getItem(CONFIG.STORAGE_CONFIG)) {
      localStorage.setItem(CONFIG.STORAGE_CONFIG, JSON.stringify(CONFIG.DEFAULT_CONFIG));
    }
  },

  getTransacoes: function() {
    try {
      var data = localStorage.getItem(CONFIG.STORAGE_TRANSACOES);
      if (!data) return [];
      var parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (e) {
      console.error('Erro ao carregar transacoes:', e);
      return [];
    }
  },

  salvarTransacao: function(transacao) {
    var transacoes = this.getTransacoes();
    transacao.id = transacao.id || UTILS.gerarId();
    transacao.dataCriacao = transacao.dataCriacao || new Date().toISOString();
    var index = -1;
    for (var i = 0; i < transacoes.length; i++) {
      if (transacoes[i].id === transacao.id) { index = i; break; }
    }
    if (index >= 0) {
      transacoes[index] = transacao;
    } else {
      transacoes.push(transacao);
    }
    localStorage.setItem(CONFIG.STORAGE_TRANSACOES, JSON.stringify(transacoes));
    return transacao;
  },

  deletarTransacao: function(id) {
    var transacoes = this.getTransacoes();
    var index = -1;
    for (var i = 0; i < transacoes.length; i++) {
      if (transacoes[i].id === id) { index = i; break; }
    }
    if (index >= 0) {
      transacoes.splice(index, 1);
      localStorage.setItem(CONFIG.STORAGE_TRANSACOES, JSON.stringify(transacoes));
      return true;
    }
    return false;
  },

  getConfig: function() {
    try {
      var data = localStorage.getItem(CONFIG.STORAGE_CONFIG);
      if (!data) return Object.assign({}, CONFIG.DEFAULT_CONFIG);
      var parsed = JSON.parse(data);
      return Object.assign({}, CONFIG.DEFAULT_CONFIG, parsed);
    } catch (e) {
      console.error('Erro ao carregar config:', e);
      return Object.assign({}, CONFIG.DEFAULT_CONFIG);
    }
  },

  salvarConfig: function(config) {
    var atual = this.getConfig();
    var merged = Object.assign({}, atual, config);
    localStorage.setItem(CONFIG.STORAGE_CONFIG, JSON.stringify(merged));
    return merged;
  },

  limparTodos: function() {
    localStorage.removeItem(CONFIG.STORAGE_TRANSACOES);
    localStorage.removeItem(CONFIG.STORAGE_CONFIG);
    this._initialized = false;
    this.init();
  },

  getRecorrentes: function() {
    try {
      var config = this.getConfig();
      return Array.isArray(config.recorrentes) ? config.recorrentes : [];
    } catch (e) {
      return [];
    }
  },

  salvarRecorrente: function(recData) {
    var config = this.getConfig();
    if (!Array.isArray(config.recorrentes)) config.recorrentes = [];
    recData.id = recData.id || UTILS.gerarId();
    recData.dataCriacao = new Date().toISOString();
    config.recorrentes.push(recData);
    this.salvarConfig(config);
    return recData;
  },

  exportarDados: function() {
    return {
      transacoes: this.getTransacoes(),
      config: this.getConfig(),
      dataExportacao: new Date().toISOString()
    };
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DADOS;
}
