/**
 * lucide-init.js — inicialização local dos ícones Lucide (sem CDN).
 * Sempre renderiza no document.body para evitar que chamadas parciais
 * (renderLucideIcons(el)) deixem o restante da página sem ícones.
 */
(function() {
  var _iconRenderDebounce = null;

  function _applyAria(root) {
    root.querySelectorAll('[data-lucide]').forEach(function(node) {
      if (!node.hasAttribute('aria-label') && !node.hasAttribute('aria-hidden')) {
        node.setAttribute('aria-hidden', 'true');
      }
    });
  }

  function _paintIcons(root) {
    if (typeof lucide === 'undefined' || typeof lucide.createIcons !== 'function') {
      return false;
    }
    lucide.createIcons({ root: root });
    _applyAria(root);
    return true;
  }

  /** Render imediato (após bootstrap ou conteúdo dinâmico crítico) */
  window.renderLucideIconsNow = function() {
    if (_iconRenderDebounce) {
      clearTimeout(_iconRenderDebounce);
      _iconRenderDebounce = null;
    }
    return _paintIcons(document.body);
  };

  /** Render com debounce — ignora escopo parcial, sempre atualiza a página inteira */
  window.renderLucideIcons = function(_container) {
    if (_iconRenderDebounce) clearTimeout(_iconRenderDebounce);
    _iconRenderDebounce = setTimeout(function() {
      _iconRenderDebounce = null;
      _paintIcons(document.body);
    }, 16);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      window.renderLucideIcons();
    });
  } else {
    window.renderLucideIcons();
  }

  window.addEventListener('load', function() {
    window.renderLucideIconsNow();
  });

  /** Gera markup <i data-lucide> para uso em innerHTML */
  window.lucideIconHtml = function(name, className) {
    var icon = name || 'pin';
    if (typeof icon === 'string' && icon.indexOf('<') !== -1) return icon;
    var extra = className ? ' class="' + className + '"' : '';
    return '<i data-lucide="' + icon + '" aria-hidden="true"' + extra + '></i>';
  };
})();
