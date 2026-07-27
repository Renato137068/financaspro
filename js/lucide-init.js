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

  var _fullLoading = false;

  // Fallback: em produção o lucide vem como subset (só os ícones detectados no
  // build). Se algum <i data-lucide> não foi convertido — ícone fora do subset,
  // tipicamente nome dinâmico —, carrega a lib completa uma vez e re-renderiza.
  // Garante que nenhum ícone suma silenciosamente.
  function _ensureFullLibrary() {
    if (_fullLoading || document.getElementById('lucide-full-lib')) return;
    // Convertidos viram <svg data-lucide>; os NÃO convertidos seguem como o
    // elemento original (<i>/<span>). Só estes últimos indicam ícone faltando.
    if (!document.querySelector('[data-lucide]:not(svg)')) return;
    _fullLoading = true;
    var s = document.createElement('script');
    s.id = 'lucide-full-lib';
    s.src = 'js/vendor/lucide-full.min.js';
    s.onload = function() {
      _fullLoading = false;
      _paintIcons(document.body);
    };
    s.onerror = function() { _fullLoading = false; };
    document.head.appendChild(s);
  }

  function _paintIcons(root) {
    if (typeof lucide === 'undefined' || typeof lucide.createIcons !== 'function') {
      return false;
    }
    lucide.createIcons({ root: root });
    _applyAria(root);
    _ensureFullLibrary();
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
