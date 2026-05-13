// FinançasPro — Indicador: KPI card (ícone + valor + label)
// v11.0 — Depende de: ProgressBar.js (opcional, só quando barra fornecida)
(function() {
  var UI = window.UI || {};

  UI.Indicador = {
    // render(icone, valor, label, tipo, barra?) → HTMLElement
    // tipo: 'positivo'|'negativo'|'alerta'|'neutro' — barra: { pct, cor }
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
