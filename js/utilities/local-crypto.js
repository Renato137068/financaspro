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
      && (value.indexOf('enc1:') === 0
       || value.indexOf('enc2:') === 0
       || value.indexOf('enc3:') === 0);
  },

  /**
   * Que tipo de proteção a cifragem oferece AGORA — e, por consequência, o que
   * a interface pode honestamente prometer.
   *
   * 'passphrase': a chave deriva de um segredo que o usuário sabe e que não
   *   fica no localStorage. Protege inclusive contra quem tenha acesso ao
   *   armazenamento do navegador.
   *
   * 'dispositivo': a chave deriva de `financaspro_ckey_dev`, um segredo
   *   aleatório guardado NO MESMO localStorage que ela protege. Isso embaralha
   *   o dado contra leitura casual, backup em texto puro e olhada no DevTools
   *   — mas NÃO protege contra XSS nem contra perícia no perfil do navegador,
   *   porque quem lê o storage lê a chave junto. A interface precisa dizer
   *   isso; prometer mais do que se entrega é pior que não cifrar.
   */
  nivelDeProtecao: function() {
    var cfg = typeof DADOS !== 'undefined' ? DADOS.getConfig() : {};
    return cfg.cryptoPassphrase ? 'passphrase' : 'dispositivo';
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
    /* Passphrase real do usuário tem prioridade; senão, segredo aleatório do
       device (nunca o nome). Salt aleatório por instalação.

       ⚠ ARMADILHA PARA QUEM FOR IMPLEMENTAR O MODO PASSPHRASE ⚠

       Hoje NADA escreve cfg.cryptoPassphrase — não existe tela para defini-la,
       então todo mundo está no modo 'dispositivo'. Este ramo é o encaixe de uma
       feature que ainda não foi construída.

       Passar a gravar cryptoPassphrase sem mais nada TROCA A CHAVE DERIVADA, e
       todo dado já gravado como enc2/enc3 vira ilegível: as chaves 'fp-' do
       localStorage (config, lançamentos, orçamento…) e os anexos no IndexedDB.
       Perda de dados silenciosa — o app não quebra, só passa a não decifrar.

       Quem for construir isso precisa, na mesma entrega:
         1. recifrar tudo com a chave nova antes de descartar a antiga —
            gravar o novo, verificar a leitura, só então trocar;
         2. decidir o que acontece quando o usuário esquece a passphrase
            (sem ela o dado local morre; a nuvem passa a ser o único backup);
         3. resolver quando pedi-la. Se não for a cada abertura, ela precisa
            ficar guardada em algum lugar — e aí volta a ser exatamente o
            problema que o modo 'dispositivo' já tem.

       O teste tests/local-crypto-passphrase-guard.test.js falha se alguém
       começar a gravar a passphrase sem uma rotina de recifragem. */
    return {
      passphrase: cfg.cryptoPassphrase || dev || 'financaspro-fallback',
      saltHex: salt || 'financaspro-fallback-salt',
    };
  },

  // Iterações de PBKDF2 por versão de formato.
  //
  // Mudar o número de iterações muda a CHAVE derivada. Trocar 100k por 600k
  // "no lugar" tornaria ilegível todo dado já gravado como enc2 — perda de
  // dados silenciosa para quem tivesse a cifragem ligada. Por isso a mudança
  // vem como formato novo: escreve-se enc3 (600k, alinhado ao PBKDF2 do
  // backend e à recomendação da OWASP para SHA-256) e continua-se lendo enc2
  // (100k) e enc1 (legado). Cada valor migra sozinho na primeira reescrita.
  _ITERACOES: { enc2: 100000, enc3: 600000 },
  _VERSAO_ATUAL: 'enc3',

  _keyPromises: null,
  _keyMats: null,

  _deriveKey: function(versao) {
    var self = this;
    var v = versao || this._VERSAO_ATUAL;
    var m = this._material();
    var matId = m.passphrase + '|' + m.saltHex;

    if (!this._keyPromises) { this._keyPromises = {}; this._keyMats = {}; }
    if (this._keyPromises[v] && this._keyMats[v] === matId) return this._keyPromises[v];
    this._keyMats[v] = matId;

    this._keyPromises[v] = crypto.subtle.importKey(
      'raw', new TextEncoder().encode(m.passphrase), { name: 'PBKDF2' }, false, ['deriveKey']
    ).then(function(base) {
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt: self._hexToBytes(m.saltHex), iterations: self._ITERACOES[v], hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
    });
    return this._keyPromises[v];
  },

  // Chave legada (SHA-256 do passphrase antigo) — SÓ para decifrar dados 'enc1'.
  // ATENÇÃO: o literal abaixo entra na derivação da chave de dados já gravados.
  // Ele NÃO acompanha o nome do produto e não pode ser renomeado nunca — trocá-lo
  // torna ilegível todo dado cifrado no formato 'enc1'. Coberto por teste.
  _PASSE_LEGADO: 'financaspro',
  _deriveLegacyKey: function() {
    if (this._legacyKeyPromise) return this._legacyKeyPromise;
    var cfg = typeof DADOS !== 'undefined' ? DADOS.getConfig() : {};
    var base = (cfg.cryptoPassphrase || cfg.nome || this._PASSE_LEGADO) + '|' + (cfg._deviceId || 'local');
    this._legacyKeyPromise = crypto.subtle.digest('SHA-256', new TextEncoder().encode(base))
      .then(function(raw) {
        return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
      });
    return this._legacyKeyPromise;
  },

  encrypt: function(plain) {
    if (!this.isEnabled()) return Promise.resolve(plain);
    var self = this;
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return this._deriveKey(this._VERSAO_ATUAL).then(function(key) {
      return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(plain));
    }).then(function(cipher) {
      var ivHex = Array.from(iv).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
      var dataHex = Array.from(new Uint8Array(cipher)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
      return self._VERSAO_ATUAL + ':' + ivHex + ':' + dataHex;
    });
  },

  decrypt: function(value) {
    if (!value || typeof value !== 'string') return Promise.resolve(value);
    if (!this.isEncrypted(value)) return Promise.resolve(value);
    if (!this.isEnabled()) return Promise.resolve(value);

    var parts = value.split(':');
    if (parts.length !== 3) return Promise.resolve(value);

    var versao = parts[0];
    var iv = this._hexToBytes(parts[1]);
    var data = this._hexToBytes(parts[2]);
    var keyPromise = versao === 'enc1'
      ? this._deriveLegacyKey()
      : this._deriveKey(versao);

    return keyPromise.then(function(key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, key, data);
    }).then(function(buf) {
      return new TextDecoder().decode(buf);
    }).catch(function() {
      // Devolver o texto cifrado é deliberado: o chamador prefere um valor
      // ilegível a perder o dado. Quem escrever por cima disso reescreve na
      // versão atual.
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
