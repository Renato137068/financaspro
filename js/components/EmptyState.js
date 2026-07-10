/**
 * EmptyState.js — Reusable empty state component
 * Displays empty states with animations and configurable CTA buttons
 * @version 11.0
 * @requires UI._utils
 * @module UI.EmptyState
 */

(function() {
  var UI = window.UI || {};

  function _renderIconEl(container, cfg) {
    var lucideName = cfg.lucide || cfg.icon;
    if (lucideName) {
      container.innerHTML = '<i data-lucide="' + lucideName + '" aria-hidden="true"></i>';
      return;
    }
    var emoji = cfg.emoji;
    if (emoji && typeof emoji === 'string' && emoji.indexOf('<') !== -1) {
      container.innerHTML = emoji;
      return;
    }
    if (!emoji) {
      container.innerHTML = '<i data-lucide="inbox" aria-hidden="true"></i>';
      return;
    }
    container.textContent = emoji;
  }

  function _ctaHtml(cfg) {
    var esc = UI._utils && UI._utils.esc ? UI._utils.esc : function(s) { return s; };
    var texto = cfg.ctaTexto || 'Começar agora';
    return '<i data-lucide="plus" aria-hidden="true"></i> ' + esc(texto);
  }

  function _refreshIcons(root) {
    if (typeof renderLucideIcons === 'function') renderLucideIcons(root);
  }

  /**
   * Empty state component with animations and configurable CTA
   * @namespace UI.EmptyState
   */
  UI.EmptyState = {
    /**
     * Renders an empty state as a DOM element
     * @param {Object|string} config - Configuration object or emoji string (legacy)
     * @param {string} [texto] - Title text (legacy format)
     * @param {string} [aba] - Tab to switch to when CTA is clicked (legacy format)
     * @returns {HTMLElement} The rendered empty state element
     */
    render: function(config, texto, aba) {
      var cfg = _normalizarConfig(config, texto, aba);

      var wrapper = document.createElement('div');
      wrapper.className = 'empty-state' + (cfg.animado !== false ? ' empty-state--animado' : '');

      var iconEl = document.createElement('div');
      iconEl.className = 'empty-emoji' + (cfg.animado !== false ? ' empty-emoji--float' : '');
      iconEl.setAttribute('aria-hidden', 'true');
      _renderIconEl(iconEl, cfg);
      wrapper.appendChild(iconEl);

      if (cfg.titulo) {
        var titleEl = document.createElement('p');
        titleEl.className = 'empty-titulo';
        titleEl.textContent = cfg.titulo;
        wrapper.appendChild(titleEl);
      }

      if (cfg.subtitulo) {
        var subEl = document.createElement('p');
        subEl.className = 'empty-texto';
        subEl.textContent = cfg.subtitulo;
        wrapper.appendChild(subEl);
      }

      if (cfg.aba) {
        var btn = document.createElement('button');
        btn.className = 'btn-empty-cta';
        btn.type = 'button';
        btn.setAttribute('data-mudar-aba', cfg.aba);
        btn.innerHTML = _ctaHtml(cfg);
        wrapper.appendChild(btn);
      }

      _refreshIcons(wrapper);
      return wrapper;
    },

    /**
     * Renders an empty state as an HTML string
     * @param {Object|string} config - Configuration object or emoji string (legacy)
     * @param {string} [texto] - Title text (legacy format)
     * @param {string} [aba] - Tab to switch to when CTA is clicked (legacy format)
     * @returns {string} The rendered empty state HTML string
     */
    html: function(config, texto, aba) {
      var esc = UI._utils.esc;
      var cfg = _normalizarConfig(config, texto, aba);

      var animClass  = cfg.animado !== false ? ' empty-state--animado' : '';
      var floatClass = cfg.animado !== false ? ' empty-emoji--float'   : '';
      var iconHtml;

      if (cfg.lucide || cfg.icon) {
        iconHtml = '<i data-lucide="' + esc(cfg.lucide || cfg.icon) + '" aria-hidden="true"></i>';
      } else if (cfg.emoji && typeof cfg.emoji === 'string' && cfg.emoji.indexOf('<') !== -1) {
        iconHtml = cfg.emoji;
      } else if (cfg.emoji) {
        iconHtml = esc(cfg.emoji);
      } else {
        iconHtml = '<i data-lucide="inbox" aria-hidden="true"></i>';
      }

      return '<div class="empty-state' + animClass + '">' +
        '<div class="empty-emoji' + floatClass + '" aria-hidden="true">' + iconHtml + '</div>' +
        (cfg.titulo    ? '<p class="empty-titulo">' + esc(cfg.titulo)    + '</p>' : '') +
        (cfg.subtitulo ? '<p class="empty-texto">'  + esc(cfg.subtitulo) + '</p>' : '') +
        (cfg.aba
          ? '<button class="btn-empty-cta" type="button" data-mudar-aba="' + esc(cfg.aba) + '">' + _ctaHtml(cfg) + '</button>'
          : '') +
      '</div>';
    }
  };

  function _normalizarConfig(config, texto, aba) {
    if (config && typeof config === 'object' && !Array.isArray(config)) {
      return config;
    }
    return {
      emoji:    config,
      titulo:   texto,
      subtitulo: null,
      aba:      aba,
      ctaTexto: null,
      animado:  true
    };
  }

  window.UI = UI;
})();
