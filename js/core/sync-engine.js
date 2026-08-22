/**
 * sync-engine.js — outbox durável, pull incremental e flush com backoff (sync v2).
 * Depende de: CONFIG, SYNC_MERGE, UTILS (opcional), DADOS (para conversão PT↔EN).
 * Testável via _storage injetado e apiFetch mockado.
 */
var SYNC_ENGINE = {
  _storage: null,
  _backoffMs: 1000,
  _backoffMax: 60000,
  _flushTimer: null,
  _flushing: false,

  _getStorage: function() {
    if (this._storage) return this._storage;
    return (typeof localStorage !== 'undefined') ? localStorage : null;
  },

  _readJson: function(key, fallback) {
    var st = this._getStorage();
    if (!st) return fallback;
    try {
      var raw = st.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },

  _writeJson: function(key, value) {
    var st = this._getStorage();
    if (!st) return false;
    st.setItem(key, JSON.stringify(value));
    return true;
  },

  loadOutbox: function() {
    var key = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_OUTBOX) || 'fp-outbox';
    return this._readJson(key, []);
  },

  saveOutbox: function(fila) {
    var key = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_OUTBOX) || 'fp-outbox';
    this._writeJson(key, fila || []);
    this._notifyOutbox(fila);
  },

  getCursor: function() {
    var key = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_SYNC_CURSOR) || 'fp-sync-cursor';
    return this._readJson(key, null);
  },

  setCursor: function(cursor) {
    var key = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_SYNC_CURSOR) || 'fp-sync-cursor';
    if (cursor) this._writeJson(key, cursor);
  },

  pendingIds: function() {
    var fila = this.loadOutbox();
    return fila.map(function(m) { return m.id; });
  },

  outboxCount: function() {
    return this.loadOutbox().length;
  },

  _gerarOpId: function() {
    if (typeof UTILS !== 'undefined' && UTILS.gerarUuid) return UTILS.gerarUuid();
    return String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  },

  _nowIso: function() {
    return new Date().toISOString();
  },

  /**
   * Enfileira mutação de transação.
   * @param {'upsert'|'delete'} op
   * @param {Object} tx registro PT local
   */
  enqueueTransaction: function(op, tx) {
    if (!tx || !tx.id) return this.loadOutbox();
    var mut = {
      opId: this._gerarOpId(),
      entity: 'transaction',
      id: tx.id,
      op: op,
      clientUpdatedAt: tx.updatedAt || tx.dataCriacao || this._nowIso(),
      payload: op === 'upsert' ? this._txToPayload(tx) : undefined,
      attempts: 0,
      enqueuedAt: this._nowIso(),
    };
    var fila = SYNC_MERGE.outboxEnqueue(this.loadOutbox(), mut);
    this.saveOutbox(fila);
    this.scheduleFlush();
    return fila;
  },

  _txToPayload: function(tx) {
    if (typeof FINANCE_CONTRACT !== 'undefined') {
      return FINANCE_CONTRACT.txPtToEn(tx);
    }
    if (typeof DADOS !== 'undefined' && DADOS._txPtToEn) {
      return DADOS._txPtToEn(tx);
    }
    var data = tx.data || '';
    var isoDate = data.length === 10 ? data + 'T00:00:00.000Z' : data;
    return {
      type: tx.tipo,
      amount: typeof tx.valor === 'number' ? tx.valor : parseFloat(String(tx.valor).replace(',', '.')) || 0,
      description: tx.descricao || 'Sem descrição',
      category: tx.categoria || 'outro',
      subcategory: tx.subcategoria || undefined,
      date: isoDate,
      accountId: tx.banco && tx.banco.length === 36 ? tx.banco : undefined,
      tags: Array.isArray(tx.tags) ? tx.tags : [],
      notes: tx.notas || undefined,
      recurring: !!tx.recorrente,
    };
  },

  _txEnToPt: function(tx) {
    if (typeof FINANCE_CONTRACT !== 'undefined') {
      var pt = FINANCE_CONTRACT.txEnToPt(tx);
      pt.updatedAt = tx.updatedAt || pt.dataCriacao;
      pt.deletedAt = tx.deletedAt || null;
      return pt;
    }
    if (typeof DADOS !== 'undefined' && DADOS._txEnToPt) {
      var pt = DADOS._txEnToPt(tx);
      pt.updatedAt = tx.updatedAt || pt.dataCriacao;
      pt.deletedAt = tx.deletedAt || null;
      return pt;
    }
    return tx;
  },

  scheduleFlush: function(delayMs) {
    var self = this;
    if (this._flushTimer) return;
    var delay = delayMs != null ? delayMs : 300;
    this._flushTimer = setTimeout(function() {
      self._flushTimer = null;
      self.flush().catch(function() {});
    }, delay);
  },

  _nextBackoff: function(attempts) {
    var base = this._backoffMs * Math.pow(2, Math.min(attempts || 0, 6));
    var jitter = Math.floor(Math.random() * 500);
    return Math.min(base + jitter, this._backoffMax);
  },

  /**
   * Envia outbox ao servidor. Falha de rede mantém fila intacta.
   * @param {Function} [apiFetch] injetável para testes
   */
  flush: function(apiFetch) {
    var self = this;
    if (this._flushing) return Promise.resolve({ ok: false, reason: 'busy' });
    var fila = this.loadOutbox();
    if (!fila.length) return Promise.resolve({ ok: true, flushed: 0 });

    var fetchFn = apiFetch || this._defaultFetch();
    if (!fetchFn) return Promise.resolve({ ok: false, reason: 'no-api' });

    this._flushing = true;
    if (typeof APP_STORE !== 'undefined' && APP_STORE && typeof ACTIONS !== 'undefined' && ACTIONS) {
      APP_STORE.dispatch(ACTIONS.SYNC_INICIAR);
    }

    var body = {
      mutations: fila.map(function(m) {
        return {
          opId: m.opId,
          entity: m.entity,
          op: m.op,
          id: m.id,
          clientUpdatedAt: m.clientUpdatedAt,
          payload: m.payload,
        };
      }),
    };

    return fetchFn('/api/v1/sync', {
      method: 'POST',
      body: JSON.stringify(body),
    }).then(function(resp) {
      var results = (resp && resp.data && resp.data.results) ? resp.data.results : [];
      var conflicts = [];
      results.forEach(function(r) {
        if (r.action === 'server-wins' || r.status === 'stale') conflicts.push(r);
      });

      var remaining = SYNC_MERGE.outboxAckRemove(fila, results);
      // Re-enfileira rejeitados com backoff
      results.forEach(function(r) {
        if (r.action === 'reject') {
          var orig = fila.find(function(m) { return m.opId === r.opId; });
          if (orig) {
            orig.attempts = (orig.attempts || 0) + 1;
            remaining = SYNC_MERGE.outboxEnqueue(remaining, orig);
          }
        }
      });
      self.saveOutbox(remaining);

      if (conflicts.length && typeof APP_STORE !== 'undefined' && APP_STORE && typeof ACTIONS !== 'undefined' && ACTIONS) {
        APP_STORE.dispatch(ACTIONS.SYNC_CONFLITO, { conflicts: conflicts });
      }

      if (typeof APP_STORE !== 'undefined' && APP_STORE && typeof ACTIONS !== 'undefined' && ACTIONS) {
        APP_STORE.dispatch(ACTIONS.SYNC_PENDENTE, { count: remaining.length });
        if (!remaining.length) {
          APP_STORE.dispatch(ACTIONS.SYNC_CONCLUIR);
        } else {
          APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, { erro: 'operacoes-pendentes' });
          self.scheduleFlush(self._nextBackoff(remaining[0].attempts));
        }
      }

      return { ok: true, flushed: results.length, remaining: remaining.length, conflicts: conflicts };
    }).catch(function(err) {
      fila.forEach(function(m) { m.attempts = (m.attempts || 0) + 1; });
      self.saveOutbox(fila);
      if (typeof APP_STORE !== 'undefined' && APP_STORE && typeof ACTIONS !== 'undefined' && ACTIONS) {
        APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, { erro: err.message || 'rede' });
        APP_STORE.dispatch(ACTIONS.SYNC_PENDENTE, { count: fila.length });
      }
      self.scheduleFlush(self._nextBackoff(fila[0] && fila[0].attempts));
      return { ok: false, reason: err.message || 'rede' };
    }).finally(function() {
      self._flushing = false;
    });
  },

  /**
   * Pull incremental e merge seguro no cache local de transações.
   */
  pull: function(apiFetch) {
    var self = this;
    var fetchFn = apiFetch || this._defaultFetch();
    if (!fetchFn) return Promise.resolve({ ok: false, reason: 'no-api' });

    var since = this.getCursor();
    var qs = since ? ('?since=' + encodeURIComponent(since)) : '';

    return fetchFn('/api/v1/sync' + qs).then(function(resp) {
      var data = resp && resp.data ? resp.data : {};
      var delta = Array.isArray(data.transactions) ? data.transactions : [];
      var merged = self._applyDeltaToLocal(delta);
      if (data.cursor) self.setCursor(data.cursor);
      return { ok: true, delta: delta.length, merged: merged };
    });
  },

  _applyDeltaToLocal: function(deltaEn) {
    if (typeof DADOS === 'undefined') return 0;
    var local = DADOS.getTransacoesRaw ? DADOS.getTransacoesRaw() : DADOS.getTransacoes();
    var pending = this.pendingIds();
    var deltaPt = deltaEn.map(this._txEnToPt.bind(this));
    var merged = SYNC_MERGE.mergeDelta(local, pending, deltaPt);
    DADOS._storageSetTransacoes(merged);
    return merged.length;
  },

  /**
   * Bootstrap seguro: merge snapshot /state sem full-replace (fallback 1ª sync).
   */
  bootstrapFromSnapshot: function(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.transactions) || !snapshot.transactions.length) return;
    var deltaEn = snapshot.transactions.map(function(tx) {
      return Object.assign({}, tx, { updatedAt: tx.updatedAt || tx.createdAt });
    });
    this._applyDeltaToLocal(deltaEn);
    if (snapshot.meta && snapshot.meta.syncedAt) {
      this.setCursor(snapshot.meta.syncedAt);
    }
  },

  /**
   * Pull incremental paginado até esgotar o delta.
   * @param {Function} [apiFetch]
   * @param {string} [since] ISO — default: cursor local
   */
  pullAll: function(apiFetch, since) {
    var self = this;
    var fetchFn = apiFetch || this._defaultFetch();
    if (!fetchFn) return Promise.resolve({ ok: false, reason: 'no-api' });

    var baseSince = since != null ? since : this.getCursor();
    var total = 0;
    var batch = (typeof CONFIG !== 'undefined' && CONFIG.SYNC_DELTA_BATCH_SIZE) || 500;

    function nextPage(pageCursor) {
      var qs = [];
      if (baseSince) qs.push('since=' + encodeURIComponent(baseSince));
      if (pageCursor) qs.push('cursor=' + encodeURIComponent(pageCursor));
      qs.push('limit=' + batch);
      var q = '?' + qs.join('&');

      return fetchFn('/api/v1/sync' + q).then(function(resp) {
        var data = resp && resp.data ? resp.data : {};
        var delta = Array.isArray(data.transactions) ? data.transactions : [];
        total += delta.length;
        self._applyDeltaToLocal(delta);
        if (data.hasMore && data.nextCursor) {
          return nextPage(data.nextCursor);
        }
        if (data.cursor) self.setCursor(data.cursor);
        return { ok: true, delta: total };
      });
    }

    return nextPage(null);
  },

  /** Ciclo completo: pull paginado → flush */
  syncCycle: function(apiFetch) {
    var self = this;
    var fetchFn = apiFetch || this._defaultFetch();
    return this.pullAll(fetchFn).then(function() {
      return self.flush(fetchFn);
    });
  },

  _defaultFetch: function() {
    if (typeof DADOS !== 'undefined' && DADOS._apiFetch) {
      return DADOS._apiFetch.bind(DADOS);
    }
    return null;
  },

  _notifyOutbox: function(fila) {
    if (typeof APP_STORE !== 'undefined' && APP_STORE && typeof ACTIONS !== 'undefined' && ACTIONS) {
      APP_STORE.dispatch(ACTIONS.SYNC_PENDENTE, { count: (fila || []).length });
    }
  },

  /** Para testes — reseta timers e backoff */
  _reset: function() {
    if (this._flushTimer) clearTimeout(this._flushTimer);
    this._flushTimer = null;
    this._flushing = false;
    this._backoffMs = 1000;
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = SYNC_ENGINE;
}
