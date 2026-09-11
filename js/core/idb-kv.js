/**
 * idb-kv.js — armazenamento chave-valor em IndexedDB (substituto do localStorage
 * para blobs grandes, ex.: fp-transacoes).
 */
var IDB_KV = {
  DB_NAME: 'financaspro-kv',
  DB_VERSION: 1,
  STORE: 'kv',
  _db: null,

  isReady: function() {
    return !!this._db;
  },

  init: function() {
    var self = this;
    if (typeof indexedDB === 'undefined') return Promise.resolve(false);
    if (this._db) return Promise.resolve(true);
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
    var self = this;
    return this.init().then(function(ok) {
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
    var self = this;
    return this.init().then(function(ok) {
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
    var self = this;
    return this.init().then(function(ok) {
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
