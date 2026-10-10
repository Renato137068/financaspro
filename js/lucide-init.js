/**
 * lucide-init.js — inicialização local dos ícones Lucide (sem CDN).
 * Sempre renderiza no document.body para evitar que chamadas parciais
 * (renderLucideIcons(el)) deixem o restante da página sem ícones.
 */
(function() {
  var _iconRenderDebounce = null;
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

  // O createIcons do lucide troca TODO [data-lucide] da raiz por um <svg> novo,
  // inclusive os que já são <svg>: cada chamada refazia todos os ícones da
  // página (no boot, 384 SVGs criados para 84 ícones; depois de abrir as abas,
  // 2 mil para 221), e cada troca obriga o navegador a recalcular estilo e
  // layout. Agora só vão para o lucide os ícones pendentes: os <i> ainda não
  // convertidos e os <svg> cujo data-lucide mudou depois de desenhados (a seta
  // da ordenação no Extrato, o olho da senha). DESENHADO guarda o nome com que
  // cada <svg> foi desenhado; PENDENTE marca os da vez, e o createIcons só
  // olha para eles via nameAttr.
  var PENDENTE = 'data-icone-pendente';
  var DESENHADO = 'data-icone';

  function _paintIcons(root) {
    if (typeof lucide === 'undefined' || typeof lucide.createIcons !== 'function') {
      return false;
    }
    var pendentes = 0;
    root.querySelectorAll('[data-lucide]').forEach(function(node) {
      // Antes da conversão: o lucide copia os atributos do <i> para o <svg>.
      if (!node.hasAttribute('aria-label') && !node.hasAttribute('aria-hidden')) {
        node.setAttribute('aria-hidden', 'true');
      }
      var nome = node.getAttribute('data-lucide');
      if (nome && node.getAttribute(DESENHADO) !== nome) {
        node.setAttribute(PENDENTE, nome);
        pendentes++;
      }
    });
    if (pendentes) {
      lucide.createIcons({ root: root, nameAttr: PENDENTE });
      root.querySelectorAll('[' + PENDENTE + ']').forEach(function(node) {
        node.removeAttribute(PENDENTE);
        if (node instanceof SVGElement) node.setAttribute(DESENHADO, node.getAttribute('data-lucide'));
      });
    }
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
