/**
 * micro-interactions.js — Microinterações premium
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

  function contarAte(el, fim, duracao, prefixo, sufixo) {
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

      if (progresso < 1) requestAnimationFrame(_step);
    }

    requestAnimationFrame(_step);
  }

  /* Anima valores monetários quando mudam — IDs fixos + .valor-animado */
  function animarValoresMonetarios() {
    var ids = ['resumo-receitas', 'resumo-despesas'];
    ids.forEach(function(id) {
      var el = document.getElementById(id);
      if (!el) return;
      var obs = new MutationObserver(function() {
        var txt = el.textContent.replace('R$', '').replace(/\./g, '').replace(',', '.').trim();
        var num = parseFloat(txt);
        if (!isNaN(num) && num > 0) contarAte(el, num, 550, 'R$ ');
      });
      obs.observe(el, { childList: true, characterData: true, subtree: true });
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
    var form = document.getElementById('form-transacao');
    if (!form) return;

    form.addEventListener('submit', function() {
      var btn = form.querySelector('.btn-registrar');
      if (!btn || btn.dataset.loading) return;
      var textoOriginal = btn.innerHTML;
      btn.dataset.loading = '1';
      btn.innerHTML = '⏳ Salvando…';
      btn.disabled = true;
      setTimeout(function() {
        btn.innerHTML = textoOriginal;
        btn.disabled  = false;
        delete btn.dataset.loading;
      }, 1600);
    });
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
    try { setupRipple();            } catch (e) {}
    try { animarValoresMonetarios();} catch (e) {}
    try { setupCatPop();            } catch (e) {}
    try { setupInputFeedback();     } catch (e) {}
    try { setupCategoryScroll();    } catch (e) {}
    try { setupTabTransitions();    } catch (e) {}
    try { setupButtonLoading();     } catch (e) {}
    try { setupQuickAmounts();      } catch (e) {}
    try { setupFormProgress();      } catch (e) {}
    try { setupGridStagger();       } catch (e) {}
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
