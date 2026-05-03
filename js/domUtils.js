/**
 * domUtils.js - DOM manipulation helpers
 * Reduz repetição de getElementById e melhora performance
 */

var DOMUTILS = {
  // Cache de elementos críticos
  elementos: {},

  init: function() {
    this.elementos = {
      novoValor: document.getElementById('novo-valor'),
      novoDescricao: document.getElementById('novo-descricao'),
      novoCategoria: document.getElementById('novo-categoria'),
      novoTipo: document.getElementById('novo-tipo'),
      novoData: document.getElementById('novo-data'),
      formTransacao: document.getElementById('form-transacao'),
      tipoIndicator: document.getElementById('tipo-indicator-text'),
      tipoIndicatorDot: document.querySelector('.tipo-dot'),
      orcamentoPreview: document.getElementById('orcamento-preview'),
      grupoRecorrencia: document.getElementById('grupo-recorrencia'),
      grupoParcelas: document.getElementById('grupo-parcelas'),
      extraToggle: document.getElementById('extra-toggle'),
      extraContent: document.getElementById('extra-content'),
      resumoList: document.getElementById('resumo-list'),
      chartEvolucao: document.getElementById('chart-evolucao'),
      chartCategorias: document.getElementById('chart-categorias')
    };
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
