// FinançasPro — EmptyState: estado vazio reutilizável
// v11.0 — Depende de: _base.js
(function() {
  var UI = window.UI || {};

  /**
   * EmptyState — Componente de estado vazio com animações e CTA configurável.
   *
   * Aceita dois formatos:
   *   render(emoji, texto, aba?)            — retrocompatível
   *   render({ emoji, titulo, subtitulo, aba, ctaTexto, animado })
   */
  UI.EmptyState = {

    render: function(config, texto, aba) {
      var cfg = _normalizarConfig(config, texto, aba);

      var wrapper = document.createElement('div');
      wrapper.className = 'empty-state' + (cfg.animado !== false ? ' empty-state--animado' : '');

      var iconEl = document.createElement('div');
      iconEl.className = 'empty-emoji' + (cfg.animado !== false ? ' empty-emoji--float' : '');
      iconEl.setAttribute('aria-hidden', 'true');
      iconEl.textContent = cfg.emoji || '📭';
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
        btn.textContent = cfg.ctaTexto || '➕ Começar agora';
        wrapper.appendChild(btn);
      }

      return wrapper;
    },

    html: function(config, texto, aba) {
      var esc = UI._utils.esc;
      var cfg = _normalizarConfig(config, texto, aba);

      var animClass  = cfg.animado !== false ? ' empty-state--animado' : '';
      var floatClass = cfg.animado !== false ? ' empty-emoji--float'   : '';
      var ctaTexto   = cfg.ctaTexto || '➕ Começar agora';

      return '<div class="empty-state' + animClass + '">' +
        '<div class="empty-emoji' + floatClass + '" aria-hidden="true">' + (cfg.emoji || '📭') + '</div>' +
        (cfg.titulo    ? '<p class="empty-titulo">' + esc(cfg.titulo)    + '</p>' : '') +
        (cfg.subtitulo ? '<p class="empty-texto">'  + esc(cfg.subtitulo) + '</p>' : '') +
        (cfg.aba
          ? '<button class="btn-empty-cta" type="button" data-mudar-aba="' + esc(cfg.aba) + '">' + esc(ctaTexto) + '</button>'
          : '') +
      '</div>';
    }
  };

  /* Normaliza tanto (emoji, texto, aba) quanto o objeto config */
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
