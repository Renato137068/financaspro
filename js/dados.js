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
    var index = transacoes.findIndex(function(t) { return t.id === transacao.id; });
    if (index >= 0) {
      transacoes[index] = transacao;
    } else {
      transacoes.push(transacao);
    }
    var check = UTILS.verificarStorageDisponivel(transacoes, CONFIG.STORAGE_TRANSACOES);
    if (!check.disponivel) {
      console.error('Storage indisponível:', check.erro);
      throw new Error(check.erro);
    }
    localStorage.setItem(CONFIG.STORAGE_TRANSACOES, JSON.stringify(transacoes));
    return transacao;
  },

  deletarTransacao: function(id) {
    var transacoes = this.getTransacoes();
    var index = transacoes.findIndex(function(t) { return t.id === id; });
    if (index >= 0) {
      transacoes.splice(index, 1);
      var check = UTILS.verificarStorageDisponivel(transacoes, CONFIG.STORAGE_TRANSACOES);
      if (!check.disponivel) {
        console.error('Storage indisponível:', check.erro);
        return false;
      }
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
  },

  // Sync entre abas: atualiza cache quando outra aba muda o localStorage
  setupStorageSync: function() {
    var self = this;
    window.addEventListener('storage', function(e) {
      if (e.key === CONFIG.STORAGE_TRANSACOES || e.key === CONFIG.STORAGE_CONFIG) {
        if (typeof TRANSACOES !== 'undefined') TRANSACOES.init();
        if (typeof ORCAMENTO !== 'undefined') ORCAMENTO.init();
        if (typeof RENDER !== 'undefined') RENDER.init();
      }
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DADOS;
}
