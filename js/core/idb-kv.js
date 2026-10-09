/**
 * idb-kv.js — armazenamento chave-valor em IndexedDB (substituto do localStorage
 * para blobs grandes, ex.: fp-transacoes).
 *
 * Toda operação termina: set() resolve false quando o banco recusa a gravação
 * (cota cheia aborta a transação sem disparar `error`, só `abort`) e quando a
 * conexão foi fechada pelo sistema (WebView do Android em segundo plano,
 * outra aba atualizando o banco). Antes, nesses casos a promessa nunca
 * resolvia ou rejeitava fora do contrato, e quem gravava achava que tinha
 * gravado. O motivo da última falha fica em IDB_KV.ultimoErro.
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */
const IDB_KV = {
  DB_NAME: 'financaspro-kv',
  DB_VERSION: 1,
  STORE: 'kv',
  _db: null,
  /** Erro da última operação que falhou (null depois de uma que deu certo). */
  ultimoErro: null,

  isReady: function() {
    return !!IDB_KV._db;
  },

  /** Esquece a conexão atual; a próxima operação abre outra. */
  _descartarConexao: function() {
    var db = IDB_KV._db;
    IDB_KV._db = null;
    if (db) { try { db.close(); } catch (e) { /* já fechada */ } }
  },

  init: function() {
    var self = IDB_KV;
    if (typeof indexedDB === 'undefined') return Promise.resolve(false);
    if (IDB_KV._db) return Promise.resolve(true);
    return new Promise(function(resolve) {
      var req;
      try {
        req = indexedDB.open(self.DB_NAME, self.DB_VERSION);
      } catch (e) {
        self.ultimoErro = e;
        resolve(false);
        return;
      }
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(self.STORE)) {
          db.createObjectStore(self.STORE);
        }
      };
      req.onsuccess = function(e) {
        var db = e.target.result;
        // Outra aba (ou o "Apagar dados") quer mudar/apagar o banco: solta a
        // conexão para não travá-la; a próxima operação reabre.
        db.onversionchange = function() { if (self._db === db) self._descartarConexao(); };
        db.onclose = function() { if (self._db === db) self._db = null; };
        self._db = db;
        resolve(true);
      };
      req.onerror = function() {
        self.ultimoErro = req.error || null;
        console.warn('[IDB_KV] IndexedDB indisponível');
        resolve(false);
      };
    });
  },

  /**
   * Abre uma transação e entrega a store e a transação a `fn`, que devolve a
   * promessa do resultado (os ouvintes são presos na hora, antes de qualquer
   * evento). Se a conexão tinha sido fechada (InvalidStateError), reabre uma
   * vez e tenta de novo. Sem banco: devolve `semBanco`.
   */
  _comTransacao: function(modo, fn, semBanco, tentativa) {
    var self = IDB_KV;
    return IDB_KV.init().then(function(ok) {
      if (!ok || !self._db) return semBanco;
      var tx;
      try {
        tx = self._db.transaction(self.STORE, modo);
      } catch (e) {
        self.ultimoErro = e;
        self._descartarConexao();
        return tentativa ? semBanco : self._comTransacao(modo, fn, semBanco, 1);
      }
      return fn(tx.objectStore(self.STORE), tx);
    });
  },

  get: function(key) {
    var self = IDB_KV;
    return IDB_KV._comTransacao('readonly', function(store, tx) {
      return new Promise(function(resolve) {
        var req = store.get(key);
        req.onsuccess = function() { resolve(req.result == null ? null : String(req.result)); };
        req.onerror = function() { self.ultimoErro = req.error || null; resolve(null); };
        tx.onabort = function() { self.ultimoErro = tx.error || null; resolve(null); };
      });
    }, null);
  },

  /** @returns {Promise<boolean>} true só depois de o banco confirmar a gravação. */
  set: function(key, value) {
    return IDB_KV._gravar(function(store) { store.put(value, key); });
  },

  /** @returns {Promise<boolean>} */
  remove: function(key) {
    return IDB_KV._gravar(function(store) { store.delete(key); });
  },

  _gravar: function(op) {
    var self = IDB_KV;
    return IDB_KV._comTransacao('readwrite', function(store, tx) {
      return new Promise(function(resolve) {
        tx.oncomplete = function() { self.ultimoErro = null; resolve(true); };
        // `error` e `abort` podem vir os dois; resolver duas vezes não faz nada.
        tx.onerror = function() { self.ultimoErro = tx.error || null; resolve(false); };
        tx.onabort = function() { self.ultimoErro = tx.error || null; resolve(false); };
        try {
          op(store);
        } catch (e) {
          self.ultimoErro = e;
          try { tx.abort(); } catch (e2) { /* já terminou */ }
          resolve(false);
        }
      });
    }, false);
  }
};

export { IDB_KV };
export default IDB_KV;
