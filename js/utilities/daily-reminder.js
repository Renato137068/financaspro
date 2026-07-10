/**
 * daily-reminder.js — Lembrete diário via Notification API (quando permitido)
 */
const DAILY_REMINDER = {
  _lastKey: 'fp-lembrete-ultimo-dia',

  isSupported: function() {
    return typeof Notification !== 'undefined';
  },

  requestPermission: function() {
    if (!this.isSupported()) return Promise.resolve('unsupported');
    if (Notification.permission === 'granted') return Promise.resolve('granted');
    if (Notification.permission === 'denied') return Promise.resolve('denied');
    return Notification.requestPermission();
  },

  notify: function(title, body) {
    if (!this.isSupported() || Notification.permission !== 'granted') return false;
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
    if (!this.isSupported() || Notification.permission !== 'granted') return;

    var hoje = new Date().toISOString().split('T')[0];
    try {
      if (localStorage.getItem(this._lastKey) === hoje) return;
    } catch (_e) { return; }

    var txs = typeof TRANSACOES !== 'undefined' ? TRANSACOES.obter({ mes: new Date().getMonth() + 1, ano: new Date().getFullYear() }) : [];
    var temHoje = txs.some(function(t) { return t.data === hoje; });
    if (temHoje) {
      try { localStorage.setItem(this._lastKey, hoje); } catch (_e) { /* ignore */ }
      return;
    }

    if (this.notify('FinançasPro', 'Você ainda não registrou gastos hoje. Que tal um lançamento rápido?')) {
      try { localStorage.setItem(this._lastKey, hoje); } catch (_e) { /* ignore */ }
    }
  }
};
