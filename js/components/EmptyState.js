/**
 * EmptyState — componente de estado vazio
 * API: UI.EmptyState.render({ emoji, texto, aba })
 * Retorna: Element
 */
(function() {
  var UI = window.UI || {};

  UI.EmptyState = {
    /**
     * @param {string} emoji
     * @param {string} texto
     * @param {string} [aba] - data-mudar-aba para o botão CTA
     * @returns {HTMLElement}
     */
    render: function(emoji, texto, aba) {
      var wrapper = document.createElement('div');
      wrapper.className = 'empty-state';

      var iconEl = document.createElement('div');
      iconEl.className = 'empty-emoji';
      iconEl.textContent = emoji;
      wrapper.appendChild(iconEl);

      var textEl = document.createElement('p');
      textEl.className = 'empty-texto';
      textEl.textContent = texto;
      wrapper.appendChild(textEl);

      if (aba) {
        var btn = document.createElement('button');
        btn.className = 'btn-empty-cta';
        btn.type = 'button';
        btn.setAttribute('data-mudar-aba', aba);
        btn.textContent = '➕ Começar agora';
        wrapper.appendChild(btn);
      }

      return wrapper;
    },

    /** Versão que retorna string HTML (compatibilidade com innerHTML) */
    html: function(emoji, texto, aba) {
      var escape = (typeof UTILS !== 'undefined' && UTILS.escapeHtml)
        ? function(s) { return UTILS.escapeHtml(s); }
        : function(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; };

      return '<div class="empty-state">' +
        '<div class="empty-emoji">' + emoji + '</div>' +
        '<p class="empty-texto">' + escape(texto) + '</p>' +
        (aba ? '<button class="btn-empty-cta" type="button" data-mudar-aba="' + escape(aba) + '">➕ Começar agora</button>' : '') +
      '</div>';
    }
  };

  window.UI = UI;
})();
