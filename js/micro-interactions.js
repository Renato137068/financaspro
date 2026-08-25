/**
 * micro-interactions.js — microinterações
 * Fase 2 UX — Depende de: (self-contained, roda após DOM pronto)
 */

var MICRO = (function() {

  /* ── Ripple Effect ─────────────────────────────────────── */

  function _criarRipple(e) {
    var btn = e.currentTarget;
    var r   = btn.getBoundingClientRect();
    var wave = document.createElement('span');
    wave.className  = 'ripple-wave';
    wave.style.left = (e.clientX - r.left) + 'px';
    wave.style.top  = (e.clientY - r.top)  + 'px';
    btn.appendChild(wave);
    setTimeout(function() { if (wave.parentNode) wave.parentNode.removeChild(wave); }, 500);
  }

  function setupRipple() {
    var seletores = '.btn-primario, .nav-btn, .tipo-btn, .filtro-chip, .filtro-cat-chip, ' +
                    '.btn-registrar, .data-chip, .onb-btn-next, .quick-amount, .rec-chip';
    document.addEventListener('click', function(e) {
      var btn = e.target.closest(seletores);
      if (!btn || btn.disabled) return;
      if (!btn.dataset.ripple) {
        btn.dataset.ripple = '1';
        btn.classList.add('ripple-host');
      }
      _criarRipple({ currentTarget: btn, clientX: e.clientX, clientY: e.clientY });
    }, { passive: true });
  }

  /* ── Counter-up (animação de número) ───────────────────── */

  function contarAte(el, fim, duracao, prefixo, sufixo, aoTerminar) {
    prefixo = prefixo || '';
    sufixo  = sufixo  || '';
    duracao = duracao || 600;

    var inicio = 0;
    var comeco = performance.now();

    function _step(agora) {
      var progresso = Math.min((agora - comeco) / duracao, 1);
      var ease = 1 - Math.pow(1 - progresso, 3);
      var valor = inicio + (fim - inicio) * ease;

      el.textContent = prefixo + valor.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }) + sufixo;

      if (progresso < 1) {
        requestAnimationFrame(_step);
      } else {
        // Garante o valor exato no fim: o easing chega perto, e arredondamento
        // de ponto flutuante nao pode decidir o numero que o usuario le.
        el.textContent = prefixo + fim.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        }) + sufixo;
        if (typeof aoTerminar === 'function') aoTerminar();
      }
    }

    requestAnimationFrame(_step);
  }

  /* Anima valores monetários quando mudam — IDs fixos + .valor-animado */
  function animarValoresMonetarios() {
    var ids = ['resumo-receitas', 'resumo-despesas'];
    var OPCOES_OBS = { childList: true, characterData: true, subtree: true };

    ids.forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;

      // O observador PRECISA parar enquanto a animação escreve.
      //
      // contarAte() reescreve o textContent a cada quadro. Como o observador
      // reagia a qualquer mudança de texto, cada quadro disparava uma contagem
      // nova, mirando o valor intermediário que o quadro anterior tinha
      // acabado de escrever. O alvo encolhia a cada rodada e os cartões de
      // Receitas e Despesas do painel acabavam parados em "R$ 0,01",
      // oscilando com "R$ -0,00" para sempre — no lugar dos valores reais.
      // O saldo não passava pelo observador, e por isso continuava certo:
      // era o único número correto na tela.
      var animando = false;
      var obs = new MutationObserver(function() {
        if (animando) return;

        var txt = el.textContent.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        var num = parseFloat(txt);
        if (isNaN(num) || num <= 0) return;

        animando = true;
        obs.disconnect();
        contarAte(el, num, 550, 'R$ ', '', function() {
          animando = false;
          obs.observe(el, OPCOES_OBS);
        });
      });
      obs.observe(el, OPCOES_OBS);
    });

    /* IntersectionObserver para elementos com .valor-animado */
    if (typeof IntersectionObserver === 'undefined') return;
    var io = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        if (el.dataset.animado) return;
        el.dataset.animado = '1';
        var raw = (el.dataset.valor || el.textContent || '0')
          .replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        var num = parseFloat(raw);
        if (!isNaN(num) && num >= 0) contarAte(el, num, 700, 'R$ ');
        io.unobserve(el);
      });
    }, { threshold: 0.3 });

    function observeAll() {
      document.querySelectorAll('.valor-animado:not([data-animado])').forEach(function(el) {
        io.observe(el);
      });
    }
    observeAll();
    var domObs = new MutationObserver(function() { observeAll(); });
    domObs.observe(document.body, { childList: true, subtree: true });
  }

  /* ── Shake em erros de formulário ──────────────────────── */

  function shake(el) {
    if (!el) return;
    el.classList.remove('anim-shake');
    void el.offsetHeight;
    el.classList.add('anim-shake');
    el.addEventListener('animationend', function() {
      el.classList.remove('anim-shake');
    }, { once: true });
  }

  /* Shake por ID — tenta sacudir o form-group pai primeiro */
  function shakeField(id) {
    var el = document.getElementById(id);
    if (!el) return;
    shake(el.closest('.form-group') || el.closest('.valor-hero') || el);
    if (el.focus) el.focus();
  }

  /* ── Cat-btn: pop ao selecionar ────────────────────────── */

  function setupCatPop() {
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.cat-btn');
      if (!btn) return;
      var emoji = btn.querySelector('.cat-emoji');
      if (!emoji) return;
      emoji.classList.remove('anim-pop-in');
      void emoji.offsetHeight;
      emoji.classList.add('anim-pop-in');
      emoji.addEventListener('animationend', function() {
        emoji.classList.remove('anim-pop-in');
      }, { once: true });
    });
  }

  /* ── Auto-scroll após escolher categoria ───────────────── */

  function setupCategoryScroll() {
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.cat-btn');
      if (!btn) return;
      setTimeout(function() {
        var dataChips = document.querySelector('.data-chips');
        if (dataChips) dataChips.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 260);
    });
  }

  /* ── Input: feedback de foco ────────────────────────────── */

  function setupInputFeedback() {
    var valorInput = document.getElementById('novo-valor');
    if (valorInput) {
      valorInput.addEventListener('focus', function() {
        var hero = document.getElementById('valor-hero');
        if (hero) hero.classList.add('valor-hero--focused');
      });
      valorInput.addEventListener('blur', function() {
        var hero = document.getElementById('valor-hero');
        if (hero) hero.classList.remove('valor-hero--focused');
      });
    }
  }

  /* ── Transições direcionais de aba ──────────────────────── */

  var _ultimaAba = null;
  var _ordemAbas = ['resumo', 'novo', 'extrato', 'graficos', 'config'];

  function setupTabTransitions() {
    document.addEventListener('click', function(e) {
      var navBtn = e.target.closest('.nav-btn[data-aba]');
      if (!navBtn) return;
      var aba = navBtn.dataset.aba;
      if (!aba || aba === _ultimaAba) return;

      var idxAtual = _ordemAbas.indexOf(_ultimaAba);
      var idxNova  = _ordemAbas.indexOf(aba);
      var abaEl    = document.getElementById('aba-' + aba);

      if (abaEl) {
        var classe = (idxAtual === -1 || idxNova > idxAtual) ? 'aba-slide-right' : 'aba-slide-left';
        abaEl.classList.remove('aba-slide-right', 'aba-slide-left');
        void abaEl.offsetHeight;
        abaEl.classList.add(classe);
        abaEl.addEventListener('animationend', function() {
          abaEl.classList.remove('aba-slide-right', 'aba-slide-left');
        }, { once: true });
      }

      _ultimaAba = aba;
    });
  }

  /* ── Botão registrar: estado de loading ─────────────────── */

  function setupButtonLoading() {
    // O estado Salvando/Salvo/Falhou é controlado por INIT_FORM + PERSIST_QUEUE.
    // Um timer cosmético de 1,6s reabilitava o botão antes da gravação real —
    // exatamente o ritmo que a auditoria anual usou para perder lançamentos.
  }

  /* ── Quick amounts (valores rápidos) ────────────────────── */

  function setupQuickAmounts() {
    document.addEventListener('click', function(e) {
      var btn = e.target.closest('.quick-amount');
      if (!btn) return;
      var val = parseFloat(btn.dataset.valor || 0);
      var inp = document.getElementById('novo-valor');
      if (!inp || !val) return;

      var current = 0;
      if (inp.value) {
        current = parseFloat(inp.value.replace(/\./g, '').replace(',', '.')) || 0;
      }
      var novo = current + val;
      inp.value = novo.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      inp.dispatchEvent(new Event('input', { bubbles: true }));

      /* Mini pulse no botão clicado */
      btn.classList.add('anim-pop-in');
      btn.addEventListener('animationend', function() {
        btn.classList.remove('anim-pop-in');
      }, { once: true });
    });
  }

  /* ── Progresso visual do formulário ─────────────────────── */

  function setupFormProgress() {
    var form        = document.getElementById('form-transacao');
    var progressBar = document.getElementById('form-progress-bar');
    if (!form || !progressBar) return;

    function calcProgress() {
      var valor = document.getElementById('novo-valor');
      var cat   = document.getElementById('novo-categoria');
      var data  = document.getElementById('novo-data');
      var desc  = document.getElementById('novo-descricao');
      var score = 0;
      if (valor && valor.value) {
        var num = parseFloat(valor.value.replace(/\./g, '').replace(',', '.'));
        if (num > 0) score += 40;
      }
      if (desc && desc.value && desc.value.trim().length >= 2) score += 20;
      if (data && data.value) score += 20;
      var iaOk = false;
      if (typeof INIT_FORM !== 'undefined' && INIT_FORM._iaSuggestion) {
        iaOk = INIT_FORM._iaSuggestion.confianca === 'alta' || INIT_FORM._iaConfirmed === true;
      }
      if ((cat && cat.value) || iaOk) score += 20;
      progressBar.style.width      = score + '%';
      progressBar.style.background = score === 100
        ? 'var(--color-success)'
        : 'var(--color-primary-400)';
    }

    form.addEventListener('input',  calcProgress);
    form.addEventListener('change', calcProgress);
    document.addEventListener('click', function(e) {
      if (e.target.closest('.cat-btn') || e.target.closest('.data-chip')) {
        setTimeout(calcProgress, 50);
      }
    });
  }

  /* ── Stagger nas categorias ao re-renderizar ─────────────── */

  function setupGridStagger() {
    var grid = document.getElementById('categoria-grid');
    if (!grid) return;
    var obs = new MutationObserver(function(mutations) {
      mutations.forEach(function(m) {
        if (m.type !== 'childList' || m.addedNodes.length === 0) return;
        grid.querySelectorAll('.cat-btn').forEach(function(btn, i) {
          btn.style.animationDelay = (i * 28) + 'ms';
        });
      });
    });
    obs.observe(grid, { childList: true });
  }

  /* ── Init público ──────────────────────────────────────── */

  function init() {
    // Cada setup fica isolado de propósito: um efeito visual que falha não pode
    // derrubar os outros nove nem o boot do app. O que mudou é que a falha
    // deixa RASTRO — antes, uma animação que sumia na máquina de alguém não
    // tinha como ser diagnosticada.
    //
    // Nenhum deles avisa o usuário: efeito visual ausente não é assunto dele, e
    // um toast de erro por animação seria pior que a própria ausência.
    [
      ['ripple', setupRipple],
      ['valoresMonetarios', animarValoresMonetarios],
      ['catPop', setupCatPop],
      ['inputFeedback', setupInputFeedback],
      ['categoryScroll', setupCategoryScroll],
      ['tabTransitions', setupTabTransitions],
      ['buttonLoading', setupButtonLoading],
      ['quickAmounts', setupQuickAmounts],
      ['formProgress', setupFormProgress],
      ['gridStagger', setupGridStagger]
    ].forEach(function(par) {
      if (typeof UTILS !== 'undefined' && UTILS.tentar) {
        UTILS.tentar('micro-interactions.' + par[0], par[1]);
        return;
      }
      // UTILS ausente é cenário de boot muito precoce; aqui o efeito visual
      // realmente não importa e não há para onde registrar.
      try { par[1](); } catch (e) { void e; }
    });
  }

  return {
    init:       init,
    shake:      shake,
    shakeField: shakeField,
    contarAte:  contarAte
  };

})();

/* Auto-init após DOMContentLoaded */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() { MICRO.init(); });
} else {
  MICRO.init();
}
