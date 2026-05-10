/* Keyboard shortcuts — desktop power users.
   Não dispara em inputs/textareas. Modifier-free para velocidade tipo Slack/Linear. */
var SHORTCUTS = {
  ABAS: { '1': 'resumo', '2': 'novo', '3': 'extrato', '4': 'orcamento', '5': 'config' },

  init: function() {
    var self = this;
    document.addEventListener('keydown', function(ev) { self._handle(ev); });
  },

  _handle: function(ev) {
    // Ignora se foco em input editável
    var alvo = ev.target;
    if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' ||
                 alvo.tagName === 'SELECT' || alvo.isContentEditable)) return;

    // Ignora se modal aberto (exceto Esc)
    var modal = document.querySelector('.modal-overlay, .pin-lock-screen');
    if (modal && ev.key !== 'Escape') return;

    // Modifiers (exceto Shift para ?)
    if (ev.ctrlKey || ev.altKey || ev.metaKey) return;

    var key = ev.key;

    // Esc fecha modal/lockscreen
    if (key === 'Escape') {
      var ov = document.querySelector('.modal-overlay');
      if (ov) {
        ev.preventDefault();
        if (typeof fecharModal === 'function') fecharModal(); else ov.remove();
      }
      return;
    }

    // ? mostra ajuda
    if (key === '?' || (ev.shiftKey && key === '/')) {
      ev.preventDefault();
      this.mostrarAjuda();
      return;
    }

    // 1-5 muda aba
    if (this.ABAS[key] && typeof mudarAba === 'function') {
      ev.preventDefault();
      mudarAba(this.ABAS[key]);
      return;
    }

    // n: nova transação
    if (key === 'n' && typeof mudarAba === 'function') {
      ev.preventDefault();
      mudarAba('novo');
      setTimeout(function() {
        var inp = document.getElementById('novo-descricao') || document.getElementById('novo-valor');
        if (inp) inp.focus();
      }, 100);
      return;
    }

    // / foca busca extrato
    if (key === '/') {
      var busca = document.getElementById('extrato-busca');
      if (busca) {
        ev.preventDefault();
        if (typeof mudarAba === 'function') mudarAba('extrato');
        setTimeout(function() { busca.focus(); }, 100);
      }
    }
  },

  mostrarAjuda: function() {
    if (typeof fpAlert !== 'function') return;
    var html = '<div style="text-align:left;font-size:14px;line-height:1.8">' +
      '<p style="font-weight:700;font-size:16px;margin-bottom:12px;text-align:center">⌨️ Atalhos do Teclado</p>' +
      '<div style="display:grid;grid-template-columns:auto 1fr;gap:8px 16px;font-size:13px">' +
        '<kbd style="background:var(--bg);padding:2px 8px;border-radius:6px;font-family:monospace;font-weight:600;text-align:center">1</kbd><span>Resumo</span>' +
        '<kbd style="background:var(--bg);padding:2px 8px;border-radius:6px;font-family:monospace;font-weight:600;text-align:center">2</kbd><span>Nova transação</span>' +
        '<kbd style="background:var(--bg);padding:2px 8px;border-radius:6px;font-family:monospace;font-weight:600;text-align:center">3</kbd><span>Extrato</span>' +
        '<kbd style="background:var(--bg);padding:2px 8px;border-radius:6px;font-family:monospace;font-weight:600;text-align:center">4</kbd><span>Orçamento</span>' +
        '<kbd style="background:var(--bg);padding:2px 8px;border-radius:6px;font-family:monospace;font-weight:600;text-align:center">5</kbd><span>Configurações</span>' +
        '<kbd style="background:var(--bg);padding:2px 8px;border-radius:6px;font-family:monospace;font-weight:600;text-align:center">n</kbd><span>Nova transação (foco)</span>' +
        '<kbd style="background:var(--bg);padding:2px 8px;border-radius:6px;font-family:monospace;font-weight:600;text-align:center">/</kbd><span>Buscar no extrato</span>' +
        '<kbd style="background:var(--bg);padding:2px 8px;border-radius:6px;font-family:monospace;font-weight:600;text-align:center">Esc</kbd><span>Fechar modal</span>' +
        '<kbd style="background:var(--bg);padding:2px 8px;border-radius:6px;font-family:monospace;font-weight:600;text-align:center">?</kbd><span>Esta ajuda</span>' +
      '</div></div>';
    fpAlert(html);
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SHORTCUTS;
}
