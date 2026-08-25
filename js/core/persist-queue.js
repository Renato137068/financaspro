/**
 * persist-queue.js — fila local de lançamentos com idempotência e estados.
 *
 * Garante: um lançamento só é anunciado como "Salvo" depois da gravação no
 * storage (incluindo cifração at-rest). Clique rápido enfileira; não perde.
 *
 * Estados: pending | saving | saved | failed
 */
var PERSIST_QUEUE = (function() {
  var STORAGE_KEY = 'fp-persist-queue';
  var items = [];
  var processing = false;
  var listeners = [];

  function agora() {
    try { return new Date().toISOString(); } catch (e) { return String(Date.now()); }
  }

  function novoClientKey() {
    if (typeof UTILS !== 'undefined' && UTILS.gerarUuid) return UTILS.gerarUuid();
    if (typeof UTILS !== 'undefined' && UTILS.gerarId) return 'ck-' + UTILS.gerarId();
    return 'ck-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function persistirFila() {
    try {
      var slim = items.map(function(it) {
        return {
          clientKey: it.clientKey,
          status: it.status,
          payload: it.payload,
          txId: it.txId || null,
          error: it.error || null,
          createdAt: it.createdAt,
          updatedAt: it.updatedAt
        };
      }).filter(function(it) {
        return it.status === 'pending' || it.status === 'saving' || it.status === 'failed';
      });
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
    } catch (e) { /* sessionStorage indisponível não pode derrubar o app */ }
  }

  function carregarFila() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return;
      parsed.forEach(function(it) {
        if (!it || !it.clientKey || !it.payload) return;
        if (items.some(function(x) { return x.clientKey === it.clientKey; })) return;
        if (it.status === 'saving') it.status = 'pending';
        items.push(it);
      });
    } catch (e) { /* noop */ }
  }

  function emitir() {
    var snap = getSnapshot();
    listeners.forEach(function(fn) {
      try { fn(snap); } catch (e) { /* noop */ }
    });
    if (typeof document !== 'undefined') {
      try {
        document.dispatchEvent(new CustomEvent('fp:persist-queue', { detail: snap }));
      } catch (e2) { /* noop */ }
    }
  }

  function getSnapshot() {
    var byStatus = { pending: 0, saving: 0, saved: 0, failed: 0 };
    items.forEach(function(it) {
      byStatus[it.status] = (byStatus[it.status] || 0) + 1;
    });
    return {
      total: items.length,
      pending: byStatus.pending,
      saving: byStatus.saving,
      saved: byStatus.saved,
      failed: byStatus.failed,
      idle: !processing && byStatus.pending === 0 && byStatus.saving === 0,
      items: items.slice()
    };
  }

  function encontrarPorClientKey(clientKey) {
    for (var i = 0; i < items.length; i++) {
      if (items[i].clientKey === clientKey) return items[i];
    }
    return null;
  }

  function txJaExiste(clientKey) {
    if (!clientKey || typeof DADOS === 'undefined' || !DADOS.getTransacoesRaw) return null;
    try {
      var lista = DADOS.getTransacoesRaw() || [];
      for (var i = 0; i < lista.length; i++) {
        if (lista[i] && lista[i].clientKey === clientKey && !lista[i].deletedAt) {
          return lista[i];
        }
      }
    } catch (e) { /* noop */ }
    return null;
  }

  function gravarPayload(payload, clientKey) {
    var existente = txJaExiste(clientKey);
    if (existente) return existente;

    var tx = typeof TRANSACOES !== 'undefined' && TRANSACOES.criar
      ? TRANSACOES.criar(
        payload.tipo,
        payload.valor,
        payload.categoria,
        payload.data,
        payload.descricao,
        payload.banco,
        payload.cartao,
        { clientKey: clientKey }
      )
      : null;

    if (!tx) throw new Error('TRANSACOES.criar indisponível');

    if (tx.clientKey !== clientKey) {
      tx.clientKey = clientKey;
      if (typeof DADOS !== 'undefined' && DADOS.salvarTransacao) {
        DADOS.salvarTransacao(tx);
      }
    }
    return tx;
  }

  function aguardarDisco() {
    if (typeof DADOS !== 'undefined' && typeof DADOS.aguardarDisco === 'function') {
      return DADOS.aguardarDisco();
    }
    return Promise.resolve(true);
  }

  function processarProximo() {
    if (processing) return;
    var next = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].status === 'pending') { next = items[i]; break; }
    }
    if (!next) {
      emitir();
      return;
    }

    processing = true;
    next.status = 'saving';
    next.updatedAt = agora();
    persistirFila();
    emitir();

    Promise.resolve()
      .then(function() {
        return gravarPayload(next.payload, next.clientKey);
      })
      .then(function(tx) {
        next.txId = tx && tx.id;
        return aguardarDisco().then(function() { return tx; });
      })
      .then(function(tx) {
        // Confirma que o clientKey está no storage (anti-perda silenciosa).
        var conf = txJaExiste(next.clientKey);
        if (!conf) throw new Error('Gravação não confirmada no storage');
        next.status = 'saved';
        next.error = null;
        next.updatedAt = agora();
        next.txId = conf.id;
        persistirFila();
        processing = false;
        emitir();
        processarProximo();
      })
      .catch(function(err) {
        next.status = 'failed';
        next.error = (err && err.message) ? String(err.message) : String(err);
        next.updatedAt = agora();
        persistirFila();
        processing = false;
        emitir();
        if (typeof OBS !== 'undefined' && OBS.captureError) {
          OBS.captureError(err, { contexto: 'PERSIST_QUEUE' });
        }
        // Continua a fila — não bloqueia os demais por um item falho.
        processarProximo();
      });
  }

  /**
   * Enfileira um lançamento. Resolve só quando status === saved.
   * Rejeita se falhar (permite retry do mesmo clientKey).
   */
  function enqueueLancamento(payload, opts) {
    opts = opts || {};
    if (!payload || !payload.tipo || !payload.valor || !payload.data) {
      return Promise.reject(new Error('Payload de lançamento inválido'));
    }

    var clientKey = opts.clientKey || payload.clientKey || novoClientKey();
    var existente = encontrarPorClientKey(clientKey);
    if (existente && existente.status === 'saved') {
      return Promise.resolve(existente);
    }
    if (existente && (existente.status === 'pending' || existente.status === 'saving')) {
      return waitForKey(clientKey);
    }

    var jaNoDisco = txJaExiste(clientKey);
    if (jaNoDisco) {
      var done = {
        clientKey: clientKey,
        status: 'saved',
        payload: payload,
        txId: jaNoDisco.id,
        error: null,
        createdAt: agora(),
        updatedAt: agora()
      };
      items.push(done);
      persistirFila();
      emitir();
      return Promise.resolve(done);
    }

    var item = existente || {
      clientKey: clientKey,
      status: 'pending',
      payload: {
        tipo: payload.tipo,
        valor: payload.valor,
        categoria: payload.categoria,
        data: payload.data,
        descricao: payload.descricao || '',
        banco: payload.banco || '',
        cartao: payload.cartao || ''
      },
      txId: null,
      error: null,
      createdAt: agora(),
      updatedAt: agora()
    };
    if (existente) {
      item.status = 'pending';
      item.error = null;
      item.payload = {
        tipo: payload.tipo,
        valor: payload.valor,
        categoria: payload.categoria,
        data: payload.data,
        descricao: payload.descricao || '',
        banco: payload.banco || '',
        cartao: payload.cartao || ''
      };
      item.updatedAt = agora();
    } else {
      items.push(item);
    }
    persistirFila();
    emitir();
    processarProximo();
    return waitForKey(clientKey);
  }

  function waitForKey(clientKey) {
    return new Promise(function(resolve, reject) {
      function check() {
        var it = encontrarPorClientKey(clientKey);
        if (!it) {
          reject(new Error('Item sumiu da fila'));
          return true;
        }
        if (it.status === 'saved') {
          resolve(it);
          return true;
        }
        if (it.status === 'failed') {
          reject(new Error(it.error || 'Falha ao persistir lançamento'));
          return true;
        }
        return false;
      }
      if (check()) return;
      var off = onChange(function() {
        if (check()) off();
      });
    });
  }

  function onChange(fn) {
    listeners.push(fn);
    return function() {
      listeners = listeners.filter(function(f) { return f !== fn; });
    };
  }

  function retryFailed() {
    var n = 0;
    items.forEach(function(it) {
      if (it.status === 'failed') {
        it.status = 'pending';
        it.error = null;
        it.updatedAt = agora();
        n++;
      }
    });
    persistirFila();
    emitir();
    processarProximo();
    return n;
  }

  function retryClientKey(clientKey) {
    var it = encontrarPorClientKey(clientKey);
    if (!it || it.status !== 'failed') return Promise.reject(new Error('Nada para retentar'));
    it.status = 'pending';
    it.error = null;
    it.updatedAt = agora();
    persistirFila();
    emitir();
    processarProximo();
    return waitForKey(clientKey);
  }

  function recover() {
    carregarFila();
    items.forEach(function(it) {
      if (it.status === 'saving') it.status = 'pending';
      if (it.status === 'pending' || it.status === 'failed') {
        var disco = txJaExiste(it.clientKey);
        if (disco) {
          it.status = 'saved';
          it.txId = disco.id;
          it.error = null;
        }
      }
    });
    persistirFila();
    emitir();
    processarProximo();
  }

  function isIdle() {
    return getSnapshot().idle;
  }

  function pendingOrFailed() {
    return items.filter(function(it) {
      return it.status === 'pending' || it.status === 'saving' || it.status === 'failed';
    });
  }

  // Boot recovery (browser)
  if (typeof window !== 'undefined') {
    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          setTimeout(recover, 0);
        });
      } else {
        setTimeout(recover, 0);
      }
    } catch (e) { /* noop */ }
  }

  return {
    enqueueLancamento: enqueueLancamento,
    getSnapshot: getSnapshot,
    onChange: onChange,
    retryFailed: retryFailed,
    retryClientKey: retryClientKey,
    recover: recover,
    isIdle: isIdle,
    pendingOrFailed: pendingOrFailed,
    novoClientKey: novoClientKey,
    _items: items,
    _resetForTests: function() {
      items.length = 0;
      processing = false;
      try { sessionStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
    }
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PERSIST_QUEUE;
}
