/**
 * domUtils.js - DOM manipulation helpers
 * Reduz repetição de getElementById e melhora performance
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

const DOMUTILS = {
  // Cache de elementos críticos
  elementos: {},

  init: function() {
    DOMUTILS.elementos = {
      novoValor: DOMUTILS._safeGet('novo-valor'),
      novoDescricao: DOMUTILS._safeGet('novo-descricao'),
      novoCategoria: DOMUTILS._safeGet('novo-categoria'),
      novoTipo: DOMUTILS._safeGet('novo-tipo'),
      novoData: DOMUTILS._safeGet('novo-data'),
      novoBanco: DOMUTILS._safeGet('novo-banco'),
      novoCartao: DOMUTILS._safeGet('novo-cartao'),
      formTransacao: DOMUTILS._safeGet('form-transacao'),
      tipoIndicator: DOMUTILS._safeGet('tipo-indicator-text'),
      tipoIndicatorDot: DOMUTILS._safeGetQuery('.tipo-dot'),
      orcamentoPreview: DOMUTILS._safeGet('orcamento-preview'),
      grupoRecorrencia: DOMUTILS._safeGet('grupo-recorrencia'),
      grupoParcelas: DOMUTILS._safeGet('grupo-parcelas'),
      extraToggle: DOMUTILS._safeGet('extra-toggle'),
      extraContent: DOMUTILS._safeGet('extra-content'),
      resumoList: DOMUTILS._safeGet('resumo-list'),
      chartEvolucao: DOMUTILS._safeGet('chart-evolucao'),
      chartCategorias: DOMUTILS._safeGet('chart-categorias')
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
    if (!DOMUTILS.elementos[key]) {
      DOMUTILS.elementos[key] = document.getElementById(key);
    }
    return DOMUTILS.elementos[key];
  },

  set: function(elementId, value) {
    var el = DOMUTILS.get(elementId);
    if (el) el.value = value;
  },

  setText: function(elementId, text) {
    var el = DOMUTILS.get(elementId);
    if (el) el.textContent = text;
  },

  setHtml: function(elementId, html) {
    var el = DOMUTILS.get(elementId);
    if (el) el.innerHTML = html;
  },

  addClass: function(elementId, className) {
    var el = DOMUTILS.get(elementId);
    if (el) el.classList.add(className);
  },

  removeClass: function(elementId, className) {
    var el = DOMUTILS.get(elementId);
    if (el) el.classList.remove(className);
  },

  toggleClass: function(elementId, className) {
    var el = DOMUTILS.get(elementId);
    if (el) el.classList.toggle(className);
  },

  show: function(elementId) {
    var el = DOMUTILS.get(elementId);
    if (el) el.style.display = '';
  },

  hide: function(elementId) {
    var el = DOMUTILS.get(elementId);
    if (el) el.style.display = 'none';
  },

  setDisplay: function(elementId, tipo, mostra) {
    var el = DOMUTILS.get(elementId);
    if (el) el.style.display = mostra ? (tipo === 'receita' ? 'none' : '') : 'none';
  }
};

export { DOMUTILS };
export default DOMUTILS;
