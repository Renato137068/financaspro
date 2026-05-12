/**
 * skeleton.js — Skeleton Loader Manager
 * Fase 7 UX Premium — Depende de: (nenhum, self-contained)
 */

var SKELETON = (function() {
  var _ativo = false;

  function _html() {
    var tx = ['', '', ''].map(function() {
      return (
        '<div class="sk-tx-item">' +
          '<div class="skeleton sk-tx-icon"></div>' +
          '<div class="sk-tx-body">' +
            '<div class="skeleton sk-tx-line"></div>' +
            '<div class="skeleton sk-tx-line-short"></div>' +
          '</div>' +
          '<div class="skeleton sk-tx-val"></div>' +
        '</div>'
      );
    }).join('');

    return (
      '<div id="dashboard-skeleton" class="dashboard-skeleton" aria-hidden="true">' +
        '<div class="skeleton sk-greeting"></div>' +
        '<div class="skeleton sk-greeting-sub"></div>' +
        '<div class="skeleton sk-saldo"></div>' +
        '<div class="sk-cards">' +
          '<div class="skeleton sk-card-item"></div>' +
          '<div class="skeleton sk-card-item"></div>' +
        '</div>' +
        '<div class="sk-indicadores">' +
          '<div class="skeleton sk-indicador"></div>' +
          '<div class="skeleton sk-indicador"></div>' +
          '<div class="skeleton sk-indicador"></div>' +
          '<div class="skeleton sk-indicador"></div>' +
        '</div>' +
        '<div class="skeleton sk-section-header"></div>' +
        tx +
      '</div>'
    );
  }

  function mostrar() {
    if (_ativo) return;
    var aba = document.getElementById('aba-resumo');
    if (!aba) return;

    _ativo = true;

    /* Ocultar filhos reais sem remover do DOM */
    var filhos = Array.prototype.slice.call(aba.children);
    filhos.forEach(function(el) {
      el.dataset.skHidden = '1';
      el.style.display = 'none';
    });

    /* Injetar skeleton no topo */
    var wrap = document.createElement('div');
    wrap.innerHTML = _html();
    aba.insertBefore(wrap.firstChild, aba.firstChild);
  }

  function esconder() {
    /* Funciona tanto com skeleton estático (HTML) quanto dinâmico (mostrar()) */
    var sk = document.getElementById('dashboard-skeleton');
    if (!sk) return; /* já foi removido */

    _ativo = false;

    sk.style.transition = 'opacity 220ms ease';
    sk.style.opacity    = '0';
    setTimeout(function() { if (sk.parentNode) sk.parentNode.removeChild(sk); }, 230);

    /* Revelar filhos reais com stagger suave */
    var aba = document.getElementById('aba-resumo');
    if (!aba) return;

    /* Filhos que ficaram ocultos via CSS sibling selector (#dashboard-skeleton ~ *) */
    var filhos = Array.prototype.slice.call(aba.children).filter(function(el) {
      return el.id !== 'dashboard-skeleton';
    });

    filhos.forEach(function(el, i) {
      el.style.opacity    = '0';
      el.style.transform  = 'translateY(6px)';
      el.style.transition = 'opacity 240ms ease, transform 240ms ease';
      setTimeout(function() {
        el.style.opacity   = '1';
        el.style.transform = 'translateY(0)';
      }, 80 + i * 40);
    });
  }

  /* Uso: SKELETON.mostrar() logo após DOMContentLoaded se não há dados cacheados */
  function iniciarSeNecessario() {
    try {
      var dados = localStorage.getItem('financaspro_transacoes');
      /* Mostra skeleton apenas se ainda não há dados renderizados */
      if (!dados || dados === '[]') mostrar();
    } catch (e) {
      /* sem localStorage — não bloqueia */
    }
  }

  return {
    mostrar: mostrar,
    esconder: esconder,
    iniciarSeNecessario: iniciarSeNecessario
  };
})();
