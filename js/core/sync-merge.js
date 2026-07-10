/**
 * sync-merge.js — fusão de delta e outbox no CLIENTE (design #2, §7).
 * Puro, zero DOM/deps. Contraparte do sync-conflict.service.js do servidor.
 *
 * Corrige os bugs de perda de dados diagnosticados:
 *   D1 — não sobrescreve registros com mutação pendente na outbox.
 *   D2 — tombstone (deletedAt) remove do cache, sem ressurreição.
 *   D3 — merge por registro via updatedAt (LWW), nunca full-replace destrutivo.
 */
var SYNC_MERGE = {
  _ms: function(v) {
    if (v == null) return NaN;
    var t = (v instanceof Date) ? v.getTime() : Date.parse(v);
    return isNaN(t) ? NaN : t;
  },

  _pendingSet: function(pendingIds) {
    var set = {};
    if (!pendingIds) return set;
    if (typeof pendingIds.forEach === 'function' && !Array.isArray(pendingIds)) {
      pendingIds.forEach(function(id) { set[id] = true; }); // Set
    } else {
      (pendingIds || []).forEach(function(id) { set[id] = true; });
    }
    return set;
  },

  /**
   * Aplica um delta do servidor ao cache local, protegendo pendentes.
   * @param {Array} local        registros atuais [{id, updatedAt, ...}]
   * @param {Array|Set} pendingIds ids com mutação pendente na outbox
   * @param {Array} delta         mudanças do servidor [{id, updatedAt, deletedAt?, ...}]
   * @returns {Array} novo cache local
   */
  mergeDelta: function(local, pendingIds, delta) {
    var pend = this._pendingSet(pendingIds);
    var self = this;
    var mapa = {};
    (Array.isArray(local) ? local : []).forEach(function(r) {
      if (r && r.id != null) mapa[r.id] = r;
    });

    (Array.isArray(delta) ? delta : []).forEach(function(d) {
      if (!d || d.id == null) return;
      if (pend[d.id]) return; // D1: pendente — a outbox reconcilia, não sobrescreve

      if (d.deletedAt) {           // D2: tombstone remove
        delete mapa[d.id];
        return;
      }

      var atual = mapa[d.id];
      if (!atual) { mapa[d.id] = d; return; }   // novo

      // D3: LWW por registro — só sobrescreve se o delta for >= (servidor autoritativo)
      var dm = self._ms(d.updatedAt);
      var am = self._ms(atual.updatedAt);
      if (isNaN(am) || isNaN(dm) || dm >= am) mapa[d.id] = d;
    });

    return Object.keys(mapa).map(function(k) { return mapa[k]; });
  },

  /**
   * Enfileira uma mutação na outbox, deduplicando por entity+id.
   * upsert substitui upsert anterior do mesmo id; delete suprime upserts anteriores.
   * @returns {Array} nova fila
   */
  outboxEnqueue: function(fila, mut) {
    if (!mut || mut.id == null) return (fila || []).slice();
    var out = (fila || []).filter(function(m) {
      return !(m.entity === mut.entity && m.id === mut.id);
    });
    out.push(mut);
    return out;
  },

  /**
   * Remove da outbox as mutações confirmadas pelo servidor (por opId),
   * mantendo as que não foram processadas (falha de rede).
   * @param {Array} fila
   * @param {Array} results [{ opId, action|status }]
   * @returns {Array} fila restante
   */
  outboxAckRemove: function(fila, results) {
    var acked = {};
    (results || []).forEach(function(r) { if (r && r.opId != null) acked[r.opId] = true; });
    return (fila || []).filter(function(m) { return !acked[m.opId]; });
  }
};

if (typeof module !== 'undefined' && module.exports) { module.exports = SYNC_MERGE; }
