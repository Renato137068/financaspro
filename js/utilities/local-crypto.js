/**
 * local-crypto.js — criptografia opcional at-rest no localStorage (Web Crypto)
 */
var LOCAL_CRYPTO = {
  _keyPromise: null,

  // Flag de cifragem at-rest guardado numa chave PLANA, FORA do prefixo 'fp-'.
  // Motivo duplo:
  //  1) Quebra a dependência circular: DADOS._storageGetRaw()/_storageSetRaw()
  //     chamam isEnabled() para decidir se (de)cifram; se isEnabled() lesse o
  //     flag via DADOS.getConfig() (que passa por _storageGetRaw), formava o
  //     ciclo getConfig → _storageGetRaw → isEnabled → getConfig → … que
  //     estourava a pilha. Lendo direto do localStorage, não há ciclo.
  //  2) O flag PRECISA ser legível sem decifrar — não pode morar dentro do
  //     próprio blob cifrado (fp-config), senão seria impossível saber que a
  //     config está cifrada antes de decifrá-la.
  _ENABLED_KEY: 'financaspro_crypto_enabled',

  /**
   * Detecta se um valor de storage já está cifrado (qualquer versão suportada
   * pelo decrypt: enc1 legado, enc2 atual). Fonte única de verdade do prefixo —
   * o caminho de leitura (DADOS._storageGetRaw) usa isto para decidir decifrar.
   */
  isEncrypted: function(value) {
    return typeof value === 'string'
      && (value.indexOf('enc1:') === 0 || value.indexOf('enc2:') === 0);
  },

  /** Indica se a cifragem at-rest está ligada (flag plano + suporte a WebCrypto). */
  isEnabled: function() {
    try {
      return localStorage.getItem(this._ENABLED_KEY) === '1'
        && typeof crypto !== 'undefined' && !!crypto.subtle;
    } catch (e) {
      return false;
    }
  },

  /**
   * Liga/desliga a cifragem at-rest (grava o flag na chave plana).
   * A partir de ON, novas gravações de chaves 'fp-' são cifradas e leituras
   * decifram; dados já em texto puro seguem legíveis (unwrap sem prefixo
   * 'enc1:' retorna como está) e passam a ser cifrados conforme reescritos.
   * @param {boolean} on
   * @returns {boolean} estado efetivo após a mudança
   */
  setEnabled: function(on) {
    try {
      if (on) localStorage.setItem(this._ENABLED_KEY, '1');
      else localStorage.removeItem(this._ENABLED_KEY);
    } catch (e) { /* storage indisponível — mantém desligado */ }
    return this.isEnabled();
  },

  // Material de chave guardado FORA do prefixo 'fp-' para não ser cifrado pela
  // própria camada de storage (evita dependência circular) e para NÃO derivar a
  // chave de PII (nome). Se o usuário definir cryptoPassphrase, a proteção passa
  // a depender de um segredo que não fica no localStorage.
  _SALT_KEY: 'financaspro_ckey_salt',
  _DEV_KEY:  'financaspro_ckey_dev',

  _randHex: function(n) {
    var a = crypto.getRandomValues(new Uint8Array(n));
    return Array.from(a).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
  },

  _hexToBytes: function(h) {
    return new Uint8Array(h.match(/.{2}/g).map(function(x) { return parseInt(x, 16); }));
  },

  _material: function() {
    var salt = null, dev = null;
    try {
      salt = localStorage.getItem(this._SALT_KEY);
      if (!salt) { salt = this._randHex(16); localStorage.setItem(this._SALT_KEY, salt); }
      dev = localStorage.getItem(this._DEV_KEY);
      if (!dev) { dev = this._randHex(32); localStorage.setItem(this._DEV_KEY, dev); }
    } catch (e) { /* storage indisponível */ }
    var cfg = typeof DADOS !== 'undefined' ? DADOS.getConfig() : {};
    // Passphrase real do usuário tem prioridade; senão, segredo aleatório do
    // device (nunca o nome). Salt aleatório por instalação.
    return {
      passphrase: cfg.cryptoPassphrase || dev || 'financaspro-fallback',
      saltHex: salt || 'financaspro-fallback-salt',
    };
  },

  // Chave AES-GCM derivada via PBKDF2-SHA256 (100k iterações) — formato 'enc2'.
  _deriveKey: function() {
    var self = this;
    var m = this._material();
    var matId = m.passphrase + '|' + m.saltHex;
    if (this._keyPromise && this._keyMat === matId) return this._keyPromise;
    this._keyMat = matId;
    this._keyPromise = crypto.subtle.importKey(
      'raw', new TextEncoder().encode(m.passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
    ).then(function(base) {
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: self._hexToBytes(m.saltHex), iterations: 100000, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
    });
    return this._keyPromise;
  },

  // Chave legada (SHA-256 do passphrase antigo) — SÓ para decifrar dados 'enc1'.
  _deriveLegacyKey: function() {
    if (this._legacyKeyPromise) return this._legacyKeyPromise;
    var cfg = typeof DADOS !== 'undefined' ? DADOS.getConfig() : {};
    var base = (cfg.cryptoPassphrase || cfg.nome || 'financaspro') + '|' + (cfg._deviceId || 'local');
    this._legacyKeyPromise = crypto.subtle.digest('SHA-256', new TextEncoder().encode(base))
      .then(function(raw) {
        return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
      });
    return this._legacyKeyPromise;
  },

  encrypt: function(plain) {
    if (!this.isEnabled()) return Promise.resolve(plain);
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return this._deriveKey().then(function(key) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(plain));
    }).then(function(cipher) {
      var ivHex = Array.from(iv).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
      var dataHex = Array.from(new Uint8Array(cipher)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
      return 'enc2:' + ivHex + ':' + dataHex;
    });
  },

  decrypt: function(value) {
    if (!value || typeof value !== 'string') return Promise.resolve(value);
    var isV2 = value.indexOf('enc2:') === 0;
    var isV1 = value.indexOf('enc1:') === 0;
    if (!isV2 && !isV1) return Promise.resolve(value);
    if (!this.isEnabled()) return Promise.resolve(value);
    var parts = value.split(':');
    if (parts.length !== 3) return Promise.resolve(value);
    var iv = this._hexToBytes(parts[1]);
    var data = this._hexToBytes(parts[2]);
    var keyPromise = isV2 ? this._deriveKey() : this._deriveLegacyKey();
    return keyPromise.then(function(key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
    }).then(function(buf) {
      return new TextDecoder().decode(buf);
    }).catch(function() {
      return value;
    });
  },

  wrapStorageValue: function(key, value) {
    if (!this.isEnabled() || key.indexOf('fp-') !== 0) {
      return Promise.resolve(value);
    }
    return this.encrypt(value);
  },

  unwrapStorageValue: function(key, value) {
    if (!this.isEnabled() || key.indexOf('fp-') !== 0) {
      return Promise.resolve(value);
    }
    return this.decrypt(value);
  },
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LOCAL_CRYPTO;
}
