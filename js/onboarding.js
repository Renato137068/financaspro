/**
 * onboarding.js — Tour guiado para novos usuários
 * Fase 9 UX — Depende de: dados.js, utils.js
 */

var ONBOARDING = (function() {
  var _passo   = 0;
  var _overlay = null;
  var _tooltip = null;
  var _ativo   = false;
  var _passos  = [];

  /* ── Monta passos dinamicamente (executa em iniciar()) ─────── */

  function _getPassos() {
    var renda = 0;
    try {
      var cfg = (typeof DADOS !== 'undefined' && DADOS.getConfig) ? DADOS.getConfig() : {};
      renda = Number(cfg.renda) || 0;
    } catch(e) {}

    var passos = [
      {
        emoji:  '👋',
        titulo: 'Bem-vindo ao FinançasPro!',
        texto:  'Controle financeiro inteligente. Vamos te configurar em ' +
                (renda ? '1 passo rápido' : '2 passos rápidos') + '.'
      }
    ];

    if (!renda) {
      passos.push({
        emoji:     '💰',
        titulo:    'Qual é sua renda mensal?',
        texto:     'Informe quanto você ganha por mês para ativar os indicadores de saúde financeira e orçamento 50/30/20.',
        rendaStep: true
      });
    }

    passos.push({
      emoji:  '🚀',
      titulo: 'Pronto para começar!',
      texto:  'Use a entrada rápida: <em>"mercado 150 ontem"</em> — o app entende linguagem natural.',
      navBtn: 'novo'
    });

    return passos;
  }

  /* ── Persistência ──────────────────────────────────────────── */

  function _marcado() {
    try {
      var cfg = (typeof DADOS !== 'undefined' && DADOS.getConfig) ? DADOS.getConfig() : {};
      return !!cfg.onboardingConcluido;
    } catch (e) { return true; }
  }

  function _concluir() {
    try {
      if (typeof DADOS !== 'undefined' && DADOS.salvarConfig) {
        DADOS.salvarConfig({ onboardingConcluido: true });
      }
    } catch (e) {}
  }

  /* ── DOM ───────────────────────────────────────────────────── */

  function _criarOverlay() {
    _overlay = document.createElement('div');
    _overlay.id        = 'onboarding-overlay';
    _overlay.className = 'onboarding-overlay';

    var backdrop = document.createElement('div');
    backdrop.className = 'onboarding-backdrop';
    backdrop.addEventListener('click', function() { encerrar(); });
    _overlay.appendChild(backdrop);

    _tooltip = document.createElement('div');
    _tooltip.id        = 'onboarding-tooltip';
    _tooltip.className = 'onboarding-tooltip';
    _overlay.appendChild(_tooltip);

    document.body.appendChild(_overlay);
  }

  function _renderPasso() {
    var p      = _passos[_passo];
    var ultimo = (_passo === _passos.length - 1);

    /* Dots de progresso */
    var dots = _passos.map(function(_, i) {
      return '<div class="onb-dot' + (i === _passo ? ' ativo' : '') + '"></div>';
    }).join('');

    /* Input de renda (apenas no passo de renda) */
    var rendaHtml = p.rendaStep
      ? '<div class="onb-renda-group">' +
          '<span class="onb-renda-prefix">R$</span>' +
          '<input type="number" id="onb-renda-val" class="onb-renda-input"' +
          ' placeholder="5.000" min="0" step="100" inputmode="decimal">' +
        '</div>'
      : '';

    /* Botão pular (não no último passo) */
    var skipHtml = !ultimo
      ? '<button class="onb-btn-skip" id="onb-skip">Pular</button>'
      : '';

    _tooltip.innerHTML =
      '<span class="onb-emoji">' + p.emoji + '</span>' +
      '<h3>' + p.titulo + '</h3>' +
      '<p>' + p.texto + '</p>' +
      rendaHtml +
      '<div class="onb-dots">' + dots + '</div>' +
      '<div class="onb-actions">' +
        skipHtml +
        '<button class="onb-btn-next" id="onb-next">' +
          (ultimo ? '🚀 Começar!' : 'Próximo →') +
        '</button>' +
      '</div>';

    document.getElementById('onb-next').addEventListener('click', _avancar);
    var skipEl = document.getElementById('onb-skip');
    if (skipEl) skipEl.addEventListener('click', function() { encerrar(); });

    /* Foca no input de renda automaticamente */
    if (p.rendaStep) {
      setTimeout(function() {
        var inp = document.getElementById('onb-renda-val');
        if (inp) inp.focus();
      }, 120);
    }

    /* Posicionamento centralizado */
    _tooltip.style.animation = 'none';
    void _tooltip.offsetHeight;
    _tooltip.style.animation  = '';
    _tooltip.style.left       = '50%';
    _tooltip.style.top        = '50%';
    _tooltip.style.transform  = 'translate(-50%, -50%)';
    _tooltip.style.bottom     = '';
  }

  function _avancar() {
    var p = _passos[_passo];

    /* Salvar renda digitada */
    if (p.rendaStep) {
      var inp = document.getElementById('onb-renda-val');
      if (inp) {
        var val = parseFloat((inp.value || '').replace(',', '.')) || 0;
        if (val > 0) {
          try {
            if (typeof DADOS !== 'undefined' && DADOS.salvarConfig) {
              DADOS.salvarConfig({ renda: val });
            }
          } catch(e) {}
        }
      }
    }

    /* Navegar para aba indicada pelo passo */
    if (p.navBtn) {
      var fn = (typeof INIT_NAVIGATION !== 'undefined' && INIT_NAVIGATION.mudarAba)
        ? INIT_NAVIGATION.mudarAba.bind(INIT_NAVIGATION)
        : (typeof mudarAba !== 'undefined' ? mudarAba : null);
      if (fn) {
        try { fn(p.navBtn); } catch (e) {}
      }
    }

    _passo++;
    if (_passo >= _passos.length) {
      encerrar();
    } else {
      _renderPasso();
    }
  }

  /* ── API pública ───────────────────────────────────────────── */

  function iniciar() {
    if (_ativo || _marcado()) return;
    _ativo  = true;
    _passo  = 0;
    _passos = _getPassos();

    /* Aguarda app renderizar antes de exibir */
    setTimeout(function() {
      _criarOverlay();
      _renderPasso();
    }, 900);
  }

  function encerrar() {
    _concluir();
    if (_overlay) {
      _overlay.style.opacity    = '0';
      _overlay.style.transition = 'opacity 220ms ease';
      setTimeout(function() {
        if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
        _overlay = null;
        _tooltip = null;
      }, 230);
    }

    /* Retorna para o dashboard ao encerrar */
    try {
      var fn = (typeof INIT_NAVIGATION !== 'undefined' && INIT_NAVIGATION.mudarAba)
        ? INIT_NAVIGATION.mudarAba.bind(INIT_NAVIGATION)
        : (typeof mudarAba !== 'undefined' ? mudarAba : null);
      if (fn) fn('resumo');
    } catch (e) {}

    _ativo = false;
  }

  return { iniciar: iniciar, encerrar: encerrar };
})();
