/**
 * onboarding.js — Tour guiado para novos usuários
 * Fase 2 UX — Depende de: dados.js, utils.js
 *
 * O tour NUNCA abre automaticamente: só após clique explícito em
 * "Iniciar tour" (convite ou Perfil → Tour de boas-vindas).
 */

var ONBOARDING = (function() {
  var _passo   = 0;
  var _overlay = null;
  var _tooltip = null;
  var _ativo   = false;
  var _passos  = [];
  var _delayTimer = null;
  var _interagiu = false;
  var _acaoPendente = null;
  var _inviteEl = null;

  /* ── Monta passos dinamicamente ────────────────────────── */

  function _getPassos() {
    var renda = UTILS.tentar('onboarding.lerRenda', function() {
      var cfg = (typeof DADOS !== 'undefined' && DADOS.getConfig) ? DADOS.getConfig() : {};
      return Number(cfg.renda) || 0;
    }, { padrao: 0 }).valor;

    var passos = [
      {
        emoji:  '<i data-lucide="hand" aria-hidden="true"></i>',
        titulo: 'Seus dados ficam neste aparelho.',
        texto:  'Sem cadastro, sem e-mail e sem conectar o seu banco. Você exporta tudo quando quiser — e apaga tudo também.',
        dica:   'Esc para fechar • Enter para continuar'
      }
    ];

    if (!renda) {
      passos.push({
        emoji:     '<i data-lucide="wallet" aria-hidden="true"></i>',
        titulo:    'Quanto entra por mês?',
        texto:     'É só para o app saber o tamanho da sua folga. Dá para pular agora e definir depois em Orçamento.',
        rendaStep: true,
        dica:      'Toque em "Pular" para configurar depois'
      });
    }

    passos.push({
      emoji:  '<i data-lucide="rocket" aria-hidden="true"></i>',
      titulo: 'Pronto.',
      texto:  'Na aba Novo, escreva do seu jeito: <em>"mercado 45 ontem"</em> já vira um lançamento.',
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
    } catch (e) {
      UTILS.tentar('onboarding.temLancamentos', function() { throw e; });
    }
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
    UTILS.tentar('onboarding.concluir', function() {
      if (typeof DADOS !== 'undefined' && DADOS.salvarConfig) {
        DADOS.salvarConfig({ onboardingConcluido: true });
      }
    });
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

  /* ── Convite não bloqueante (substitui auto-tour) ─────── */

  function _fecharConvite(marcarConcluido) {
    if (_inviteEl && _inviteEl.parentNode) {
      _inviteEl.parentNode.removeChild(_inviteEl);
    }
    _inviteEl = null;
    if (marcarConcluido) _concluir();
  }

  function _mostrarConvite() {
    if (_ativo || _inviteEl || _marcado() || _interagiu || _authBloqueando()) return;

    _inviteEl = document.createElement('div');
    _inviteEl.id = 'onboarding-invite';
    _inviteEl.className = 'onboarding-invite';
    // Aviso acionável (não region genérica): status + label explícita da etapa
    _inviteEl.setAttribute('role', 'status');
    _inviteEl.setAttribute('aria-live', 'polite');
    _inviteEl.setAttribute('aria-label', 'Etapa 1 de 2: convite para o tour de boas-vindas');
    _inviteEl.innerHTML =
      '<div class="onboarding-invite-inner">' +
        '<p class="onboarding-invite-step">Etapa 1 de 2 · Boas-vindas</p>' +
        '<span class="onboarding-invite-text">' +
          '<i data-lucide="compass" aria-hidden="true"></i> ' +
          'Primeira vez aqui? Faça um tour rápido (cerca de 30 segundos) para conhecer o Resumo, lançamentos e orçamento.' +
        '</span>' +
        '<div class="onboarding-invite-actions">' +
          '<button type="button" class="onb-btn-skip" id="onb-invite-dismiss">Agora não</button>' +
          '<button type="button" class="onb-btn-next ripple-host" id="onb-invite-start">' +
            '<i data-lucide="play" aria-hidden="true"></i> Iniciar tour' +
          '</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(_inviteEl);

    document.getElementById('onb-invite-start').addEventListener('click', function() {
      _fecharConvite(false);
      abrirTourExplicito();
    });
    document.getElementById('onb-invite-dismiss').addEventListener('click', function() {
      _fecharConvite(true);
    });

    var startBtn = document.getElementById('onb-invite-start');
    if (startBtn && typeof startBtn.focus === 'function') {
      try { startBtn.focus({ preventScroll: true }); } catch (e) { startBtn.focus(); }
    }

    if (typeof renderLucideIconsNow === 'function') {
      renderLucideIconsNow();
    } else if (typeof renderLucideIcons === 'function') {
      renderLucideIcons(_inviteEl);
    }

    if (typeof ariaLive !== 'undefined' && ariaLive.announce) {
      ariaLive.announce('Convite de boas-vindas disponível. Inicie o tour ou escolha Agora não.');
    }
  }

  /* ── DOM do tour ──────────────────────────────────────── */

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
      return '<div class="' + cls + '" role="presentation"></div>';
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
        '<span class="onb-passo-num" id="onb-passo-label">Etapa ' + (_passo + 1) + ' de ' + _passos.length + '</span>' +
      '</div>' +
      '<div class="onb-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-labelledby="onb-passo-label">' +
        '<div class="onb-progress-fill" style="width:' + pct + '%"></div>' +
      '</div>' +
      '<span class="onb-emoji" aria-hidden="true">' + p.emoji + '</span>' +
      '<h3 id="onb-passo-titulo">' + p.titulo + '</h3>' +
      '<p>' + p.texto + '</p>' +
      rendaHtml +
      dicaHtml +
      '<div class="onb-dots" aria-hidden="true">' + dots + '</div>' +
      '<div class="onb-actions">' +
        '<button type="button" class="onb-btn-skip" id="onb-skip">' + skipLabel + '</button>' +
        '<button type="button" class="onb-btn-next ripple-host" id="onb-next">' +
          (ultimo ? '<i data-lucide="rocket" aria-hidden="true"></i> Começar!' : 'Próximo <i data-lucide="chevron-right" aria-hidden="true"></i>') +
        '</button>' +
      '</div>';
    if (_overlay) {
      _overlay.setAttribute('aria-labelledby', 'onb-passo-titulo');
      _overlay.setAttribute('aria-describedby', 'onb-passo-label');
    }

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
      var val = inp && typeof UTILS !== 'undefined' && UTILS.parseMoeda
        ? UTILS.parseMoeda(inp.value)
        : (inp ? parseFloat(String(inp.value || '').replace(',', '.')) : 0);
      if (val && val > 0) {
        UTILS.tentar('onboarding.salvarRenda', function() {
          if (typeof DADOS !== 'undefined' && DADOS.salvarConfig) {
            DADOS.salvarConfig({ renda: val, rendaMensal: val });
          }
        }, { avisar: 'Não foi possível salvar sua renda. Tente novamente nas configurações.' });
      }
    }

    if (p.navBtn) {
      var fn = (typeof INIT_NAVIGATION !== 'undefined' && INIT_NAVIGATION.mudarAba)
        ? INIT_NAVIGATION.mudarAba.bind(INIT_NAVIGATION)
        : (typeof mudarAba !== 'undefined' ? mudarAba : null);
      if (fn) UTILS.tentar('onboarding.navegar', function() { fn(p.navBtn); });
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
    _fecharConvite(false);
    _ativo  = true;
    _passo  = 0;
    _passos = _getPassos();
    _criarOverlay();
    _renderPasso('forward');
  }

  function _cancelarAgendamento() {
    if (_delayTimer) {
      clearTimeout(_delayTimer);
      _delayTimer = null;
    }
  }

  /**
   * Sinaliza que o usuário já escolheu um caminho (ex.: "Registrar Transação").
   * Fecha convite/tour agendado; se o tour já estiver aberto, guarda a ação
   * para retomar ao pular/"Agora não".
   */
  function registrarInteracao(acao) {
    _interagiu = true;
    _cancelarAgendamento();
    _fecharConvite(false);
    if (acao && acao.aba) {
      _acaoPendente = { aba: acao.aba };
    }
    return !_ativo;
  }

  /* ── API pública ───────────────────────────────────────── */

  /** Exibe convite não bloqueante — o tour só abre com clique explícito. */
  function iniciar() {
    if (_ativo || _marcado() || _interagiu) return;
    if (_temUsoPrevio()) {
      _concluir();
      return;
    }
    if (_authBloqueando()) return;

    _cancelarAgendamento();
    _delayTimer = setTimeout(function() {
      _delayTimer = null;
      if (_marcado() || _authBloqueando() || _interagiu || _ativo) return;
      _mostrarConvite();
    }, 2800);
  }

  /** Abre o tour imediatamente — só para ações explícitas do usuário. */
  function abrirTourExplicito() {
    _cancelarAgendamento();
    _fecharConvite(false);
    if (_marcado() && !_ativo) {
      UTILS.tentar('onboarding.reabrir', function() {
        if (typeof DADOS !== 'undefined' && DADOS.salvarConfig) {
          DADOS.salvarConfig({ onboardingConcluido: false });
        }
      });
    }
    _abrirTour();
  }

  function reiniciar() {
    encerrar(true);
    _interagiu = false;
    _acaoPendente = null;
    UTILS.tentar('onboarding.reiniciar', function() {
      if (typeof DADOS !== 'undefined' && DADOS.salvarConfig) {
        DADOS.salvarConfig({ onboardingConcluido: false });
      }
    });
    setTimeout(_abrirTour, 200);
  }

  function encerrar(silent) {
    if (_delayTimer) {
      clearTimeout(_delayTimer);
      _delayTimer = null;
    }

    _fecharConvite(false);
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

    var pendente = _acaoPendente;
    _acaoPendente = null;

    if (!silent) {
      UTILS.tentar('onboarding.encerrar', function() {
        var fn = (typeof INIT_NAVIGATION !== 'undefined' && INIT_NAVIGATION.mudarAba)
          ? INIT_NAVIGATION.mudarAba.bind(INIT_NAVIGATION)
          : (typeof mudarAba !== 'undefined' ? mudarAba : null);
        if (fn && pendente && pendente.aba) fn(pendente.aba);
      });
    }

    _ativo = false;

    if (silent) {
      _interagiu = false;
      _acaoPendente = null;
    }
  }

  return {
    iniciar: iniciar,
    encerrar: encerrar,
    reiniciar: reiniciar,
    abrirTourExplicito: abrirTourExplicito,
    registrarInteracao: registrarInteracao,
    /** @private testes */
    _estado: function() {
      return {
        ativo: _ativo,
        interagiu: _interagiu,
        pendente: _acaoPendente,
        convite: !!_inviteEl
      };
    }
  };
})();
