/**
 * onboarding.js — Tour guiado para novos usuários
 * Fase 2 UX — Depende de: dados.js, utils.js
 */

var ONBOARDING = (function() {
  var _passo   = 0;
  var _overlay = null;
  var _tooltip = null;
  var _ativo   = false;
  var _passos  = [];
  var _delayTimer = null;

  /* ── Monta passos dinamicamente ────────────────────────── */

  function _getPassos() {
    var renda = 0;
    try {
      var cfg = (typeof DADOS !== 'undefined' && DADOS.getConfig) ? DADOS.getConfig() : {};
      renda = Number(cfg.renda) || 0;
    } catch (e) {}

    var passos = [
      {
        emoji:  '<i data-lucide="hand" aria-hidden="true"></i>',
        titulo: 'Bem-vindo ao FinançasPro!',
        texto:  'Controle financeiro inteligente com IA. Você pode explorar o app agora e configurar o restante quando quiser.',
        dica:   'Esc para fechar • Enter para continuar'
      }
    ];

    if (!renda) {
      passos.push({
        emoji:     '<i data-lucide="wallet" aria-hidden="true"></i>',
        titulo:    'Renda mensal (opcional)',
        texto:     'Informe para ativar orçamento 50/30/20 e indicadores personalizados. Pode pular e definir depois em Orçamento.',
        rendaStep: true,
        dica:      'Toque em "Pular" para configurar depois'
      });
    }

    passos.push({
      emoji:  '<i data-lucide="rocket" aria-hidden="true"></i>',
      titulo: 'Pronto para começar!',
      texto:  'Dica: na aba Novo, digite <em>"mercado 45 ontem"</em> — o app entende linguagem natural.',
      navBtn: 'novo',
      dica:   'Você pode refazer este tour em Perfil → Preferências'
    });

    return passos;
  }

  function _temUsoPrevio() {
    try {
      if (typeof TRANSACOES !== 'undefined' && TRANSACOES.obter) {
        var txs = TRANSACOES.obter({});
        if (txs && txs.length > 0) return true;
      }
      if (typeof DADOS !== 'undefined' && DADOS.getTransacoes) {
        var list = DADOS.getTransacoes();
        if (list && list.length > 0) return true;
      }
    } catch (e) {}
    return false;
  }

  function _authBloqueando() {
    var overlay = document.getElementById('auth-overlay');
    if (!overlay) return false;
    return overlay.style.display !== 'none' && window.getComputedStyle(overlay).display !== 'none';
  }

  /* ── Persistência ─────────────────────────────────────── */

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

  /* ── Keyboard handler ─────────────────────────────────── */

  function _onKeydown(e) {
    if (!_ativo) return;
    if (e.key === 'Escape') { encerrar(); return; }
    if (e.key === 'Enter') {
      e.preventDefault();
      _avancar();
    }
  }

  /* ── DOM ──────────────────────────────────────────────── */

  function _criarOverlay() {
    _overlay = document.createElement('div');
    _overlay.id        = 'onboarding-overlay';
    _overlay.className = 'onboarding-overlay';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-modal', 'true');
    _overlay.setAttribute('aria-label', 'Tour de boas-vindas');

    var backdrop = document.createElement('div');
    backdrop.className = 'onboarding-backdrop';
    backdrop.addEventListener('click', encerrar);
    _overlay.appendChild(backdrop);

    _tooltip = document.createElement('div');
    _tooltip.id        = 'onboarding-tooltip';
    _tooltip.className = 'onboarding-tooltip';
    _overlay.appendChild(_tooltip);

    document.body.appendChild(_overlay);
    document.addEventListener('keydown', _onKeydown);

    if (typeof FocusTrap !== 'undefined') {
      _overlay._fpFocusTrap = new FocusTrap(_overlay);
      _overlay._fpFocusTrap.activate();
    }

    if (typeof ariaLive !== 'undefined' && ariaLive.announce) {
      ariaLive.announce('Tour de boas-vindas iniciado');
    }
  }

  function _renderPasso(direcao) {
    var p      = _passos[_passo];
    var ultimo = (_passo === _passos.length - 1);
    var pct    = Math.round(((_passo + 1) / _passos.length) * 100);

    var dots = _passos.map(function(_, i) {
      var cls = 'onb-dot';
      if (i === _passo) cls += ' ativo';
      else if (i < _passo) cls += ' concluido';
      return '<div class="' + cls + '"></div>';
    }).join('');

    var rendaHtml = p.rendaStep
      ? '<div class="onb-renda-group" id="onb-renda-group">' +
          '<span class="onb-renda-prefix">R$</span>' +
          '<input type="number" id="onb-renda-val" class="onb-renda-input"' +
          ' placeholder="5.000" min="0" step="100" inputmode="decimal" aria-label="Renda mensal em reais">' +
        '</div>'
      : '';

    var dicaHtml = p.dica
      ? '<p class="onb-dica">' + p.dica + '</p>'
      : '';

    var skipLabel = p.rendaStep ? 'Pular' : 'Agora não';

    _tooltip.innerHTML =
      '<div class="onb-passo-header">' +
        '<span class="onb-passo-num">' + (_passo + 1) + ' / ' + _passos.length + '</span>' +
      '</div>' +
      '<div class="onb-progress-track"><div class="onb-progress-fill" style="width:' + pct + '%"></div></div>' +
      '<span class="onb-emoji">' + p.emoji + '</span>' +
      '<h3>' + p.titulo + '</h3>' +
      '<p>' + p.texto + '</p>' +
      rendaHtml +
      dicaHtml +
      '<div class="onb-dots">' + dots + '</div>' +
      '<div class="onb-actions">' +
        '<button type="button" class="onb-btn-skip" id="onb-skip">' + skipLabel + '</button>' +
        '<button type="button" class="onb-btn-next ripple-host" id="onb-next">' +
          (ultimo ? '<i data-lucide="rocket" aria-hidden="true"></i> Começar!' : 'Próximo <i data-lucide="chevron-right" aria-hidden="true"></i>') +
        '</button>' +
      '</div>';

    document.getElementById('onb-next').addEventListener('click', _avancar);
    document.getElementById('onb-skip').addEventListener('click', encerrar);

    if (p.rendaStep) {
      setTimeout(function() {
        var inp = document.getElementById('onb-renda-val');
        if (inp) inp.focus();
      }, 120);
    }

    var animClass = direcao === 'back' ? 'onb-step-entering-back' : 'onb-step-entering';
    _tooltip.classList.remove('onb-step-entering', 'onb-step-entering-back');
    void _tooltip.offsetHeight;
    _tooltip.classList.add(animClass);
    _tooltip.addEventListener('animationend', function() {
      _tooltip.classList.remove('onb-step-entering', 'onb-step-entering-back');
    }, { once: true });

    _tooltip.style.left      = '50%';
    _tooltip.style.top       = 'auto';
    _tooltip.style.bottom    = 'max(24px, env(safe-area-inset-bottom, 24px))';
    _tooltip.style.transform = 'translateX(-50%)';

    if (typeof renderLucideIconsNow === 'function') {
      renderLucideIconsNow();
    } else if (typeof renderLucideIcons === 'function') {
      renderLucideIcons(_tooltip);
    }
  }

  function _avancar() {
    var p = _passos[_passo];

    if (p.rendaStep) {
      var inp = document.getElementById('onb-renda-val');
      var val = inp ? parseFloat((inp.value || '').replace(',', '.')) : 0;
      if (val && val > 0) {
        try {
          if (typeof DADOS !== 'undefined' && DADOS.salvarConfig) {
            DADOS.salvarConfig({ renda: val });
          }
        } catch (e) {}
      }
    }

    if (p.navBtn) {
      var fn = (typeof INIT_NAVIGATION !== 'undefined' && INIT_NAVIGATION.mudarAba)
        ? INIT_NAVIGATION.mudarAba.bind(INIT_NAVIGATION)
        : (typeof mudarAba !== 'undefined' ? mudarAba : null);
      if (fn) try { fn(p.navBtn); } catch (e) {}
    }

    _passo++;
    if (_passo >= _passos.length) {
      encerrar();
    } else {
      _renderPasso('forward');
    }
  }

  function _abrirTour() {
    if (_ativo) return;
    _ativo  = true;
    _passo  = 0;
    _passos = _getPassos();
    _criarOverlay();
    _renderPasso('forward');
  }

  /* ── API pública ───────────────────────────────────────── */

  function iniciar() {
    if (_ativo || _marcado()) return;
    if (_temUsoPrevio()) {
      _concluir();
      return;
    }
    if (_authBloqueando()) return;

    if (_delayTimer) clearTimeout(_delayTimer);
    _delayTimer = setTimeout(function() {
      _delayTimer = null;
      if (_marcado() || _authBloqueando()) return;
      _abrirTour();
    }, 2800);
  }

  function reiniciar() {
    encerrar(true);
    try {
      if (typeof DADOS !== 'undefined' && DADOS.salvarConfig) {
        DADOS.salvarConfig({ onboardingConcluido: false });
      }
    } catch (e) {}
    setTimeout(_abrirTour, 200);
  }

  function encerrar(silent) {
    if (_delayTimer) {
      clearTimeout(_delayTimer);
      _delayTimer = null;
    }

    _concluir();
    document.removeEventListener('keydown', _onKeydown);

    if (_overlay) {
      if (_overlay._fpFocusTrap) _overlay._fpFocusTrap.deactivate();
      _overlay.style.opacity    = '0';
      _overlay.style.transition = 'opacity 220ms ease';
      setTimeout(function() {
        if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
        _overlay = null;
        _tooltip = null;
      }, 230);
    }

    if (!silent) {
      try {
        var fn = (typeof INIT_NAVIGATION !== 'undefined' && INIT_NAVIGATION.mudarAba)
          ? INIT_NAVIGATION.mudarAba.bind(INIT_NAVIGATION)
          : (typeof mudarAba !== 'undefined' ? mudarAba : null);
        if (fn) fn('resumo');
      } catch (e) {}
    }

    _ativo = false;
  }

  return { iniciar: iniciar, encerrar: encerrar, reiniciar: reiniciar };
})();
