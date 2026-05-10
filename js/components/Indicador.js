/**
 * Indicador — KPI card (ícone + valor + label)
 * API: UI.Indicador.render({ icone, valor, label, tipo, barra? }) → Element
 */
(function() {
  var UI = window.UI || {};

  UI.Indicador = {
    /**
     * @param {string} icone  - emoji
     * @param {string} valor  - texto principal (ex: "75%", "R$ 500", "12 dias")
     * @param {string} label  - descrição abaixo do valor
     * @param {string} tipo   - 'positivo'|'negativo'|'alerta'|'neutro'
     * @param {Object} [barra]- { pct: number, cor: string } — barra opcional
     * @returns {HTMLElement}
     */
    render: function(icone, valor, label, tipo, barra) {
      var el = document.createElement('div');
      el.className = 'indicador indicador-' + (tipo || 'neutro');

      var iconSpan = document.createElement('span');
      iconSpan.className = 'indicador-icon';
      iconSpan.textContent = icone;
      el.appendChild(iconSpan);

      var content = document.createElement('div');
      content.className = 'indicador-content';

      var valSpan = document.createElement('span');
      valSpan.className = 'indicador-valor';
      valSpan.textContent = valor;
      content.appendChild(valSpan);

      var labelSpan = document.createElement('span');
      labelSpan.className = 'indicador-label';
      labelSpan.textContent = label;
      content.appendChild(labelSpan);

      el.appendChild(content);

      if (barra) {
        el.appendChild(UI.ProgressBar.render(barra.pct, barra.cor));
      }

      return el;
    }
  };

  window.UI = UI;
})();
