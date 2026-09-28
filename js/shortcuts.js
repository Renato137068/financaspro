/**
 * Keyboard shortcuts — desktop power users.
 * Não dispara em inputs/textareas. Modifier-free para velocidade tipo Slack/Linear.
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

import { mudarAba } from './modules/init-navigation.js';

const SHORTCUTS = {
  ABAS: { '1': 'resumo', '2': 'novo', '3': 'extrato', '4': 'orcamento', '5': 'config' },

  init: function() {
    var self = SHORTCUTS;
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
        ov.remove();
      }
      return;
    }

    // ? mostra ajuda
    if (key === '?' || (ev.shiftKey && key === '/')) {
      ev.preventDefault();
      SHORTCUTS.mostrarAjuda();
      return;
    }

    // 1-5 muda aba
    if (SHORTCUTS.ABAS[key] && typeof mudarAba === 'function') {
      ev.preventDefault();
      mudarAba(SHORTCUTS.ABAS[key]);
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
      if (typeof mudarAba !== 'function') return;
      ev.preventDefault();
      var focarBusca = function() {
        var busca = document.getElementById('extrato-busca');
        if (busca) setTimeout(function() { busca.focus(); }, 100);
      };
      // O Extrato chega com o chunk (js/core/telas.js): na primeira vez o campo
      // só existe depois que a tela carrega.
      if (!document.getElementById('extrato-busca')) {
        document.addEventListener('fp:tela-carregada', function aoCarregar(e) {
          if (e.detail.nome !== 'extrato') return;
          document.removeEventListener('fp:tela-carregada', aoCarregar);
          focarBusca();
        });
      }
      mudarAba('extrato');
      focarBusca();
    }
  },

  mostrarAjuda: function() {
    if (typeof fpAlert !== 'function') return;
    var html = '<div style="text-align:left;font-size:14px;line-height:1.8">' +
      '<p style="font-weight:700;font-size:16px;margin-bottom:12px;text-align:center;display:flex;align-items:center;justify-content:center;gap:8px"><i data-lucide="keyboard" aria-hidden="true"></i> Atalhos do Teclado</p>' +
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
    fpAlert(html, { trustedHtml: true, title: 'Atalhos do teclado' });
    setTimeout(function() {
      var overlay = document.querySelector('.modal-overlay');
      if (overlay && typeof renderLucideIcons === 'function') renderLucideIcons(overlay);
    }, 100);
  }
};

export { SHORTCUTS };
export default SHORTCUTS;
