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

  /* ── Input: feedback de foco ──────────────