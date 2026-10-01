/**
 * sync-merge.js — fusão do que vem da nuvem com o que está no aparelho.
 * Puro, zero DOM/deps. Usado pelo pull do Supabase (DADOS._mergeSnapshotLocal).
 *
 * Corrige os bugs de perda de dados diagnosticados:
 *   D1 — não sobrescreve registros com mutação pendente (pendingIds).
 *   D2 — tombstone (deletedAt) remove do cache, sem ressurreição.
 *   D3 — merge por registro via updatedAt (LWW), nunca full-replace destrutivo.
 *
 * A fila de envio (outbox) do sync v2 saiu com a API Express (ADR 0007).
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */
const SYNC_MERGE = {
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
    var pend = SYNC_MERGE._pendingSet(pendingIds);
    var self = SYNC_MERGE;
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

  _camposCoreDivergem: function(a, b) {
    if (!a || !b) return false;
    var campos = ['valor', 'descricao', 'data', 'tipo', 'categoria', 'banco', 'cartao'];
    for (var i = 0; i < campos.length; i++) {
      var k = campos[i];
      var va = a[k];
      var vb = b[k];
      if (va == null && vb == null) continue;
      if (String(va) !== String(vb)) return true;
    }
    return false;
  },

  /**
   * Conflitos raros: mesmo registro editado em duas abas com timestamps próximos.
   * @returns {Array<{id, local, remote}>}
   */
  detectarConflitos: function(local, pendingIds, delta, opts) {
    opts = opts || {};
    var janela = opts.janelaMs || 60000;
    var pend = SYNC_MERGE._pendingSet(pendingIds);
    var self = SYNC_MERGE;
    var mapaLocal = {};
    (Array.isArray(local) ? local : []).forEach(function(r) {
      if (r && r.id != null) mapaLocal[r.id] = r;
    });
    var conflitos = [];

    (Array.isArray(delta) ? delta : []).forEach(function(d) {
      if (!d || d.id == null || d.deletedAt || pend[d.id]) return;
      var loc = mapaLocal[d.id];
      if (!loc || !self._camposCoreDivergem(loc, d)) return;

      var am = self._ms(loc.updatedAt);
      var dm = self._ms(d.updatedAt);
      if (isNaN(am) || isNaN(dm)) return;

      var proximos = Math.abs(am - dm) <= janela;
      var empate = am === dm;
      if (proximos || empate) {
        conflitos.push({ id: d.id, local: loc, remote: d });
      }
    });
    return conflitos;
  },

  /**
   * Aplica escolhas do usuário ('local' | 'remote') sobre um delta remoto.
   */
  aplicarResolucoes: function(local, pendingIds, delta, resolucoes) {
    var res = resolucoes || {};
    var deltaFiltrado = (Array.isArray(delta) ? delta : []).filter(function(d) {
      if (!d || d.id == null) return false;
      return res[d.id] !== 'local';
    });
    var merged = SYNC_MERGE.mergeDelta(local, pendingIds, deltaFiltrado);
    var mapa = {};
    merged.forEach(function(r) { if (r && r.id != null) mapa[r.id] = r; });
    // A escolha do usuário é autoritativa — sobrepõe o LWW. Sem forçar o
    // 'remote', o mergeDelta rejeitava o delta quando o local era mais novo
    // (dm < am) e a decisão "remoto" sumia silenciosamente. Conflitos nunca
    // envolvem tombstone (detectarConflitos os ignora), então o delta aqui é
    // sempre um upsert.
    var mapaDelta = {};
    (Array.isArray(delta) ? delta : []).forEach(function(d) {
      if (d && d.id != null) mapaDelta[d.id] = d;
    });
    (Array.isArray(local) ? local : []).forEach(function(loc) {
      if (loc && loc.id != null && res[loc.id] === 'local') mapa[loc.id] = loc;
    });
    Object.keys(res).forEach(function(id) {
      if (res[id] === 'remote' && mapaDelta[id]) mapa[id] = mapaDelta[id];
    });
    return Object.keys(mapa).map(function(k) { return mapa[k]; });
  },

  /**
   * Orçamentos do config (objeto por categoria) → lista de registros com id,
   * para passar pelo mergeDelta.
   */
  orcamentosToArray: function(orc) {
    var out = [];
    if (!orc || typeof orc !== 'object') return out;
    Object.keys(orc).forEach(function(cat) {
      var entry = orc[cat];
      if (!entry) return;
      out.push({
        id: entry.id,
        categoria: cat,
        limite: entry.limite,
        periodo: entry.periodo || 'mensal',
        definidoEm: entry.definidoEm,
        updatedAt: entry.updatedAt || entry.definidoEm,
        ativo: entry.ativo !== false,
      });
    });
    return out;
  },

  /** Volta da lista para o objeto por categoria; apagados e inativos saem. */
  arrayToOrcamentos: function(list) {
    var orc = {};
    (list || []).forEach(function(b) {
      if (!b || !b.categoria || b.deletedAt || b.ativo === false) return;
      orc[b.categoria] = {
        limite: b.limite,
        definidoEm: b.definidoEm || b.updatedAt,
        id: b.id,
        periodo: b.periodo || 'mensal',
        updatedAt: b.updatedAt || b.definidoEm,
      };
    });
    return orc;
  }
};

export { SYNC_MERGE };
export default SYNC_MERGE;
