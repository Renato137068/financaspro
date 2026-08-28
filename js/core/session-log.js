/**
 * session-log.js — ring buffer de eventos da sessão (modo suporte).
 * Sem PII: não registra descrições de lançamentos.
 */
var SESSION_LOG = {
  _max: 80,
  _eventos: [],

  registrar: function(tipo, detalhe) {
    if (!tipo) return;
    var evt = {
      t: Date.now(),
      iso: new Date().toISOString(),
      tipo: String(tipo)
    };
    if (detalhe != null) evt.detalhe = detalhe;
    this._eventos.push(evt);
    if (this._eventos.length > this._max) this._eventos.shift();
  },

  snapshot: function() {
    return this._eventos.slice();
  },

  limpar: function() {
    this._eventos = [];
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SESSION_LOG;
}
