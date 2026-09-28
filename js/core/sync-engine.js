/**
 * sync-engine.js — outbox durável, pull incremental e flush com backoff (sync v2).
 * Depende de: CONFIG, SYNC_MERGE, UTILS (opcional), DADOS (para conversão PT↔EN).
 * Testável via _storage injetado e apiFetch mockado.
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */

import { CONFIG } from './config.js';
import { UTILS } from './utils.js';
import { FINANCE_CONTRACT } from './finance-contract.js';
import { SYNC_MERGE } from './sync-merge.js';
import { ORCAMENTO } from '../orcamento.js';
import { APP_STORE } from './store.js';
import { ACTIONS } from '../services/actions.js';

const SYNC_ENGINE = {
  _storage: null,
  _backoffMs: 1000,
  _backoffMax: 60000,
  _flushTimer: null,
  _flushing: false,

  _getStorage: function() {
    if (SYNC_ENGINE._storage) return SYNC_ENGINE._storage;
    return (typeof localStorage !== 'undefined') ? localStorage : null;
  },

  _readJson: function(key, fallback) {
    var st = SYNC_ENGINE._getStorage();
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
    var st = SYNC_ENGINE._getStorage();
    if (!st) return false;
    st.setItem(key, JSON.stringify(value));
    return true;
  },

  loadOutbox: function() {
    var key = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_OUTBOX) || 'fp-outbox';
    return SYNC_ENGINE._readJson(key, []);
  },

  saveOutbox: function(fila) {
    var key = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_OUTBOX) || 'fp-outbox';
    SYNC_ENGINE._writeJson(key, fila || []);
    SYNC_ENGINE._notifyOutbox(fila);
  },

  getCursor: function() {
    var key = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_SYNC_CURSOR) || 'fp-sync-cursor';
    return SYNC_ENGINE._readJson(key, null);
  },

  setCursor: function(cursor) {
    var key = (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_SYNC_CURSOR) || 'fp-sync-cursor';
    if (cursor) SYNC_ENGINE._writeJson(key, cursor);
  },

  pendingIds: function(entity) {
    var fila = SYNC_ENGINE.loadOutbox();
    if (entity) {
      return fila.filter(function(m) { return m.entity === entity; }).map(function(m) { return m.id; });
    }
    return fila.map(function(m) { return m.id; });
  },

  outboxCount: function() {
    return SYNC_ENGINE.loadOutbox().length;
  },

  _gerarOpId: function() {
    if (typeof UTILS !== 'undefined' && UTILS.gerarUuid) return UTILS.gerarUuid();
    return String(Date.now()) + '-' + Math.random().toString(36).slice(2);
  },

  _nowIso: function() {
    return new Date().toISOString();
  },

  _enqueue: function(entity, op, record, payload) {
    if (!record || !record.id) return SYNC_ENGINE.loadOutbox();
    var mut = {
      opId: SYNC_ENGINE._gerarOpId(),
      entity: entity,
      id: record.id,
      op: op,
      clientUpdatedAt: record.updatedAt || record.dataCriacao || SYNC_ENGINE._nowIso(),
      payload: op === 'upsert' ? payload : undefined,
      attempts: 0,
      enqueuedAt: SYNC_ENGINE._nowIso(),
    };
    var fila = SYNC_MERGE.outboxEnqueue(SYNC_ENGINE.loadOutbox(), mut);
    SYNC_ENGINE.saveOutbox(fila);
    SYNC_ENGINE.scheduleFlush();
    return fila;
  },

  /**
   * Enfileira mutação de transação.
   * @param {'upsert'|'delete'} op
   * @param {Object} tx registro PT local
   */
  enqueueTransaction: function(op, tx) {
    return SYNC_ENGINE._enqueue('transaction', op, tx, op === 'upsert' ? SYNC_ENGINE._txToPayload(tx) : undefined);
  },

  enqueueAccount: function(op, conta) {
    var payload;
    if (op === 'upsert') {
      payload = (typeof FINANCE_CONTRACT !== 'undefined')
        ? FINANCE_CONTRACT.contaPtToEn(conta)
        : conta;
      if (payload && conta.ativo === false) payload.active = false;
    }
    return SYNC_ENGINE._enqueue('account', op, conta, payload);
  },

  enqueueRecurring: function(op, rec) {
    var payload;
    if (op === 'upsert') {
      payload = (typeof FINANCE_CONTRACT !== 'undefined')
        ? FINANCE_CONTRACT.recorrentePtToEn(rec)
        : rec;
      if (payload && rec.ativo === false) payload.active = false;
    }
    return SYNC_ENGINE._enqueue('recurring', op, rec, payload);
  },

  enqueueBudget: function(op, budget) {
    var payload;
    if (op === 'upsert') {
      payload = (typeof FINANCE_CONTRACT !== 'undefined')
        ? FINANCE_CONTRACT.budgetPtToEn(budget)
        : budget;
      if (payload && budget.ativo === false) payload.active = false;
    }
    return SYNC_ENGINE._enqueue('budget', op, budget, payload);
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
      var pt2 = DADOS._txEnToPt(tx);
      pt2.updatedAt = tx.updatedAt || pt2.dataCriacao;
      pt2.deletedAt = tx.deletedAt || null;
      return pt2;
    }
    return tx;
  },

  _contaEnToPt: function(ac) {
    if (typeof FINANCE_CONTRACT !== 'undefined') {
      var pt = FINANCE_CONTRACT.contaEnToPt(ac);
      pt.updatedAt = ac.updatedAt || pt.dataCriacao;
      if (ac.active === false) pt.deletedAt = ac.updatedAt || pt.updatedAt;
      return pt;
    }
    return ac;
  },

  _recEnToPt: function(rec) {
    if (typeof FINANCE_CONTRACT !== 'undefined') {
      var pt = FINANCE_CONTRACT.recorrenteEnToPt(rec);
      pt.updatedAt = rec.updatedAt || pt.dataCriacao;
      if (rec.active === false) pt.deletedAt = rec.updatedAt || pt.updatedAt;
      return pt;
    }
    return rec;
  },

  _budgetEnToPt: function(budget) {
    if (typeof FINANCE_CONTRACT !== 'undefined') {
      var pt = FINANCE_CONTRACT.budgetEnToPt(budget);
      pt.updatedAt = budget.updatedAt || pt.definidoEm;
      if (budget.active === false) pt.deletedAt = budget.updatedAt || pt.updatedAt;
      return pt;
    }
    return budget;
  },

  _orcamentosToArray: function(orc) {
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

  _arrayToOrcamentos: function(list) {
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
  },

  scheduleFlush: function(delayMs) {
    var self = SYNC_ENGINE;
    if (SYNC_ENGINE._flushTimer) return;
    var delay = delayMs != null ? delayMs : 300;
    SYNC_ENGINE._flushTimer = setTimeout(function() {
      self._flushTimer = null;
      self.flush().catch(function(err) {
        // flush() já despacha SYNC_FALHAR em falha de rede; isto cobre throws inesperados.
        if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
          APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, {
            erro: (err && err.message) || 'flush-inesperado',
          });
        }
      });
    }, delay);
  },

  _nextBackoff: function(attempts) {
    var base = SYNC_ENGINE._backoffMs * Math.pow(2, Math.min(attempts || 0, 6));
    var jitter = Math.floor(Math.random() * 500);
    return Math.min(base + jitter, SYNC_ENGINE._backoffMax);
  },

  /**
   * Envia outbox ao servidor. Falha de rede mantém fila intacta.
   * @param {Function} [apiFetch] injetável para testes
   */
  flush: function(apiFetch) {
    var self = SYNC_ENGINE;
    if (SYNC_ENGINE._flushing) return Promise.resolve({ ok: false, reason: 'busy' });
    var fila = SYNC_ENGINE.loadOutbox();
    if (!fila.length) return Promise.resolve({ ok: true, flushed: 0 });

    var fetchFn = apiFetch || SYNC_ENGINE._defaultFetch();
    if (!fetchFn) return Promise.resolve({ ok: false, reason: 'no-api' });

    SYNC_ENGINE._flushing = true;
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

      // Reconcilia contra a outbox ATUAL, não contra o snapshot `fila`: uma
      // mutação enfileirada durante o POST em voo vive só no armazenamento, e
      // salvar o snapshot a apagaria — perda de um registro financeiro.
      var atual = self.loadOutbox();
      var remaining = SYNC_MERGE.outboxAckRemove(atual, results);
      // Re-enfileira rejeitados com backoff — a menos que uma edição concorrente
      // do mesmo registro já os tenha substituído na outbox atual.
      results.forEach(function(r) {
        if (r.action !== 'reject') return;
        var orig = fila.find(function(m) { return m.opId === r.opId; });
        if (!orig) return;
        var substituido = remaining.some(function(m) {
          return m.entity === orig.entity && m.id === orig.id;
        });
        if (substituido) return;
        orig.attempts = (orig.attempts || 0) + 1;
        remaining = SYNC_MERGE.outboxEnqueue(remaining, orig);
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
      // Mantém as mutações enfileiradas durante o POST em voo: opera sobre a
      // outbox atual, bumpando attempts só nas que foram tentadas agora.
      var atual = self.loadOutbox();
      var tentadas = {};
      fila.forEach(function(m) { tentadas[m.opId] = true; });
      atual.forEach(function(m) { if (tentadas[m.opId]) m.attempts = (m.attempts || 0) + 1; });
      self.saveOutbox(atual);
      if (typeof APP_STORE !== 'undefined' && APP_STORE && typeof ACTIONS !== 'undefined' && ACTIONS) {
        APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, { erro: err.message || 'rede' });
        APP_STORE.dispatch(ACTIONS.SYNC_PENDENTE, { count: atual.length });
      }
      self.scheduleFlush(self._nextBackoff(atual[0] && atual[0].attempts));
      return { ok: false, reason: err.message || 'rede' };
    }).finally(function() {
      self._flushing = false;
    });
  },

  /**
   * Pull incremental e merge seguro no cache local de transações.
   */
  pull: function(apiFetch) {
    var self = SYNC_ENGINE;
    var fetchFn = apiFetch || SYNC_ENGINE._defaultFetch();
    if (!fetchFn) return Promise.resolve({ ok: false, reason: 'no-api' });

    var since = SYNC_ENGINE.getCursor();
    var qs = since ? ('?since=' + encodeURIComponent(since)) : '';

    return fetchFn('/api/v1/sync' + qs).then(function(resp) {
      var data = resp && resp.data ? resp.data : {};
      var delta = Array.isArray(data.transactions) ? data.transactions : [];
      var merged = self._applyDeltaToLocal(delta);
      self._applyAccountsDelta(Array.isArray(data.accounts) ? data.accounts : []);
      self._applyRecurringDelta(Array.isArray(data.recurringTransactions) ? data.recurringTransactions : []);
      self._applyBudgetsDelta(Array.isArray(data.budgets) ? data.budgets : []);
      if (data.cursor) self.setCursor(data.cursor);
      return { ok: true, delta: delta.length, merged: merged };
    });
  },

  _applyDeltaToLocal: function(deltaEn) {
    if (typeof DADOS === 'undefined') return 0;
    var local = DADOS.getTransacoesRaw ? DADOS.getTransacoesRaw() : DADOS.getTransacoes();
    var pending = SYNC_ENGINE.pendingIds('transaction');
    var deltaPt = deltaEn.map(SYNC_ENGINE._txEnToPt);
    var merged = SYNC_MERGE.mergeDelta(local, pending, deltaPt);
    DADOS._storageSetTransacoes(merged);
    return merged.length;
  },

  _applyAccountsDelta: function(deltaEn) {
    if (typeof DADOS === 'undefined' || !DADOS.getContasRaw) return 0;
    var local = DADOS.getContasRaw();
    var pending = SYNC_ENGINE.pendingIds('account');
    var deltaPt = deltaEn.map(SYNC_ENGINE._contaEnToPt);
    var merged = SYNC_MERGE.mergeDelta(local, pending, deltaPt);
    var visiveis = merged.filter(function(c) { return !c.deletedAt && c.ativo !== false; });
    DADOS._storageSetRaw(
      (typeof CONFIG !== 'undefined' && CONFIG.STORAGE_CONTAS) || 'fp-contas',
      JSON.stringify(visiveis),
    );
    return visiveis.length;
  },

  _applyRecurringDelta: function(deltaEn) {
    if (typeof DADOS === 'undefined') return 0;
    var config = DADOS.getConfig();
    var local = Array.isArray(config.recorrentes) ? config.recorrentes : [];
    var pending = SYNC_ENGINE.pendingIds('recurring');
    var deltaPt = deltaEn.map(SYNC_ENGINE._recEnToPt);
    var merged = SYNC_MERGE.mergeDelta(local, pending, deltaPt);
    var visiveis = merged.filter(function(r) { return !r.deletedAt && r.ativo !== false; });
    config.recorrentes = visiveis;
    DADOS.salvarConfig(config, { skipPush: true });
    return visiveis.length;
  },

  _applyBudgetsDelta: function(deltaEn) {
    if (typeof DADOS === 'undefined') return 0;
    var config = DADOS.getConfig();
    var local = SYNC_ENGINE._orcamentosToArray(config.orcamentos || {});
    var pending = SYNC_ENGINE.pendingIds('budget');
    var deltaPt = deltaEn.map(SYNC_ENGINE._budgetEnToPt);
    var merged = SYNC_MERGE.mergeDelta(local, pending, deltaPt);
    // mergeDelta chaveia por id e descarta locais SEM id. Orçamentos legados
    // (criados antes de o app atribuir id) somem no primeiro sync v2 — até com
    // delta vazio. Reanexa os locais sem id cuja categoria o delta não cobre;
    // se o servidor mandou a mesma categoria (com id), o dele prevalece.
    var cobertas = {};
    merged.forEach(function(b) { if (b && b.categoria) cobertas[b.categoria] = true; });
    local.forEach(function(b) {
      if (b && b.id == null && b.categoria && !cobertas[b.categoria]) merged.push(b);
    });
    config.orcamentos = SYNC_ENGINE._arrayToOrcamentos(merged);
    DADOS.salvarConfig(config, { skipPush: true });
    if (typeof ORCAMENTO !== 'undefined' && ORCAMENTO._carregarOrcamentos) {
      ORCAMENTO._carregarOrcamentos();
    }
    return Object.keys(config.orcamentos).length;
  },

  /**
   * Bootstrap seguro: merge snapshot /state sem full-replace (fallback 1ª sync).
   */
  bootstrapFromSnapshot: function(snapshot) {
    if (!snapshot || !Array.isArray(snapshot.transactions) || !snapshot.transactions.length) return;
    var deltaEn = snapshot.transactions.map(function(tx) {
      return Object.assign({}, tx, { updatedAt: tx.updatedAt || tx.createdAt });
    });
    SYNC_ENGINE._applyDeltaToLocal(deltaEn);
    if (snapshot.meta && snapshot.meta.syncedAt) {
      SYNC_ENGINE.setCursor(snapshot.meta.syncedAt);
    }
  },

  /**
   * Pull incremental paginado até esgotar o delta.
   * @param {Function} [apiFetch]
   * @param {string} [since] ISO — default: cursor local
   */
  pullAll: function(apiFetch, since) {
    var self = SYNC_ENGINE;
    var fetchFn = apiFetch || SYNC_ENGINE._defaultFetch();
    if (!fetchFn) return Promise.resolve({ ok: false, reason: 'no-api' });

    var baseSince = since != null ? since : SYNC_ENGINE.getCursor();
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
        self._applyAccountsDelta(Array.isArray(data.accounts) ? data.accounts : []);
        self._applyRecurringDelta(Array.isArray(data.recurringTransactions) ? data.recurringTransactions : []);
        self._applyBudgetsDelta(Array.isArray(data.budgets) ? data.budgets : []);
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
    var self = SYNC_ENGINE;
    var fetchFn = apiFetch || SYNC_ENGINE._defaultFetch();
    return SYNC_ENGINE.pullAll(fetchFn).then(function() {
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
    if (SYNC_ENGINE._flushTimer) clearTimeout(SYNC_ENGINE._flushTimer);
    SYNC_ENGINE._flushTimer = null;
    SYNC_ENGINE._flushing = false;
    SYNC_ENGINE._backoffMs = 1000;
  },
};

export { SYNC_ENGINE };
export default SYNC_ENGINE;
