/**
 * daily-reminder.js — Lembrete diário via Notification API (quando permitido)
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

import { UTILS } from '../core/utils.js';
import { TRANSACOES } from '../transacoes.js';
import { DADOS } from '../core/dados.js';

const DAILY_REMINDER = {
  _lastKey: 'fp-lembrete-ultimo-dia',

  isSupported: function() {
    return typeof Notification !== 'undefined';
  },

  requestPermission: function() {
    if (!DAILY_REMINDER.isSupported()) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    if (Notification.permission === 'denied') return Promise.resolve('denied');
    return Notification.requestPermission();
  },

  notify: function(title, body) {
    if (!DAILY_REMINDER.isSupported() || Notification.permission !== 'granted') return false;
    try {
      new Notification(title, {
        body: body,
        icon: 'icons/android/icon-192.png',
        tag: 'fp-lembrete-diario'
      });
      return true;
    } catch (_e) {
      return false;
    }
  },

  /** Verifica se já lembrou hoje; se não, notifica quando não há lançamentos no dia */
  maybeRemind: function() {
    var config = DADOS.getConfig();
    if (!config || !config.lembreteDiario) return;
    if (!DAILY_REMINDER.isSupported() || Notification.permission !== 'granted') return;

    var hoje = UTILS.dataLocalIso();
    try {
      if (localStorage.getItem(DAILY_REMINDER._lastKey) === hoje) return;
    } catch (_e) { return; }

    var txs = typeof TRANSACOES !== 'undefined' ? TRANSACOES.obter({ mes: new Date().getMonth() + 1, ano: new Date().getFullYear() }) : [];
    var temHoje = txs.some(function(t) { return t.data === hoje; });
    if (temHoje) {
      try { localStorage.setItem(DAILY_REMINDER._lastKey, hoje); } catch (_e) { /* ignore */ }
      return;
    }

    if (DAILY_REMINDER.notify('FinançasPro', 'Você ainda não registrou gastos hoje. Que tal um lançamento rápido?')) {
      try { localStorage.setItem(DAILY_REMINDER._lastKey, hoje); } catch (_e) { /* ignore */ }
    }
  }
};

export { DAILY_REMINDER };
export default DAILY_REMINDER;
