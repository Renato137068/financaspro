/**
 * anexos.js — Armazenamento de comprovantes em IndexedDB
 */
const ANEXOS = {
  DB_NAME: 'financaspro-anexos',
  DB_VERSION: 1,
  STORE: 'anexos',
  MAX_BYTES: 2 * 1024 * 1024,
  MAX_POR_TX: 3,
  MIME_PERMITIDOS: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'],

  _db: null,

  init: function() {
    var self = this;
    if (typeof indexedDB === 'undefined') return Promise.resolve(false);
    if (this._db) return Promise.resolve(true);
    return new Promise(function(resolve) {
      var req = indexedDB.open(self.DB_NAME, self.DB_VERSION);
      req.onupgradeneeded = function(e) {
        var db = e.target.result;
        if (!db.objectStoreNames.contains(self.STORE)) {
          var store = db.createObjectStore(self.STORE, { keyPath: 'id' });
          store.createIndex('transacaoId', 'transacaoId', { unique: false });
        }
      };
      req.onsuccess = function(e) {
        self._db = e.target.result;
        resolve(true);
      };
      req.onerror = function() {
        console.warn('[ANEXOS] IndexedDB indisponível');
        resolve(false);
      };
    });
  },

  _dbReady: function() {
    var self = this;
    if (this._db) return Promise.resolve(this._db);
    return this.init().then(function() { return self._db; });
  },

  validarArquivo: function(file) {
    if (!file) return { valido: false, erro: 'Arquivo inválido' };
    if (this.MIME_PERMITIDOS.indexOf(file.type) === -1) {
      return { valido: false, erro: 'Use imagem (JPG, PNG, WebP) ou PDF' };
    }
    if (file.size > this.MAX_BYTES) {
      return { valido: false, erro: 'Arquivo muito grande (máx. 2 MB)' };
    }
    return { valido: true };
  },

  listarMeta: function(transacaoId) {
    return this._dbReady().then(function(db) {
      if (!db) return [];
      return new Promise(function(resolve) {
        var tx = db.transaction(ANEXOS.STORE, 'readonly');
        var store = tx.objectStore(ANEXOS.STORE);
        var idx = store.index('transacaoId');
        var req = idx.getAll(transacaoId);
        req.onsuccess = function() {
          var lista = (req.result || []).map(function(a) {
            return {
              id: a.id,
              transacaoId: a.transacaoId,
              nome: a.nome,
              mimeType: a.mimeType,
              tamanho: a.tamanho,
              criadoEm: a.criadoEm
            };
          });
          resolve(lista);
        };
        req.onerror = function() { resolve([]); };
      });
    });
  },

  salvar: function(transacaoId, file) {
    var validacao = this.validarArquivo(file);
    if (!validacao.valido) return Promise.reject(new Error(validacao.erro));

    var self = this;
    return this.listarMeta(transacaoId).then(function(existentes) {
      if (existentes.length >= self.MAX_POR_TX) {
        throw new Error('Máximo de ' + self.MAX_POR_TX + ' anexos por transação');
      }
      return self._dbReady();
    }).then(function(db) {
      if (!db) throw new Error('Armazenamento de anexos indisponível');
      return new Promise(function(resolve, reject) {
        var reader = new FileReader();
        reader.onload = function(e) {
          var registro = {
            id: UTILS.gerarId(),
            transacaoId: transacaoId,
            nome: file.name || 'anexo',
            mimeType: file.type,
            tamanho: file.size,
            criadoEm: new Date().toISOString(),
            blob: e.target.result
          };
          var tx = db.transaction(ANEXOS.STORE, 'readwrite');
          tx.objectStore(ANEXOS.STORE).put(registro);
          tx.oncomplete = function() {
            self._atualizarContagem(transacaoId).then(function() {
              resolve({
                id: registro.id,
                transacaoId: registro.transacaoId,
                nome: registro.nome,
                mimeType: registro.mimeType,
                tamanho: registro.tamanho,
                criadoEm: registro.criadoEm
              });
            });
          };
          tx.onerror = function() { reject(new Error('Falha ao salvar anexo')); };
        };
        reader.onerror = function() { reject(new Error('Falha ao ler arquivo')); };
        reader.readAsArrayBuffer(file);
      });
    });
  },

  obter: function(id) {
    return this._dbReady().then(function(db) {
      if (!db) return null;
      return new Promise(function(resolve) {
        var tx = db.transaction(ANEXOS.STORE, 'readonly');
        var req = tx.objectStore(ANEXOS.STORE).get(id);
        req.onsuccess = function() { resolve(req.result || null); };
        req.onerror = function() { resolve(null); };
      });
    });
  },

  excluir: function(id) {
    var self = this;
    return this.obter(id).then(function(reg) {
      if (!reg) return;
      return self._dbReady().then(function(db) {
        if (!db) return;
        return new Promise(function(resolve) {
          var tx = db.transaction(ANEXOS.STORE, 'readwrite');
          tx.objectStore(ANEXOS.STORE).delete(id);
          tx.oncomplete = function() {
            self._atualizarContagem(reg.transacaoId).then(resolve);
          };
        });
      });
    });
  },

  excluirPorTransacao: function(transacaoId) {
    var self = this;
    return this.listarMeta(transacaoId).then(function(lista) {
      if (!lista.length) return;
      return self._dbReady().then(function(db) {
        if (!db) return;
        return new Promise(function(resolve) {
          var tx = db.transaction(ANEXOS.STORE, 'readwrite');
          var store = tx.objectStore(ANEXOS.STORE);
          lista.forEach(function(a) { store.delete(a.id); });
          tx.oncomplete = resolve;
        });
      });
    });
  },

  _atualizarContagem: function(transacaoId) {
    return this.listarMeta(transacaoId).then(function(lista) {
      if (typeof TRANSACOES === 'undefined') return lista.length;
      var tx = TRANSACOES.obterPorId(transacaoId);
      if (tx) {
        TRANSACOES.atualizar(transacaoId, { anexoCount: lista.length });
      }
      return lista.length;
    });
  },

  _arrayBufferToBase64: function(buffer) {
    if (!buffer) return '';
    var bytes = new Uint8Array(buffer);
    var binary = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
  },

  _base64ToArrayBuffer: function(b64) {
    if (!b64) return new ArrayBuffer(0);
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  },

  exportarTodos: function() {
    return this._dbReady().then(function(db) {
      if (!db) return [];
      return new Promise(function(resolve) {
        var tx = db.transaction(ANEXOS.STORE, 'readonly');
        var req = tx.objectStore(ANEXOS.STORE).getAll();
        req.onsuccess = function() {
          var lista = (req.result || []).map(function(a) {
            return {
              id: a.id,
              transacaoId: a.transacaoId,
              nome: a.nome,
              mimeType: a.mimeType,
              tamanho: a.tamanho,
              criadoEm: a.criadoEm,
              dadosBase64: ANEXOS._arrayBufferToBase64(a.blob)
            };
          });
          resolve(lista);
        };
        req.onerror = function() { resolve([]); };
      });
    });
  },

  importarTodos: function(lista) {
    var self = this;
    lista = lista || [];
    return this._dbReady().then(function(db) {
      if (!db) throw new Error('Armazenamento de anexos indisponível');
      return new Promise(function(resolve, reject) {
        var tx = db.transaction(ANEXOS.STORE, 'readwrite');
        var store = tx.objectStore(ANEXOS.STORE);
        store.clear();
        lista.forEach(function(item) {
          if (!item || !item.transacaoId || !item.dadosBase64) return;
          store.put({
            id: item.id || UTILS.gerarId(),
            transacaoId: item.transacaoId,
            nome: item.nome || 'anexo',
            mimeType: item.mimeType || 'application/octet-stream',
            tamanho: item.tamanho || 0,
            criadoEm: item.criadoEm || new Date().toISOString(),
            blob: self._base64ToArrayBuffer(item.dadosBase64)
          });
        });
        tx.oncomplete = function() {
          var porTx = {};
          lista.forEach(function(a) {
            if (a && a.transacaoId) porTx[a.transacaoId] = true;
          });
          var ids = Object.keys(porTx);
          if (!ids.length) { resolve(lista.length); return; }
          var chain = Promise.resolve();
          ids.forEach(function(tid) {
            chain = chain.then(function() { return self._atualizarContagem(tid); });
          });
          chain.then(function() { resolve(lista.length); });
        };
        tx.onerror = function() { reject(new Error('Falha ao importar anexos')); };
      });
    });
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ANEXOS;
}
