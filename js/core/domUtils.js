/**
 * domUtils.js - DOM manipulation helpers
 * Reduz repetição de getElementById e melhora performance
 */

var DOMUTILS = {
  // Cache de elementos críticos
  elementos: {},

  init: function() {
    this.elementos = {
      novoValor: this._safeGet('novo-valor'),
      novoDescricao: this._safeGet('novo-descricao'),
      novoCategoria: this._safeGet('novo-categoria'),
      novoTipo: this._safeGet('novo-tipo'),
      novoData: this._safeGet('novo-data'),
      novoBanco: this._safeGet('novo-banco'),
      novoCartao: this._safeGet('novo-cartao'),
      formTransacao: this._safeGet('form-transacao'),
      tipoIndicator: this._safeGet('tipo-indicator-text'),
      tipoIndicatorDot: this._safeGetQuery('.tipo-dot'),
      orcamentoPreview: this._safeGet('orcamento-preview'),
      grupoRecorrencia: this._safeGet('grupo-recorrencia'),
      grupoParcelas: this._safeGet('grupo-parcelas'),
      extraToggle: this._safeGet('extra-toggle'),
      extraContent: this._safeGet('extra-content'),
      resumoList: this._safeGet('resumo-list'),
      chartEvolucao: this._safeGet('chart-evolucao'),
      chartCategorias: this._safeGet('chart-categorias')
    };
  },

  _safeGet: function(id) {
    try {
      return document.getElementById(id);
    } catch (e) {
      return null;
    }
  },

  _safeGetQuery: function(selector) {
    try {
      return document.querySelector(selector);
    } catch (e) {
      return null;
    }
  },

  get: function(key) {
    if (!this.elementos[key]) {
      this.elementos[key] = document.getElementById(key);
    }
    return this.elementos[key];
  },

  set: function(elementId, value) {
    var el = this.get(elementId);
    if (el) el.value = value;
  },

  setText: function(elementId, text) {
    var el = this.get(elementId);
    if (el) el.textContent = text;
  },

  setHtml: function(elementId, html) {
    var el = this.get(elementId);
    if (el) el.innerHTML = html;
  },

  addClass: function(elementId, className) {
    var el = this.get(elementId);
    if (el) el.classList.add(className);
  },

  removeClass: function(elementId, className) {
    var el = this.get(elementId);
    if (el) el.classList.remove(className);
  },

  toggleClass: function(elementId, className) {
    var el = this.get(elementId);
    if (el) el.classList.toggle(className);
  },

  show: function(elementId) {
    var el = this.get(elementId);
    if (el) el.style.display = '';
  },

  hide: function(elementId) {
    var el = this.get(elementId);
    if (el) el.style.display = 'none';
  },

  setDisplay: function(elementId, tipo, mostra) {
    var el = this.get(elementId);
    if (el) el.style.display = mostra ? (tipo === 'receita' ? 'none' : '') : 'none';
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DOMUTILS;
}
