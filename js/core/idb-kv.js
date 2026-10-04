/**
 * idb-kv.js — armazenamento chave-valor em IndexedDB (substituto do localStorage
 * para blobs grandes, ex.: fp-transacoes).
 *
 * ES Module (ADR 0005): os scripts clássicos o recebem como global por
 * js/esm/ponte.js.
 */
const IDB_KV = {
  DB_NAME: 'financaspro-kv',
  DB_VERSION: 1,
  STORE: 'kv',
  _db: null,

  isReady: function() {
    return !!IDB_KV._db;
  },

  init: function() {
    var self = IDB_KV;
    if (typeof indexedDB === 'undefined') return Promise.resolve(false);
    if (IDB_KV._db) return Promise.resolve(true);
    return new Promise(function(resolve) {
      var req = indexedDB.open(self.DB_NAME, self.DB_VERSION);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(self.STORE)) {
          db.createObjectStore(self.STORE);
        }
      };
      req.onsuccess = function(e) {
        self._db = e.target.result;
        resolve(true);
      };
      req.onerror = function() {
        console.warn('[IDB_KV] IndexedDB indisponível');
        resolve(false);
      };
    });
  },

  get: function(key) {
    var self = IDB_KV;
    return IDB_KV.init().then(function(ok) {
      if (!ok || !self._db) return null;
      return new Promise(function(resolve) {
        var tx = self._db.transaction(self.STORE, 'readonly');
        var req = tx.objectStore(self.STORE).get(key);
        req.onsuccess = function() { resolve(req.result == null ? null : String(req.result)); };
        req.onerror = function() { resolve(null); };
      });
    });
  },

  set: function(key, value) {
    var self = IDB_KV;
    return IDB_KV.init().then(function(ok) {
      if (!ok || !self._db) return false;
      return new Promise(function(resolve) {
        var tx = self._db.transaction(self.STORE, 'readwrite');
        tx.objectStore(self.STORE).put(value, key);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { resolve(false); };
      });
    });
  },

  remove: function(key) {
    var self = IDB_KV;
    return IDB_KV.init().then(function(ok) {
      if (!ok || !self._db) return false;
      return new Promise(function(resolve) {
        var tx = self._db.transaction(self.STORE, 'readwrite');
        tx.objectStore(self.STORE).delete(key);
        tx.oncomplete = function() { resolve(true); };
        tx.onerror = function() { resolve(false); };
      });
    });
  }
};

export { IDB_KV };
export default IDB_KV;
