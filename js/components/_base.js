// FinançasPro — UI Components Base
// v11.0 — Carregado antes de todos os outros componentes em js/components/
// Centraliza fallbacks de UTILS/CONFIG para uso interno do namespace UI
(function() {
  var UI = window.UI || {};

  UI._utils = {
    esc: function(s) {
      if (typeof UTILS !== 'undefined' && UTILS.escapeHtml) return UTILS.escapeHtml(s);
      var d = document.createElement('div');
      d.textContent = String(s);
      return d.innerHTML;
    },
    moeda: function(v) {
      if (typeof UTILS !== 'undefined' && UTILS.formatarMoeda) return UTILS.formatarMoeda(v);
      return 'R$ ' + Number(v).toFixed(2).replace('.', ',');
    },
    label: function(cat) {
      if (typeof UTILS !== 'undefined' && UTILS.labelCategoria) return UTILS.labelCategoria(cat);
      if (typeof CONFIG !== 'undefined' && CONFIG.getCatLabel) return CONFIG.getCatLabel(cat);
      return String(cat);
    },
    dataRel: function(d) {
      if (typeof UTILS !== 'undefined' && UTILS.formatarDataRelativa) return UTILS.formatarDataRelativa(d);
      return String(d);
    },
    isReceita: function(tipo) {
      return tipo === (typeof CONFIG !== 'undefined' ? CONFIG.TIPO_RECEITA : 'receita');
    }
  };

  window.UI = UI;
})();
