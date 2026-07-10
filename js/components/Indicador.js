// FinançasPro — Indicador: KPI card (ícone + valor + label)
// v11.0 — Depende de: ProgressBar.js (opcional, só quando barra fornecida)
(function() {
  var UI = window.UI || {};

  function _renderIcon(iconSpan, icone) {
    iconSpan.setAttribute('aria-hidden', 'true');
    if (!icone) {
      iconSpan.innerHTML = '<i data-lucide="circle" aria-hidden="true"></i>';
      return;
    }
    if (typeof icone === 'string' && icone.indexOf('<') !== -1) {
      iconSpan.innerHTML = icone;
      return;
    }
    if (typeof icone === 'string' && /^[a-z0-9-]+$/.test(icone)) {
      iconSpan.innerHTML = '<i data-lucide="' + icone + '" aria-hidden="true"></i>';
      return;
    }
    iconSpan.textContent = icone;
  }

  UI.Indicador = {
    // render(icone, valor, label, tipo, barra?) → HTMLElement
    // icone: nome Lucide ('wallet'), HTML com <i data-lucide>, ou emoji legado
    // tipo: 'positivo'|'negativo'|'alerta'|'neutro' — barra: { pct, cor }
    render: function(icone, valor, label, tipo, barra) {
      var el = document.createElement('div');
      el.className = 'indicador indicador-' + (tipo || 'neutro');

      var iconSpan = document.createElement('span');
      iconSpan.className = 'indicador-icon';
      _renderIcon(iconSpan, icone);
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

      if (barra && UI.ProgressBar && typeof UI.ProgressBar.render === 'function') {
        el.appendChild(UI.ProgressBar.render(barra.pct, barra.cor));
      }

      if (typeof renderLucideIcons === 'function') {
        renderLucideIcons(el);
      }

      return el;
    }
  };

  window.UI = UI;
})();
