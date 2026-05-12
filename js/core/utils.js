/**
 * @file utils.js — Utility functions
 * @module UTILS
 * Tier 1. Depende de: config.js
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valido
 * @property {string} [erro]
 * @property {*} [valor]
 */

/**
 * @typedef {Object} StorageCheck
 * @property {boolean} disponivel
 * @property {string} [erro]
 * @property {number} [tamanho]
 */

var UTILS = {
  /**
   * Formata número como moeda local.
   * @param {number} valor
   * @param {'BRL'|'USD'|'EUR'} [moeda='BRL']
   * @returns {string}
   */
  formatarMoeda: function(valor, moeda) {
    moeda = moeda || 'BRL';
    var config = CONFIG.MOEDA_FORMATACAO[moeda] || CONFIG.MOEDA_FORMATACAO.BRL;
    return new Intl.NumberFormat(config.locale, {
      style: 'currency',
      currency: config.currency
    }).format(valor);
  },

  /**
   * Formata data ISO ou string YYYY-MM-DD para DD/MM/YYYY.
   * Evita timezone bugs ao parsear strings ISO direto via split.
   * @param {string|Date} data
   * @returns {string}
   */
  formatarData: function(data) {
    var parts = String(data).split('T')[0].split('-');
    if (parts.length === 3) {
      return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    return new Intl.DateTimeFormat('pt-BR').format(new Date(data));
  },

  formatarDataHora: function(data) {
    if (typeof data === 'string') data = new Date(data);
    return new Intl.DateTimeFormat('pt-BR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    }).format(data);
  },

  /**
   * Valida transação básica (valor, tipo, categoria, data).
   * @param {Object} transacao
   * @returns {ValidationResult}
   */
  validarTransacao: function(transacao) {
    if (!transacao.valor || transacao.valor <= 0) {
      return { valido: false, erro: 'Valor deve ser maior que 0' };
    }
    if (!transacao.tipo || [CONFIG.TIPO_RECEITA, CONFIG.TIPO_DESPESA].indexOf(transacao.tipo) === -1) {
      return { valido: false, erro: 'Tipo invalido' };
    }
    if (!transacao.categoria) {
      return { valido: false, erro: 'Categoria obrigatoria' };
    }
    if (!transacao.data) {
      return { valido: false, erro: 'Data obrigatoria' };
    }
    return { valido: true };
  },

  /**
   * Exibe toast acessível (aria-live=polite).
   * @param {string} mensagem
   * @param {'info'|'success'|'error'|'warning'} [tipo='info']
   */
  mostrarToast: function(mensagem, tipo) {
    tipo = tipo || 'info';
    var toast = document.createElement('div');
    toast.className = 'toast toast-' + tipo;
    toast.textContent = mensagem;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    document.body.appendChild(toast);
    setTimeout(function() { toast.classList.add('show'); }, 10);
    setTimeout(function() {
      toast.classList.remove('show');
      setTimeout(function() { toast.remove(); }, 300);
    }, 3000);
  },

  calcularSaldo: function(transacoes) {
    return transacoes.reduce(function(acc, t) {
      return t.tipo === CONFIG.TIPO_RECEITA ? acc + t.valor : acc - t.valor;
    }, 0);
  },

  filtrarPorMes: function(transacoes, mes, ano) {
    return transacoes.filter(function(t) {
      var dataStr = String(t.data || '').split('T')[0];
      var parts = dataStr.split('-');
      if (parts.length === 3) {
        var anoTx = parseInt(parts[0], 10);
        var mesTx = parseInt(parts[1], 10);
        return mesTx === mes && anoTx === ano;
      }
      var data = new Date(t.data);
      return data.getMonth() === mes - 1 && data.getFullYear() === ano;
    });
  },

  filtrarPorTipo: function(transacoes, tipo) {
    return transacoes.filter(function(t) { return t.tipo === tipo; });
  },

  /**
   * Escapa string para HTML (atributos e conteúdo).
   * NÃO escapa para contexto JS string — para isso, evite onclick inline.
   * @param {*} text
   * @returns {string}
   */
  escapeHtml: function(text) {
    var map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return String(text).replace(/[&<>"']/g, function(m) { return map[m]; });
  },

  labelCategoria: function(key) {
    return CONFIG.CATEGORIAS_MAP[key] || key;
  },

  formatarDataRelativa: function(data) {
    var parts = String(data).split('T')[0].split('-');
    if (parts.length !== 3) return this.formatarData(data);
    var hoje = new Date();
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    if (d.toDateString() === hoje.toDateString()) return 'Hoje';
    if (d.toDateString() === ontem.toDateString()) return 'Ontem';
    return this.formatarData(data);
  },

  _idCounter: 0,
  /**
   * Gera ID único composto: timestamp + random36 + counter.
   * @returns {string}
   */
  gerarId: function() {
    var timestamp = Date.now();
    var randomPart = Math.random().toString(36).substr(2, 9);
    var counter = (this._idCounter = (this._idCounter || 0) + 1);
    return timestamp + '-' + randomPart + '-' + counter;
  },

  // Cache de elementos DOM
  _domCache: {},
  obterElemento: function(id) {
    if (!this._domCache[id]) {
      this._domCache[id] = document.getElementById(id);
    }
    return this._domCache[id];
  },

  limparCacheDom: function() {
    this._domCache = {};
  },

  // Debounce para eventos frequentes
  debounce: function(func, delay) {
    var timeout;
    return function() {
      var context = this, args = arguments;
      clearTimeout(timeout);
      timeout = setTimeout(function() { func.apply(context, args); }, delay);
    };
  },

  /**
   * Apenas valida quota localStorage — NÃO grava o dado real.
   * Chamador é responsável pelo setItem subsequente.
   * @param {*} dados
   * @param {string} chave
   * @returns {StorageCheck}
   */
  verificarStorageDisponivel: function(dados, chave) {
    try {
      var serializado = JSON.stringify(dados);
      // Calcula tamanho do payload + overhead de chave
      var tamanho = (chave.length + serializado.length) * 2; // UTF-16: 2 bytes/char
      // Teste leve: tenta gravar key temporária do mesmo tamanho aproximado
      var probe = '__sd_' + Date.now();
      var amostra = serializado.length > 4096 ? serializado.substring(0, 4096) : serializado;
      localStorage.setItem(probe, amostra);
      localStorage.removeItem(probe);
      return { disponivel: true, tamanho: tamanho };
    } catch (e) {
      if (e.name === 'QuotaExceededError' || e.code === 22) {
        return { disponivel: false, erro: 'Espaço de armazenamento cheio' };
      }
      return { disponivel: false, erro: e.message };
    }
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = UTILS;
}
