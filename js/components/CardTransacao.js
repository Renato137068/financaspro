/**
 * CardTransacao.js — Transaction card component
 * Renders transaction items for the Extrato (statement) view and Dashboard summary
 * @version 11.0
 * @requires UI._utils
 * @module UI.CardTransacao
 */

(function() {
  var UI = window.UI || {};

  /**
   * Transaction card component
   * @namespace UI.CardTransacao
   */
  UI.CardTransacao = {
    /**
     * Renders a full transaction item for the Extrato (statement) view
     * @param {Object} t - Transaction object
     * @param {string} t.tipo - Transaction type ('receita' or 'despesa')
     * @param {string} t.descricao - Transaction description
     * @param {string} t.categoria - Transaction category
     * @param {string} t.data - Transaction date (ISO format)
     * @param {number} t.valor - Transaction value
     * @param {string} [t.banco] - Bank name (optional)
     * @param {string} [t.cartao] - Card name (optional)
     * @returns {HTMLElement} The rendered transaction item element
     */
    render: function(t) {
      var u = UI._utils;
      var isReceita = u.isReceita(t.tipo);

      var item = document.createElement('div');
      item.className = 'transacao-item';

      var info = document.createElement('div');
      info.className = 'transacao-info';

      var desc = document.createElement('div');
      desc.className = 'transacao-descricao';
      desc.textContent = u.dtext(t.descricao || t.categoria);
      info.appendChild(desc);

      var meta = document.createElement('div');
      meta.className = 'transacao-data';
      var parts = [u.label(t.categoria), u.dataRel(t.data)];
      if (t.banco)  parts.push('<i data-lucide="building-2" aria-hidden="true"></i> ' + t.banco);
      if (t.cartao) parts.push('<i data-lucide="credit-card" aria-hidden="true"></i> ' + t.cartao);
      meta.textContent = parts.join(' · ');
      info.appendChild(meta);

      item.appendChild(info);

      var valor = document.createElement('div');
      valor.className = 'transacao-valor ' + t.tipo;
      valor.textContent = (isReceita ? '+ ' : '- ') + u.moeda(t.valor);
      item.appendChild(valor);

      if (typeof renderLucideIcons === 'function') {
        renderLucideIcons(item);
      }
      return item;
    },

    /**
     * Renders a compact transaction item with icon for the Dashboard summary
     * @param {Object} t - Transaction object
     * @param {string} t.tipo - Transaction type ('receita' or 'despesa')
     * @param {string} t.descricao - Transaction description
     * @param {string} t.categoria - Transaction category
     * @param {string} t.data - Transaction date (ISO format)
     * @param {number} t.valor - Transaction value
     * @returns {HTMLElement} The rendered compact transaction item element
     */
    renderResumo: function(t) {
      var u = UI._utils;
      var isReceita = u.isReceita(t.tipo);

      var item = document.createElement('div');
      item.className = 'transacao-resumo-item transacao-tipo-' + t.tipo;

      var icon = document.createElement('div');
      icon.className = 'transacao-icon';
      icon.innerHTML = isReceita ? '<i data-lucide="trending-up" aria-hidden="true"></i>' : '<i data-lucide="trending-down" aria-hidden="true"></i>';
      item.appendChild(icon);

      var info = document.createElement('div');
      info.className = 'transacao-info';

      var desc = document.createElement('div');
      desc.className = 'transacao-desc';
      desc.textContent = u.dtext(t.descricao || t.categoria);
      info.appendChild(desc);

      var metaEl = document.createElement('div');
      metaEl.className = 'transacao-meta';
      metaEl.textContent = u.label(t.categoria) + ' · ' + u.dataRel(t.data);
      info.appendChild(metaEl);

      item.appendChild(info);

      var valorEl = document.createElement('div');
      valorEl.className = 'transacao-valor ' + (isReceita ? 'valor-receita' : 'valor-despesa');
      valorEl.textContent = (isReceita ? '+ ' : '- ') + u.moeda(t.valor);
      item.appendChild(valorEl);

      if (typeof renderLucideIcons === 'function') {
        renderLucideIcons(item);
      }
      return item;
    }
  };

  window.UI = UI;
})();
