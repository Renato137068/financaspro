/**
 * session-log.js — ring buffer de eventos da sessão (modo suporte).
 * Sem PII: não registra descrições de lançamentos.
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */
const SESSION_LOG = {
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
    SESSION_LOG._eventos.push(evt);
    if (SESSION_LOG._eventos.length > SESSION_LOG._max) SESSION_LOG._eventos.shift();
  },

  snapshot: function() {
    return SESSION_LOG._eventos.slice();
  },

  limpar: function() {
    SESSION_LOG._eventos = [];
  }
};

export { SESSION_LOG };
export default SESSION_LOG;
