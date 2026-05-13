// FinançasPro — CardOrcamento: item de orçamento com barra de progresso
// v11.0 — Depende de: _base.js, ProgressBar.js
(function() {
  var UI = window.UI || {};

  UI.CardOrcamento = {
    // render(s) → HTMLElement — card clicável, navega para aba orçamento
    // s: { categoria, status, percentual, gasto, limite }
    render: function(s) {
      var u     = UI._utils;
      var label = u.label(s.categoria);
      var cor   = UI.ProgressBar.corPorStatus(s.status);
      var pct   = s.percentual || 0;

      var item = document.createElement('div');
      item.className = 'orcamento-item orcamento-item--link';
      item.setAttribute('data-mudar-aba', 'orcamento');
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-label', 'Ver orçamento de ' + label);

      var header = document.createElement('div');
      header.className = 'orcamento-header';

      var nomeEl = document.createElement('span');
      nomeEl.className = 'orcamento-categoria';
      nomeEl.textContent = label;
      header.appendChild(nomeEl);

      var badge = document.createElement('span');
      badge.className = 'status-' + s.status;
      badge.textContent = pct + '%';
      header.appendChild(badge);

      item.appendChild(header);
      item.appendChild(UI.ProgressBar.render(pct, cor, s.status));

      var sub = document.createElement('div');
      sub.className = 'orcamento-subvalor';
      sub.textContent = u.moeda(s.gasto) + ' de ' + u.moeda(s.limite);
      item.appendChild(sub);

      return item;
    },

    // renderResumo(s) → HTMLElement — versão compacta para o painel Dashboard
    renderResumo: function(s) {
      var u   = UI._utils;
      var cor = UI.ProgressBar.corPorStatus(s.status);
      var pct = Math.min(s.percentual || 0, 100);

      var item = document.createElement('div');
      item.className = 'orcamento-item-resumo orcamento-status-' + s.status;

      var infoEl = document.createElement('div');
      infoEl.className = 'orcamento-info';

      var nomeEl = document.createElement('span');
      nomeEl.className = 'orcamento-nome';
      nomeEl.textContent = u.label(s.categoria); // era s.categoria (slug bruto)
      infoEl.appendChild(nomeEl);

      var valoresEl = document.createElement('span');
      valoresEl.className = 'orcamento-valores';
      valoresEl.textContent = u.moeda(s.gasto) + ' / ' + u.moeda(s.limite);
      infoEl.appendChild(valoresEl);

      item.appendChild(infoEl);
      item.appendChild(UI.ProgressBar.render(pct, cor, s.status));

      return item;
    }
  };

  window.UI = UI;
})();
