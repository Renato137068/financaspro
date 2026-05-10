/**
 * CardOrcamento — item de orçamento com barra de progresso
 * API: UI.CardOrcamento.render(statusItem) → Element
 *      UI.CardOrcamento.renderResumo(statusItem) → Element (compacto)
 */
(function() {
  var UI = window.UI || {};

  UI.CardOrcamento = {
    /**
     * @param {Object} s - { categoria, status, percentual, gasto, limite }
     * @returns {HTMLElement} — clicável, navega para aba orçamento
     */
    render: function(s) {
      var escape = typeof UTILS !== 'undefined' ? UTILS.escapeHtml : function(v) { return String(v); };
      var moeda  = typeof UTILS !== 'undefined' ? UTILS.formatarMoeda : function(v) { return 'R$ ' + v.toFixed(2); };
      var label  = typeof UTILS !== 'undefined' ? UTILS.labelCategoria(s.categoria) : s.categoria;
      var cor    = UI.ProgressBar.corPorStatus(s.status);
      var pct    = s.percentual || 0;

      var item = document.createElement('div');
      item.className = 'orcamento-item orcamento-item--link';
      item.setAttribute('data-mudar-aba', 'orcamento');
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-label', 'Ver orçamento de ' + label);

      // Header: nome + badge status
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

      // Progress bar
      item.appendChild(UI.ProgressBar.render(pct, cor, s.status));

      // Subvalor
      var sub = document.createElement('div');
      sub.className = 'orcamento-subvalor';
      sub.textContent = moeda(s.gasto) + ' de ' + moeda(s.limite);
      item.appendChild(sub);

      return item;
    },

    /** Versão compacta para o painel de resumo */
    renderResumo: function(s) {
      var moeda = typeof UTILS !== 'undefined' ? UTILS.formatarMoeda : function(v) { return 'R$ ' + v.toFixed(2); };
      var cor   = UI.ProgressBar.corPorStatus(s.status);
      var pct   = Math.min(s.percentual || 0, 100);

      var item = document.createElement('div');
      item.className = 'orcamento-item-resumo orcamento-status-' + s.status;

      var infoEl = document.createElement('div');
      infoEl.className = 'orcamento-info';

      var nomeEl = document.createElement('span');
      nomeEl.className = 'orcamento-nome';
      nomeEl.textContent = s.categoria;
      infoEl.appendChild(nomeEl);

      var valoresEl = document.createElement('span');
      valoresEl.className = 'orcamento-valores';
      valoresEl.textContent = moeda(s.gasto) + ' / ' + moeda(s.limite);
      infoEl.appendChild(valoresEl);

      item.appendChild(infoEl);
      item.appendChild(UI.ProgressBar.render(pct, cor, s.status));

      return item;
    }
  };

  window.UI = UI;
})();
