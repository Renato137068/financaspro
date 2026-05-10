/**
 * ProgressBar — barra de progresso com cor e status
 * API: UI.ProgressBar.render({ pct, cor, status })
 * Retorna: Element
 */
(function() {
  var UI = window.UI || {};

  UI.ProgressBar = {
    /**
     * @param {number} pct - percentual 0–100+ (truncado em 100 para a barra)
     * @param {string} cor - cor CSS do fill (hex ou keyword)
     * @param {string} [status] - 'excedido'|'alerta'|'ok' (só para classe semântica)
     * @returns {HTMLElement}
     */
    render: function(pct, cor, status) {
      var outer = document.createElement('div');
      outer.className = 'progress-bar' + (status ? ' progress-bar--' + status : '');

      var fill = document.createElement('div');
      fill.className = 'progress-fill';
      fill.style.width = Math.min(pct, 100) + '%';
      fill.style.backgroundColor = cor || '#66bb6a';

      outer.appendChild(fill);
      return outer;
    },

    /** Cor padrão pelo status do orçamento */
    corPorStatus: function(status) {
      if (status === 'excedido') return '#ef5350';
      if (status === 'alerta')   return '#ffa726';
      return '#66bb6a';
    }
  };

  window.UI = UI;
})();
