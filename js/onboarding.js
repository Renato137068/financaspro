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

  /* ── Monta passos dinamicamente ────────────────────────── */

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
        texto:  'Controle financeiro inteligente com IA. Vamos configurar tudo em ' +
                (renda ? '1 passo rápido' : '2 passos rápidos') + '.',
        dica:   'Pressione Enter para avançar • Esc para pular'
      }
    ];

    if (!renda) {
      passos.push({
        emoji:     '💰',
        titulo:    'Qual é sua renda mensal?',
        texto:     'Usamos para calcular sua saúde financeira e o orçamento 50/30/20.',
        rendaStep: true,
        dica:      'Você pode alterar isso depois nas Configurações'
      });
    }

    passos.push({
      emoji:  '🚀',
      titulo: 'Tudo pronto para começar!',
      texto:  'Dica: digite <em>"mercado 45 ontem"</em> na entrada rápida — o app entende linguagem natural.',
      navBtn: 'novo',
      dica:   'Toque em Começar para fazer seu primeiro lançamento'
    });

    return passos;
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
      /* No passo de renda: avança só se houver valor */
      var p = _passos[_passo];
      if (p && p.rendaStep) {
        var inp = document.getElementById('onb-renda-val');
        if (!inp || !inp.value) return;
      }
      _avancar();
    }
  }

  /* ── DOM ──────────────────────────────────────────────── */

  function _criarOverlay() {
    _overlay = document.createElement('div');
    _overlay.id        = 'onboarding-overlay';
    _overlay.className = 'onboarding-overlay';

    var backdrop = document.createElement('div');
    backdrop.className = 'onboarding-backdrop';
    backdrop.addEventListener('click', function() {
      var p = _passos[_passo];
      /* Backdrop não avança o passo de renda (exige input) */
      if (p && p.rendaStep) return;
      var ultimo = (_passo === _passos.length - 1);
      if (ultimo) { encerrar(); } else { _avancar(); }
    });
    _overlay.appendChild(backdrop);

    _tooltip = document.createElement('div');
    _tooltip.id        = 'onboarding-tooltip';
    _tooltip.className = 'onboarding-tooltip';
    _overlay.appendChild(_tooltip);

    document.body.appendChild(_overlay);
    document.addEventListener('keydown', _onKeydown);
  }

  function _renderPasso(direcao) {
    var p      = _passos[_passo];
    var ultimo = (_passo === _passos.length - 1);
    var pct    = Math.round(((_passo + 1) / _passos.length) * 100);

    /* Dots de progresso */
    var dots = _passos.map(function(_, i) {
      var cls = 'onb-dot';
      if (i === _passo) cls += ' ativo';
      else if (i < _passo) cls += ' concluido';
      return '<div class="' + cls + '"></div>';
    }).join('');

    /* Input de renda */
    var rendaHtml = p.rendaStep
      ? '<div class="onb-renda-group" id="onb-renda-group">' +
          '<span class="onb-renda-prefix">R$</span>' +
          '<input type="number" id="onb-renda-val" class="onb-renda-input"' +
          ' placeholder="5.000" min="0" step="100" inputmode="decimal">' +
        '</div>' +
        '<p class="onb-erro" id="onb-renda-erro" style="display:none">Informe sua renda para continuar</p>'
      : '';

    /* Dica */
    var dicaHtml = p.dica
      ? '<p class="onb-dica">' + p.dica + '</p>'
      : '';

    /* Botão pular (não no último passo) */
    var skipHtml = !ultimo
      ? '<button class="onb-btn-skip" id="onb-skip">Pular</button>'
      : '';

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
        skipHtml +
        '<button class="onb-btn-next ripple-host" id="onb-next">' +
          (ultimo ? '🚀 Começar!' : 'Próximo →') +
        '</button>' +
      '</div>';

    document.getElementById('onb-next').addEventListener('click', _avancar);
    var skipEl = document.getElementById('onb-skip');
    if (skipEl) skipEl.addEventListener('click', function() { encerrar(); });

    /* Foca o input de renda automaticamente */
    if (p.rendaStep) {
      setTimeout(function() {
        var inp = document.getElementById('onb-renda-val');
        if (inp) inp.focus();
      }, 120);
    }

    /* Animação direcional */
    var animClass = direcao === 'back' ? 'onb-step-entering-back' : 'onb-step-entering';
    _tooltip.classList.remove('onb-step-entering', 'onb-step-entering-back');
    void _tooltip.offsetHeight;
    _tooltip.classList.add(animClass);
    _tooltip.addEventListener('animationend', function() {
      _tooltip.classList.remove('onb-step-entering', 'onb-step-entering-back');
    }, { once: true });

    _tooltip.style.left      = '50%';
    _tooltip.style.top       = '50%';
    _tooltip.style.transform = 'translate(-50%, -50%)';
    _tooltip.style.bottom    = '';
  }

  function _avancar() {
    var p = _passos[_passo];

    /* Validar renda — obrigatória no passo rendaStep */
    if (p.rendaStep) {
      var inp  = document.getElementById('onb-renda-val');
      var erro = document.getElementById('onb-renda-erro');
      var grp  = document.getElementById('onb-renda-group');
      var val  = inp ? parseFloat((inp.value || '').replace(',', '.')) : 0;

      if (!val || val <= 0) {
        if (erro) erro.style.display = 'block';
        if (grp)  grp.classList.add('onb-renda-erro-state');
        if (inp) {
          inp.classList.remove('anim-shake');
          void inp.offsetHeight;
          inp.classList.add('anim-shake');
          inp.addEventListener('animationend', function() {
            inp.classList.remove('anim-shake');
          }, { once: true });
          inp.focus();
        }
        return;
      }
      if (erro) erro.style.display = 'none';
      if (grp)  grp.classList.remove('onb-renda-erro-state');
      try {
        if (typeof DADOS !== 'undefined' && DADOS.salvarConfig) {
          DADOS.salvarConfig({ renda: val });
        }
      } catch(e) {}
    }

    /* Navegar para aba indicada */
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

  /* ── API pública ───────────────────────────────────────── */

  function iniciar() {
    if (_ativo || _marcado()) return;
    _ativo  = true;
    _passo  = 0;
    _passos = _getPassos();

    setTimeout(function() {
      _criarOverlay();
      _renderPasso('forward');
    }, 900);
  }

  function encerrar() {
    _concluir();
    document.removeEventListener('keydown', _onKeydown);

    if (_overlay) {
      _overlay.style.opacity    = '0';
      _overlay.style.transition = 'opacity 220ms ease';
      setTimeout(function() {
        if (_overlay && _overlay.parentNode) _overlay.parentNode.removeChild(_overlay);
        _overlay = null;
        _tooltip = null;
      }, 230);
    }

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
