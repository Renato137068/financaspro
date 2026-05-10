/**
 * AlertaCard — card de alertas de orçamento
 * API: UI.AlertaCard.render(excedidos, avisos) → Element|null
 */
(function() {
  var UI = window.UI || {};

  UI.AlertaCard = {
    /**
     * @param {Array} excedidos - itens com status 'excedido'
     * @param {Array} avisos    - itens com status 'alerta'
     * @returns {HTMLElement|null} null se não há alertas
     */
    render: function(excedidos, avisos) {
      if (!excedidos.length && !avisos.length) return null;

      var card = document.createElement('div');
      card.className = 'alerta-card';

      var iconEl = document.createElement('div');
      iconEl.className = 'alerta-icon';
      iconEl.textContent = '⚠️';
      card.appendChild(iconEl);

      var content = document.createElement('div');
      content.className = 'alerta-content';

      if (excedidos.length > 0) {
        var linhaExc = document.createElement('div');
        linhaExc.className = 'alerta-linha alerta-danger';
        linhaExc.textContent = excedidos.length + ' categoria(s) estourou o limite: ';
        excedidos.forEach(function(s, i) {
          var strong = document.createElement('strong');
          strong.textContent = s.categoria;
          linhaExc.appendChild(strong);
          if (i < excedidos.length - 1) linhaExc.appendChild(document.createTextNode(', '));
        });
        content.appendChild(linhaExc);
      }

      if (avisos.length > 0) {
        var linhaAv = document.createElement('div');
        linhaAv.className = 'alerta-linha alerta-warning';
        linhaAv.textContent = avisos.length + ' categoria(s) acima de 80%: ';
        avisos.forEach(function(s, i) {
          var strong = document.createElement('strong');
          strong.textContent = s.categoria + ' (' + s.percentual + '%)';
          linhaAv.appendChild(strong);
          if (i < avisos.length - 1) linhaAv.appendChild(document.createTextNode(', '));
        });
        content.appendChild(linhaAv);
      }

      card.appendChild(content);
      return card;
    }
  };

  window.UI = UI;
})();
