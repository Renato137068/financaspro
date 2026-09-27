/**
 * @file dados.js — Data persistence layer
 * @module DADOS
 * Tier 0. Depende de CONFIG apenas.
 *
 * O cliente da API Express legada (sessão, login, TOTP, Open Finance, sync
 * /api/v1) mora em js/core/dados-express.js e é copiado para cá no fim do
 * arquivo: quem chama continua usando DADOS.loginApi, DADOS._apiFetch etc.
 */

/**
 * @typedef {Object} Transacao
 * @property {string} id
 * @property {'receita'|'despesa'} tipo
 * @property {number} valor
 * @property {string} categoria
 * @property {string} data — YYYY-MM-DD
 * @property {string} [descricao]
 * @property {string} [banco]
 * @property {string} [cartao]
 * @property {string} [dataCriacao]
 */

/**
 * @typedef {Object} ConfigUser
 * @property {string} nome
 * @property {'BRL'|'USD'|'EUR'} moeda
 * @property {'light'|'dark'} tema
 * @property {number} [renda]
 * @property {Object} [orcamentos]
 * @property {Object} [regra503020]
 * @property {boolean} [pinAtivo]
 * @property {string} [pinHash]
 * @property {string} [pinSalt]
 * @property {string} [pinAlgoritmo]
 * @property {number} [pinTentativas]
 * @property {number} [pinBloqueadoAte]
 * @property {string} [ultimoExportoDados]
 * @property {number} [_schemaVer]
 */

var DADOS = {
  _initialized: false,
  _storageDebounceTimer: null,
  /** Versão atual do schema. Incrementar quando estrutura quebrar compat. */
  SCHEMA_VERSION: 2,

  /** Cache em memória para leitura síncrona com crypto at-rest */
  _plainCache: {},

  /**
   * Cadeia serial de escritas no disco. Sem isso, cifragem at-rest assíncrona
   * permite last-writer-wins invertido: um encrypt antigo sobrescreve o novo
   * e o lançamento some no reload (achado P0 da auditoria anual).
   */
  _diskWriteChain: Promise.resolve(),

  /** Aviso de cota é uma vez por sessão — repetido, vira ruído ignorável. */
  _avisouCota: false,
  _avisouSyncMultiAba: false,
  _modalConflitoAberto: false,
  _storageSyncBound: false,
  _transacoesBackend: null,
  _transacoesCache: null,
  _idbWriteChain: Promise.resolve(),
  _initPromise: null,
  _ignorarStorageSync: false,
  TX_BACKEND_KEY: 'fp-tx-backend',
  TX_SYNC_PING_KEY: 'fp-tx-sync-ping',
  TX_IDB_SENTINEL: '{"_idb":1}',
  LIMIAR_MIGRAR_TX_COUNT: 2500,
  LIMIAR_MIGRAR_TX_BYTES: 3 * 1024 * 1024,

  _storageGetRaw: function(key) {
    if (typeof LOCAL_CRYPTO !== 'undefined' && LOCAL_CRYPTO.isEnabled()) {
      if (Object.prototype.hasOwnProperty.call(this._plainCache, key)) {
        return this._plainCache[key];
      }
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      // Detecta qualquer versão de cifra (enc1/enc2). Antes checava só 'enc1:',
      // mas encrypt() gera 'enc2:' — com a cifragem ligada, valores enc2 não
      // eram decifrados na leitura (dados apareceriam corrompidos).
      if (LOCAL_CRYPTO.isEncrypted(raw)) {
        var self = this;
        LOCAL_CRYPTO.unwrapStorageValue(key, raw).then(function(plain) {
          self._plainCache[key] = plain;
          if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
            APP_STORE.dispatch(ACTIONS.SYNC_CONCLUIR);
          }
        });
        return null;
      }
      this._plainCache[key] = raw;
      return raw;
    }
    return localStorage.getItem(key);
  },

  /** Teto prático do localStorage. Não é consultável: 5 MB é o valor que os
   *  navegadores convergiram e o mais conservador entre eles. */
  LIMITE_STORAGE_BYTES: 5 * 1024 * 1024,

  /** Acima disto o usuário é avisado — ainda com espaço para agir. */
  _LIMIAR_AVISO: 0.8,

  /**
   * Um DOMException de cota, ou outra coisa?
   *
   * O nome muda por navegador e versão; o código 22 é o legado e o 1014 é o
   * do Firefox. Errar essa detecção significa tratar um bug qualquer como
   * "acabou o espaço" e mandar o usuário apagar dados sem necessidade.
   */
  _ehErroDeCota: function(e) {
    if (!e) return false;
    return e.name === 'QuotaExceededError'
      || e.name === 'NS_ERROR_DOM_QUOTA_REACHED'
      || e.code === 22
      || e.code === 1014;
  },

  /**
   * Quantos bytes o app ocupa no localStorage, e quão perto do teto está.
   *
   * A auditoria de dimensões ocultas mediu 60 mil lançamentos em 8,79 MB — bem
   * acima do teto de 5 MB. O limite prático fica perto de 35 mil lançamentos, e
   * até agora o app não dizia nada a respeito: o usuário simplesmente batia no
   * teto um dia, no meio de um cadastro.
   */
  usoArmazenamento: function() {
    var bytes = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        var v = localStorage.getItem(k) || '';
        // UTF-16: o navegador contabiliza 2 bytes por unidade de código.
        bytes += (k.length + v.length) * 2;
      }
    } catch (e) {
      return { bytes: 0, limite: this.LIMITE_STORAGE_BYTES, percentual: 0, disponivel: false };
    }
    return {
      bytes: bytes,
      limite: this.LIMITE_STORAGE_BYTES,
      percentual: Math.min(100, Math.round((bytes / this.LIMITE_STORAGE_BYTES) * 100)),
      disponivel: true,
    };
  },

  /**
   * Avisa uma vez por sessão quando o armazenamento passa do limiar.
   *
   * Uma vez por sessão porque o aviso precisa ser levado a sério: repetido a
   * cada gravação vira ruído e a pessoa aprende a ignorá-lo — justamente antes
   * do dia em que ele importa.
   */
  verificarCota: function() {
    var uso = this.usoArmazenamento();
    if (!uso.disponivel || this._avisouCota) return uso;
    if (uso.percentual < this._LIMIAR_AVISO * 100) return uso;

    this._avisouCota = true;
    var msgCota = 'Armazenamento em ' + uso.percentual + '%. Exporte um backup e '
      + 'considere apagar lançamentos antigos.';
    if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast(msgCota, 'warning');
    }
    if (typeof UTILS !== 'undefined' && UTILS.mostrarBanner) {
      UTILS.mostrarBanner({
        id: 'fp-banner-cota',
        tipo: 'warning',
        mensagem: msgCota,
        acao: 'Exportar backup',
        fecharAoAcao: false,
        onAcao: function() {
          if (typeof CONFIG_USER !== 'undefined' && CONFIG_USER.exportarDados) {
            CONFIG_USER.exportarDados();
          } else if (typeof exportarDados === 'function') {
            exportarDados();
          }
        },
      });
    }
    return uso;
  },

  /**
   * Grava no localStorage. Devolve true se gravou de forma síncrona no
   * caminho claro. Com cifragem at-rest, atualiza o cache imediato e enfileira
   * a escrita no disco (serial) — use DADOS.aguardarDisco() antes de anunciar
   * sucesso. Perder dado financeiro em silêncio é o pior desfecho possível.
   */
  /**
   * Enfileira uma escrita de disco. Sempre serial — nunca paralelo.
   * @returns {Promise}
   */
  _enqueueDiskWrite: function(job) {
    var self = this;
    this._diskWriteChain = this._diskWriteChain.then(job, job);
    return this._diskWriteChain;
  },

  /**
   * Espera todas as escritas pendentes no disco (cifração incluída).
   * Use antes de anunciar "Salvo" ou de confiar num reload.
   * @returns {Promise<boolean>}
   */
  aguardarDisco: function() {
    var chain = this._diskWriteChain || Promise.resolve();
    return chain.then(function() { return true; }, function() { return false; });
  },

  _storageSetRaw: function(key, value) {
    var self = this;

    function avisarCotaEsgotada() {
      if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
        UTILS.mostrarToast(
          'Sem espaço para salvar. Exporte um backup e apague lançamentos '
          + 'antigos para continuar.',
          'error',
        );
      }
    }

    if (typeof LOCAL_CRYPTO !== 'undefined' && LOCAL_CRYPTO.isEnabled()) {
      this._plainCache[key] = value;
      // Captura `value` neste tick; a cadeia serial evita overwrite invertido.
      var snapshot = value;
      this._enqueueDiskWrite(function() {
        return LOCAL_CRYPTO.wrapStorageValue(key, snapshot).then(function(stored) {
          try {
            localStorage.setItem(key, stored);
            self.verificarCota();
            return true;
          } catch (e) {
            if (self._ehErroDeCota(e)) {
              avisarCotaEsgotada();
            }
            console.error('Erro ao persistir storage criptografado:', e);
            throw e;
          }
        });
      });
      return true;
    }

    try {
      localStorage.setItem(key, value);
      this.verificarCota();
      return true;
    } catch (e) {
      if (this._ehErroDeCota(e)) {
        avisarCotaEsgotada();
        return false;
      }
      throw e;
    }
  },

  // Chaves elegíveis à cifragem (prefixo 'fp-'). aprendizado/rascunho ficam de fora.
  _CRYPTO_KEYS: function() {
    return [CONFIG.STORAGE_TRANSACOES, CONFIG.STORAGE_CONFIG, CONFIG.STORAGE_CONTAS];
  },

  /**
   * Liga/desliga a cifragem at-rest MIGRANDO os dados existentes com segurança:
   * lê cada chave 'fp-' no formato atual (decifrando as que estão cifradas ANTES
   * de virar o flag), alterna o flag e regrava no novo formato. Sem esta migração,
   * desligar deixaria valores 'enc2:' ilegíveis (o leitor só decifra com o flag on).
   * @param {boolean} enable
   * @returns {Promise<boolean>} estado efetivo de LOCAL_CRYPTO.isEnabled() após migrar
   */
  aplicarCriptografia: function(enable) {
    if (typeof LOCAL_CRYPTO === 'undefined') return Promise.resolve(false);
    var self = this;
    var keys = this._CRYPTO_KEYS();

    // 1. Lê em texto puro no estado ATUAL (decrypt exige o flag ainda ligado).
    var reads = keys.map(function(key) {
      var raw = localStorage.getItem(key);
      if (!raw) return Promise.resolve({ key: key, plain: null });
      if (LOCAL_CRYPTO.isEncrypted(raw)) {
        return LOCAL_CRYPTO.decrypt(raw).then(function(plain) { return { key: key, plain: plain }; });
      }
      return Promise.resolve({ key: key, plain: raw });
    });

    // Blob de lançamentos no IndexedDB (backend 'idb'): mesma migração. A
    // leitura espera as gravações pendentes e só serve para confirmar que o
    // blob decifra no estado ATUAL do flag — se não decifrar, a migração
    // aborta como nas chaves do localStorage.
    var usaIdb = this._transacoesBackend === 'idb' && typeof IDB_KV !== 'undefined';
    if (usaIdb) {
      reads.push(this._idbWriteChain.then(function() {
        return self._idbLerTransacoes();
      }).then(function(plain) {
        return { key: CONFIG.STORAGE_TRANSACOES, plain: plain, idb: true };
      }));
    }

    return Promise.all(reads).then(function(items) {
      // Aborta se algo não decifrou (evita gravar cifrado como se fosse puro).
      for (var i = 0; i < items.length; i++) {
        if (items[i].plain != null && LOCAL_CRYPTO.isEncrypted(items[i].plain)) {
          throw new Error('Falha ao decifrar dados existentes — migração abortada');
        }
      }

      // Anexos: ao DESLIGAR, decifrar enquanto o flag ainda está ligado.
      var anexosAntes = (!enable && typeof ANEXOS !== 'undefined' && ANEXOS.migrarCriptografia)
        ? ANEXOS.migrarCriptografia(false)
        : Promise.resolve();

      return anexosAntes.then(function() {
        LOCAL_CRYPTO.setEnabled(enable);
        self._plainCache = {};

        var writes = items.map(function(it) {
          if (it.plain == null) return Promise.resolve();
          if (it.idb) {
            // Regrava pela cadeia serial a partir do cache em memória — no
            // backend 'idb' ele é a fonte de verdade e já inclui qualquer
            // lançamento salvo enquanto a leitura acima acontecia.
            self._idbWriteChain = self._idbWriteChain.then(function() {
              var lista = Array.isArray(self._transacoesCache) ? self._transacoesCache : [];
              return self._idbGravarTransacoes(JSON.stringify(lista));
            });
            return self._idbWriteChain;
          }
          if (enable) {
            return LOCAL_CRYPTO.encrypt(it.plain).then(function(enc) { localStorage.setItem(it.key, enc); });
          }
          localStorage.setItem(it.key, it.plain);
          return Promise.resolve();
        });
        return Promise.all(writes);
      }).then(function() {
        // Anexos: ao LIGAR, cifrar com o flag já ativo.
        if (enable && typeof ANEXOS !== 'undefined' && ANEXOS.migrarCriptografia) {
          return ANEXOS.migrarCriptografia(true);
        }
      });
    }).then(function() {
      return LOCAL_CRYPTO.isEnabled();
    });
  },

  _storageRemoveRaw: function(key) {
    delete this._plainCache[key];
    localStorage.removeItem(key);
  },

  /** Supabase Auth + Postgres (RLS) ativos no cliente. */
  _supabaseAtivo: function() {
    var url = (CONFIG.SUPABASE_URL || '').trim();
    var key = (CONFIG.SUPABASE_ANON_KEY || '').trim();
    if (!url || !key) return false;
    return typeof SUPA_AUTH !== 'undefined' && SUPA_AUTH.isActive && SUPA_AUTH.isActive();
  },

  /** Nuvem = Supabase OU API Express configurada (billing, login, sync). */
  _nuvemAtiva: function() {
    if (this._supabaseAtivo()) return true;
    return this._apiAtiva();
  },

  init: function() {
    if (this._initialized) return Promise.resolve();
    if (this._initPromise) return this._initPromise;
    var self = this;
    this._initPromise = this._prepararStorageTransacoes().then(function() {
      self._limparTokensLegados();
      if (self._transacoesBackend !== 'idb' && !self._storageGetRaw(CONFIG.STORAGE_TRANSACOES)) {
        self._storageSetRaw(CONFIG.STORAGE_TRANSACOES, JSON.stringify([]));
      }
      if (!self._storageGetRaw(CONFIG.STORAGE_CONFIG)) {
        var defaults = Object.assign({}, CONFIG.DEFAULT_CONFIG, { _schemaVer: self.SCHEMA_VERSION });
        self._storageSetRaw(CONFIG.STORAGE_CONFIG, JSON.stringify(defaults));
      } else {
        self._migrarSchema();
      }
      if (typeof APP_STORE !== 'undefined') APP_STORE.hydrateFromDados();
      self.setupStorageSync();
      if (typeof SESSION_LOG !== 'undefined') {
        SESSION_LOG.registrar('init_dados', { backend: self._transacoesBackend || 'localStorage' });
      }
      self.sincronizarComApi();
      self._initialized = true;
    });
    return this._initPromise;
  },

  _mostrarBannerMultiAba: function(mensagem) {
    if (this._modalConflitoAberto) return;
    if (this._avisouSyncMultiAba || typeof UTILS === 'undefined' || !UTILS.mostrarBanner) return;
    this._avisouSyncMultiAba = true;
    UTILS.mostrarBanner({
      id: 'fp-banner-multiaba',
      tipo: 'info',
      mensagem: mensagem || 'Outra aba alterou seus dados. A tela foi atualizada.',
      acao: 'Recarregar',
      fecharAoAcao: false,
      onAcao: function() { window.location.reload(); },
    });
  },

  _aplicarCacheTransacoes: function(lista) {
    this._transacoesCache = Array.isArray(lista) ? lista : [];
    if (typeof TRANSACOES !== 'undefined') TRANSACOES.init();
    if (typeof ORCAMENTO !== 'undefined') ORCAMENTO.init();
    if (typeof CONTAS !== 'undefined') CONTAS.init();
    if (typeof RENDER !== 'undefined') RENDER.init();
  },

  _persistirTransacoesLista: function(lista) {
    var self = this;
    this._ignorarStorageSync = true;
    if (this._transacoesBackend === 'idb') {
      this._transacoesCache = lista;
      var json = JSON.stringify(lista);
      this._idbWriteChain = this._idbWriteChain.then(function() {
        return self._idbGravarTransacoes(json);
      });
    } else {
      this._storageSetRaw(CONFIG.STORAGE_TRANSACOES, JSON.stringify(lista));
    }
    setTimeout(function() { self._ignorarStorageSync = false; }, 0);
  },

  _mostrarModalConflitos: function(conflitos, onResolve) {
    var self = this;
    if (!conflitos || !conflitos.length || typeof document === 'undefined') {
      if (onResolve) onResolve({});
      return;
    }
    if (typeof INIT_MODALS !== 'undefined' && INIT_MODALS.fpConfirm) {
      self._modalConflitoAberto = true;
      var html = 'Outra aba alterou <strong>' + conflitos.length + '</strong> lançamento(s) que você também modificou.<br><br><ul style="text-align:left;margin:0;padding-left:1.2em">';
      conflitos.forEach(function(c) {
        var titulo = (c.local && c.local.descricao) ? c.local.descricao : 'Lançamento';
        var locVal = (typeof UTILS !== 'undefined' && UTILS.formatarMoeda)
          ? UTILS.formatarMoeda(c.local.valor) : String(c.local.valor);
        var remVal = (typeof UTILS !== 'undefined' && UTILS.formatarMoeda)
          ? UTILS.formatarMoeda(c.remote.valor) : String(c.remote.valor);
        html += '<li><strong>' + UTILS.escapeHtml(titulo) + '</strong><br>';
        html += 'Esta aba: ' + UTILS.escapeHtml(locVal) + ' · Outra aba: ' + UTILS.escapeHtml(remVal) + '</li>';
      });
      html += '</ul><br>Qual versão manter?';
      INIT_MODALS.fpConfirm(html, function() {
        var res = {};
        conflitos.forEach(function(c) { res[c.id] = 'local'; });
        self._modalConflitoAberto = false;
        onResolve(res);
      }, function() {
        var res = {};
        conflitos.forEach(function(c) { res[c.id] = 'remote'; });
        self._modalConflitoAberto = false;
        onResolve(res);
      }, { okLabel: 'Manter desta aba', cancelLabel: 'Usar outra aba', danger: false, trustedHtml: true });
      return;
    }
    var res = {};
    conflitos.forEach(function(c) { res[c.id] = 'remote'; });
    onResolve(res);
  },

  _mesclarTransacoesComConflitos: function(locais, remotas, pending) {
    var conflitos = (typeof SYNC_MERGE !== 'undefined' && SYNC_MERGE.detectarConflitos)
      ? SYNC_MERGE.detectarConflitos(locais, pending, remotas) : [];
    if (!conflitos.length) {
      var merged = (typeof SYNC_MERGE !== 'undefined')
        ? SYNC_MERGE.mergeDelta(locais, pending, remotas)
        : remotas;
      if (typeof SESSION_LOG !== 'undefined') {
        SESSION_LOG.registrar('merge_multiaba', { conflitos: 0, total: merged.length });
      }
      return Promise.resolve({ lista: merged, conflitos: 0 });
    }
    if (typeof SESSION_LOG !== 'undefined') {
      SESSION_LOG.registrar('conflito_multiaba', { qtd: conflitos.length });
    }
    var self = this;
    return new Promise(function(resolve) {
      self._mostrarModalConflitos(conflitos, function(resolucoes) {
        var resultado = (typeof SYNC_MERGE !== 'undefined' && SYNC_MERGE.aplicarResolucoes)
          ? SYNC_MERGE.aplicarResolucoes(locais, pending, remotas, resolucoes)
          : remotas;
        if (typeof SESSION_LOG !== 'undefined') {
          SESSION_LOG.registrar('conflito_resolvido', { qtd: conflitos.length });
        }
        resolve({ lista: resultado, conflitos: conflitos.length });
      });
    });
  },

  _pendingTxIds: function() {
    if (typeof PERSIST_QUEUE === 'undefined' || !PERSIST_QUEUE.getSnapshot) return [];
    var snap = PERSIST_QUEUE.getSnapshot();
    return (snap.items || []).filter(function(it) {
      return it && (it.status === 'pending' || it.status === 'saving');
    }).map(function(it) { return it.txId; }).filter(Boolean);
  },

  _parseTransacoesJson: function(data) {
    if (!data || data === this.TX_IDB_SENTINEL) return [];
    var parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  },

  /**
   * Grava o blob de lançamentos no IndexedDB pela MESMA regra do localStorage:
   * cifrado quando "cifrar dados" está ligado. Antes o blob ia em texto puro
   * para o IDB — justo o maior volume de dados, o de quem tem mais de 2.500
   * lançamentos, ficava fora da proteção que a opção promete.
   * Sempre chamado dentro de _idbWriteChain (a cifra é assíncrona; a cadeia
   * serial impede que um encrypt antigo sobrescreva um novo).
   */
  _idbGravarTransacoes: function(json) {
    var key = CONFIG.STORAGE_TRANSACOES;
    if (typeof LOCAL_CRYPTO !== 'undefined' && LOCAL_CRYPTO.isEnabled()) {
      return LOCAL_CRYPTO.wrapStorageValue(key, json).then(function(stored) {
        return IDB_KV.set(key, stored);
      });
    }
    return IDB_KV.set(key, json);
  },

  /** Lê o blob de lançamentos do IndexedDB, decifrando se estiver cifrado. */
  _idbLerTransacoes: function() {
    var key = CONFIG.STORAGE_TRANSACOES;
    return IDB_KV.get(key).then(function(data) {
      if (data && typeof LOCAL_CRYPTO !== 'undefined' && LOCAL_CRYPTO.isEncrypted(data)) {
        return LOCAL_CRYPTO.unwrapStorageValue(key, data);
      }
      return data;
    });
  },

  /**
   * Blob do IDB que não decifrou nem parseou: guarda uma cópia intacta antes
   * que a próxima gravação o substitua. O decrypt devolve o texto cifrado
   * quando falha — sem esta cópia, o primeiro lançamento novo gravaria uma
   * lista vazia por cima de dados que talvez só estejam com a chave errada.
   */
  _preservarBlobIlegivel: function(data) {
    if (!data || typeof IDB_KV === 'undefined') return Promise.resolve(false);
    var backupKey = CONFIG.STORAGE_TRANSACOES + '-ilegivel';
    return IDB_KV.get(backupKey).then(function(existente) {
      if (existente) return false;
      return IDB_KV.set(backupKey, data);
    });
  },

  _deveMigrarTransacoesParaIdb: function(data, lista) {
    if (typeof IDB_KV === 'undefined' || !IDB_KV.isReady || !IDB_KV.isReady()) return false;
    if (!Array.isArray(lista)) return false;
    if (lista.length >= this.LIMIAR_MIGRAR_TX_COUNT) return true;
    if (data && data.length * 2 >= this.LIMIAR_MIGRAR_TX_BYTES) return true;
    var uso = this.usoArmazenamento();
    return uso.disponivel && uso.percentual >= this._LIMIAR_AVISO * 100;
  },

  _ativarBackendIdbTransacoes: function(lista) {
    this._transacoesBackend = 'idb';
    this._transacoesCache = Array.isArray(lista) ? lista : [];
    try {
      localStorage.setItem(this.TX_BACKEND_KEY, 'idb');
      localStorage.setItem(CONFIG.STORAGE_TRANSACOES, this.TX_IDB_SENTINEL);
    } catch (e) { /* noop */ }
    var json = JSON.stringify(this._transacoesCache);
    var self = this;
    this._idbWriteChain = this._idbWriteChain.then(function() {
      return self._idbGravarTransacoes(json);
    }).then(function() {
      self._pingTransacoesSync();
    });
    return this._idbWriteChain;
  },

  _prepararStorageTransacoes: function() {
    var self = this;
    if (typeof IDB_KV === 'undefined') {
      self._transacoesBackend = 'localStorage';
      return Promise.resolve();
    }
    return IDB_KV.init().then(function() {
      var backend = null;
      try { backend = localStorage.getItem(self.TX_BACKEND_KEY); } catch (e) { backend = null; }
      if (backend === 'idb' && IDB_KV.isReady()) {
        self._transacoesBackend = 'idb';
        return self._idbLerTransacoes().then(function(data) {
          try {
            self._transacoesCache = data ? self._parseTransacoesJson(data) : [];
          } catch (e) {
            self._transacoesCache = [];
            self._registrarFalhaLeitura(CONFIG.STORAGE_TRANSACOES, e);
            return self._preservarBlobIlegivel(data);
          }
        });
      }
      self._transacoesBackend = 'localStorage';
      var raw = self._storageGetRaw(CONFIG.STORAGE_TRANSACOES);
      if (!raw) return;
      try {
        var lista = self._parseTransacoesJson(raw);
        if (self._deveMigrarTransacoesParaIdb(raw, lista)) {
          return self._ativarBackendIdbTransacoes(lista);
        }
      } catch (e) {
        console.warn('Migração IDB ignorada:', e);
      }
    });
  },

  _pingTransacoesSync: function() {
    try {
      this._ignorarStorageSync = true;
      localStorage.setItem(this.TX_SYNC_PING_KEY, String(Date.now()));
    } catch (e) { /* noop */ }
    finally {
      var self = this;
      setTimeout(function() { self._ignorarStorageSync = false; }, 0);
    }
  },

  _hidratarTransacoesIdb: function() {
    var self = this;
    if (this._transacoesBackend !== 'idb' || typeof IDB_KV === 'undefined') {
      return Promise.resolve(false);
    }
    var antes = (this._transacoesCache || []).slice();
    var pending = this._pendingTxIds();
    return this._idbLerTransacoes().then(function(data) {
      var novas;
      try {
        novas = data ? self._parseTransacoesJson(data) : [];
      } catch (e) {
        novas = [];
      }
      return self._mesclarTransacoesComConflitos(antes, novas, pending).then(function(result) {
        var merged = result.lista;
        self._aplicarCacheTransacoes(merged);
        if (JSON.stringify(merged) !== JSON.stringify(novas)) {
          self._persistirTransacoesLista(merged);
        }
        return result.conflitos > 0;
      });
    });
  },

  _mesclarTransacoesRemotas: function(remoteJson) {
    if (!remoteJson || remoteJson === this.TX_IDB_SENTINEL) return;
    var form = typeof document !== 'undefined' ? document.getElementById('form-transacao') : null;
    if (form && form.dataset && form.dataset.editId) {
      this._mostrarBannerMultiAba(
        'Outra aba alterou dados enquanto você edita um lançamento. Recarregue antes de salvar.'
      );
      return;
    }
    var self = this;
    try {
      var remotas = this._parseTransacoesJson(remoteJson);
      if (!remotas.length && remoteJson !== '[]') return;
      var locais = this._transacoesBackend === 'idb'
        ? (this._transacoesCache || []).slice()
        : this._parseTransacoesJson(this._storageGetRaw(CONFIG.STORAGE_TRANSACOES));
      var pending = this._pendingTxIds();
      this._mesclarTransacoesComConflitos(locais, remotas, pending).then(function(result) {
        self._persistirTransacoesLista(result.lista);
        self._aplicarCacheTransacoes(result.lista);
      }).catch(function(e) {
        console.warn('Merge multi-aba falhou:', e);
      });
    } catch (e) {
      console.warn('Merge multi-aba falhou:', e);
    }
  },

  _mostrarDicaMultiAba: function() {
    try {
      if (sessionStorage.getItem('_avisoMultiAbaDoc')) return;
      sessionStorage.setItem('_avisoMultiAbaDoc', '1');
    } catch (e) {
      return;
    }
    if (typeof UTILS === 'undefined' || !UTILS.mostrarBanner) return;
    UTILS.mostrarBanner({
      id: 'fp-banner-multiaba-doc',
      tipo: 'info',
      mensagem: 'Dica: evite editar em duas abas ao mesmo tempo. A última gravação prevalece — o app avisa quando outra aba altera seus dados.',
    });
  },

  _migrarSchema: function() {
    try {
      var cfg = this.getConfig();
      var atual = cfg._schemaVer || 1;
      if (atual >= this.SCHEMA_VERSION) return;

      // v1 → v2: PIN antigo (sem salt PBKDF2) → forçar reset por segurança
      if (atual < 2) {
        if (cfg.pinAtivo && (!cfg.pinSalt || cfg.pinAlgoritmo !== 'pbkdf2-sha256-100k')) {
          this.salvarConfig({
            pinAtivo: false, pinHash: null, pinSalt: null,
            pinAlgoritmo: null, pinTentativas: 0, pinBloqueadoAte: 0,
            _migracaoPinV2: true // flag para UI avisar usuário
          });
        }
      }

      this.salvarConfig({ _schemaVer: this.SCHEMA_VERSION });
    } catch (e) {
      console.warn('Migração de schema falhou:', e);
    }
  },

  /**
   * Retorna todas transações persistidas. Falha silenciosamente em JSON inválido.
   * @returns {Transacao[]}
   */
  /**
   * Marcado quando uma leitura do storage falhou nesta sessão.
   *
   * Existe porque `[]` é ambíguo de um jeito perigoso: pode significar "não há
   * lançamentos" ou "não consegui ler os lançamentos". Para o usuário, a tela é
   * idêntica — ele abre o app e vê zero — e a diferença é enorme: no segundo
   * caso os dados ainda estão no disco e um backup pode salvá-los, mas a
   * primeira gravação seguinte sobrescreve o conteúdo corrompido e a perda vira
   * definitiva.
   */
  _falhaLeitura: null,

  /** Houve falha de leitura nesta sessão? */
  leituraFalhou: function() {
    return !!this._falhaLeitura;
  },

  /** Detalhe da falha, para a UI explicar o que aconteceu. */
  detalheFalhaLeitura: function() {
    return this._falhaLeitura;
  },

  /**
   * Registra a falha e avisa — uma vez por sessão, para não virar ruído.
   *
   * O aviso é deliberadamente instrutivo em vez de técnico: a ação que salva
   * os dados do usuário é exportar um backup ANTES de continuar mexendo.
   */
  _registrarFalhaLeitura: function(chave, erro) {
    if (this._falhaLeitura) return;
    this._falhaLeitura = { chave: chave, mensagem: erro && erro.message, em: new Date().toISOString() };

    if (typeof OBS !== 'undefined' && OBS.captureError) {
      OBS.captureError(erro, { contexto: 'DADOS.leitura', chave: chave });
    }
    if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast(
        'Não foi possível ler seus dados salvos. Eles podem estar íntegros — '
        + 'exporte um backup antes de registrar qualquer lançamento novo.',
        'error',
      );
    }
  },

  getTransacoesRaw: function() {
    if (this._transacoesBackend === 'idb') {
      return Array.isArray(this._transacoesCache) ? this._transacoesCache : [];
    }
    try {
      var data = this._storageGetRaw(CONFIG.STORAGE_TRANSACOES);
      if (!data) return [];
      var parsed = this._parseTransacoesJson(data);
      if (!Array.isArray(parsed)) {
        this._registrarFalhaLeitura(CONFIG.STORAGE_TRANSACOES,
          new Error('conteúdo não é uma lista'));
        return [];
      }
      return parsed;
    } catch (e) {
      this._registrarFalhaLeitura(CONFIG.STORAGE_TRANSACOES, e);
      return [];
    }
  },

  _storageSetTransacoes: function(transacoes) {
    var self = this;
    var json = JSON.stringify(transacoes);
    if (this._transacoesBackend === 'idb' && typeof IDB_KV !== 'undefined') {
      this._transacoesCache = transacoes;
      this._idbWriteChain = this._idbWriteChain.then(function() {
        return self._idbGravarTransacoes(json);
      }).then(function() {
        self._pingTransacoesSync();
      });
      return;
    }
    var check = UTILS.verificarStorageDisponivel(transacoes, CONFIG.STORAGE_TRANSACOES);
    if (!check.disponivel) {
      if (typeof IDB_KV !== 'undefined' && this._deveMigrarTransacoesParaIdb(json, transacoes)) {
        this._ativarBackendIdbTransacoes(transacoes);
        return;
      }
      console.error('Storage indisponível:', check.erro);
      throw new Error(check.erro);
    }
    try {
      this._ignorarStorageSync = true;
      this._storageSetRaw(CONFIG.STORAGE_TRANSACOES, json);
    } finally {
      setTimeout(function() { self._ignorarStorageSync = false; }, 0);
    }
  },

  getTransacoes: function() {
    return this.getTransacoesRaw().filter(function(t) {
      return !t.deletedAt;
    });
  },

  /**
   * Limita o cache local a N meses — histórico completo permanece no servidor.
   * Preserva itens pendentes na outbox de sync.
   */
  aplicarJanelaLocal: function() {
    var meses = (typeof CONFIG !== 'undefined' && CONFIG.LOCAL_TX_WINDOW_MONTHS) || 24;
    var cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - meses);
    var cutoffStr = cutoff.toISOString().slice(0, 10);
    var raw = this.getTransacoesRaw();
    var pending = (typeof SYNC_ENGINE !== 'undefined' && SYNC_ENGINE.pendingIds)
      ? SYNC_ENGINE.pendingIds()
      : [];
    var trimmed = raw.filter(function(t) {
      if (pending.indexOf(t.id) !== -1) return true;
      var d = t.data || (t.updatedAt && String(t.updatedAt).slice(0, 10)) || '';
      return d >= cutoffStr;
    });
    if (trimmed.length < raw.length) {
      this._storageSetTransacoes(trimmed);
    }
  },

  /**
   * Insere ou atualiza transação. Throw se quota cheia.
   * @param {Transacao} transacao
   * @returns {Transacao}
   * @throws {Error} se localStorage cheio
   */
  salvarTransacao: function(transacao) {
    var transacoes = this.getTransacoesRaw();
    var syncV2 = this._syncV2Ativo();

    // Idempotência local: mesmo clientKey → mesma transação (anti-duplicata).
    if (transacao.clientKey) {
      var byKey = transacoes.findIndex(function(t) {
        return t && t.clientKey === transacao.clientKey && !t.deletedAt;
      });
      if (byKey >= 0) {
        var kept = transacoes[byKey];
        // Atualiza campos mutáveis mantendo o id original.
        transacao.id = kept.id;
        transacao.dataCriacao = kept.dataCriacao || transacao.dataCriacao;
      }
    }

    transacao.id = transacao.id || (syncV2 && UTILS.gerarUuid ? UTILS.gerarUuid() : UTILS.gerarId());
    transacao.dataCriacao = transacao.dataCriacao || new Date().toISOString();
    transacao.updatedAt = new Date().toISOString();
    transacao.deletedAt = null;
    var index = transacoes.findIndex(function(t) { return t.id === transacao.id; });
    if (index >= 0) {
      transacoes[index] = transacao;
    } else {
      transacoes.push(transacao);
    }
    this._storageSetTransacoes(transacoes);
    var actionType = (typeof ACTIONS !== 'undefined')
      ? (index >= 0 ? ACTIONS.TRANSACAO_EDITAR : ACTIONS.TRANSACAO_CRIAR)
      : null;
    if (typeof APP_STORE !== 'undefined' && actionType) {
      APP_STORE.dispatch(actionType, transacao);
    }
    if (syncV2 && typeof SYNC_ENGINE !== 'undefined') {
      if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
        APP_STORE.dispatch(ACTIONS.SYNC_SALVANDO);
      }
      SYNC_ENGINE.enqueueTransaction('upsert', transacao);
    } else {
      this._pushTransacaoApi(transacao, index >= 0 ? 'PATCH' : 'POST').catch(function(err) {
        if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
          APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, {
            erro: (err && err.message) || 'push-tx',
          });
        }
      });
    }
    return transacao;
  },

  deletarTransacao: function(id) {
    var transacoes = this.getTransacoesRaw();
    var index = transacoes.findIndex(function(t) { return t.id === id && !t.deletedAt; });
    if (index >= 0) {
      var now = new Date().toISOString();
      if (this._syncV2Ativo() && typeof SYNC_ENGINE !== 'undefined') {
        transacoes[index].deletedAt = now;
        transacoes[index].updatedAt = now;
        this._storageSetTransacoes(transacoes);
        SYNC_ENGINE.enqueueTransaction('delete', transacoes[index]);
      } else {
        transacoes.splice(index, 1);
        this._storageSetTransacoes(transacoes);
        this._deleteTransacaoApi(id).catch(function(err) {
          if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
            APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, {
              erro: (err && err.message) || 'delete-tx',
            });
          }
        });
      }
      if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
        APP_STORE.dispatch(ACTIONS.TRANSACAO_DELETAR, id);
      }
      return true;
    }
    return false;
  },

  /**
   * Retorna config merge com defaults.
   * @returns {ConfigUser}
   */
  getConfig: function() {
    try {
      var data = this._storageGetRaw(CONFIG.STORAGE_CONFIG);
      if (!data) return Object.assign({}, CONFIG.DEFAULT_CONFIG);
      var parsed = JSON.parse(data);
      return Object.assign({}, CONFIG.DEFAULT_CONFIG, parsed);
    } catch (e) {
      this._registrarFalhaLeitura(CONFIG.STORAGE_CONFIG, e);
      return Object.assign({}, CONFIG.DEFAULT_CONFIG);
    }
  },

  /**
   * Merge config parcial e persiste. Não substitui — só atualiza chaves passadas.
   * @param {Partial<ConfigUser>} config
   * @returns {ConfigUser} config completo após merge
   */
  salvarConfig: function(config, opts) {
    opts = opts || {};
    var atual = this.getConfig();
    var merged = Object.assign({}, atual, config);
    this._storageSetRaw(CONFIG.STORAGE_CONFIG, JSON.stringify(merged));
    if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
      APP_STORE.dispatch(ACTIONS.CONFIG_SALVAR, merged);
    }
    if (!opts.skipPush) this._pushConfigApi(merged);
    return merged;
  },

  limparTodos: function() {
    this._transacoesCache = [];
    this._transacoesBackend = 'localStorage';
    try {
      localStorage.removeItem(this.TX_BACKEND_KEY);
      localStorage.removeItem(this.TX_SYNC_PING_KEY);
    } catch (e) { /* noop */ }
    if (typeof IDB_KV !== 'undefined') {
      IDB_KV.remove(CONFIG.STORAGE_TRANSACOES);
    }
    this._storageRemoveRaw(CONFIG.STORAGE_TRANSACOES);
    this._storageRemoveRaw(CONFIG.STORAGE_CONFIG);
    this._initialized = false;
    this._initPromise = null;
    return this.init();
  },

  getRecorrentes: function() {
    try {
      var config = this.getConfig();
      return Array.isArray(config.recorrentes) ? config.recorrentes : [];
    } catch (e) {
      return [];
    }
  },

  salvarRecorrente: function(recData) {
    var syncV2 = this._syncV2Ativo();
    var config = this.getConfig();
    if (!Array.isArray(config.recorrentes)) config.recorrentes = [];
    recData.id = recData.id || (syncV2 && UTILS.gerarUuid ? UTILS.gerarUuid() : UTILS.gerarId());
    recData.dataCriacao = recData.dataCriacao || new Date().toISOString();
    recData.updatedAt = new Date().toISOString();
    config.recorrentes.push(recData);
    this.salvarConfig(config, { skipPush: syncV2 });
    if (syncV2 && typeof SYNC_ENGINE !== 'undefined') {
      SYNC_ENGINE.enqueueRecurring('upsert', recData);
    } else {
      this._pushRecorrenteApi(recData);
    }
    return recData;
  },

  /**
   * Snapshot cru do armazenamento. NÃO é o formato de backup — não carrega
   * anexos e o importador (INIT_CONFIG.importarDados) não lê este shape.
   * Para backup do usuário use INIT_CONFIG.exportarDados.
   */
  exportarDados: function() {
    return {
      transacoes: this.getTransacoes(),
      contas: this.getContas(),
      config: this.getConfig(),
      dataExportacao: new Date().toISOString()
    };
  },

  // Sync entre abas: atualiza quando outra aba muda o localStorage.
  // Debounce de 300ms evita múltiplos re-inits em rajadas de escrita.
  setupStorageSync: function() {
    if (this._storageSyncBound) return;
    this._storageSyncBound = true;
    var self = this;
    window.addEventListener('storage', function(e) {
      if (!e.key || self._ignorarStorageSync) return;

      if (e.key === self.TX_SYNC_PING_KEY) {
        clearTimeout(self._storageDebounceTimer);
        self._storageDebounceTimer = setTimeout(function() {
          self._hidratarTransacoesIdb().then(function(teveConflito) {
            if (!teveConflito) self._mostrarBannerMultiAba();
          });
        }, 300);
        return;
      }

      if (e.key !== CONFIG.STORAGE_TRANSACOES
        && e.key !== CONFIG.STORAGE_CONFIG
        && e.key !== CONFIG.STORAGE_CONTAS) return;

      clearTimeout(self._storageDebounceTimer);
      self._storageDebounceTimer = setTimeout(function() {
        if (e.key === CONFIG.STORAGE_TRANSACOES && e.newValue) {
          self._mesclarTransacoesRemotas(e.newValue);
        }
        if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
          APP_STORE.dispatch(ACTIONS.SYNC_CONCLUIR);
        } else {
          if (typeof TRANSACOES !== 'undefined') TRANSACOES.init();
          if (typeof ORCAMENTO !== 'undefined') ORCAMENTO.init();
          if (typeof CONTAS !== 'undefined') CONTAS.init();
          if (typeof RENDER !== 'undefined') RENDER.init();
        }
        self._mostrarBannerMultiAba();
      }, 300);
    });
  },

  salvarAprendizado: function(hist) {
    this._storageSetRaw(CONFIG.STORAGE_APRENDIZADO, JSON.stringify(hist));
  },

  obterAprendizado: function() {
    try {
      var data = this._storageGetRaw(CONFIG.STORAGE_APRENDIZADO);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  },

  getContas: function() {
    return this.getContasRaw().filter(function(c) {
      return c && c.ativo !== false && !c.deletedAt;
    });
  },

  getContasRaw: function() {
    try {
      var data = this._storageGetRaw(CONFIG.STORAGE_CONTAS);
      if (!data) return [];
      var parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      this._registrarFalhaLeitura(CONFIG.STORAGE_CONTAS, e);
      return [];
    }
  },

  upsertConta: function(conta) {
    var syncV2 = this._syncV2Ativo();
    if (!conta.id) {
      conta.id = (syncV2 && UTILS.gerarUuid) ? UTILS.gerarUuid() : UTILS.gerarId();
    }
    conta.updatedAt = new Date().toISOString();
    conta.ativo = conta.ativo !== false;
    var lista = this.getContasRaw();
    var idx = -1;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === conta.id) { idx = i; break; }
    }
    if (idx >= 0) lista[idx] = Object.assign({}, lista[idx], conta);
    else lista.push(conta);
    this._storageSetRaw(CONFIG.STORAGE_CONTAS, JSON.stringify(lista));
    if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
      APP_STORE.dispatch(ACTIONS.CONTAS_SALVAR, lista);
    }
    if (syncV2 && typeof SYNC_ENGINE !== 'undefined') {
      SYNC_ENGINE.enqueueAccount('upsert', conta);
    } else if (this._apiAtiva()) {
      this._pushContasApi(conta);
    }
    return conta;
  },

  deletarConta: function(id) {
    var syncV2 = this._syncV2Ativo();
    var lista = this.getContasRaw();
    var alvo = null;
    for (var i = 0; i < lista.length; i++) {
      if (lista[i].id === id) { alvo = lista[i]; break; }
    }
    if (!alvo) return false;
    var tomb = Object.assign({}, alvo, {
      ativo: false,
      updatedAt: new Date().toISOString(),
    });
    var restante = lista.filter(function(c) { return c.id !== id; });
    this._storageSetRaw(CONFIG.STORAGE_CONTAS, JSON.stringify(restante));
    if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
      APP_STORE.dispatch(ACTIONS.CONTAS_SALVAR, restante);
    }
    if (syncV2 && typeof SYNC_ENGINE !== 'undefined') {
      SYNC_ENGINE.enqueueAccount('delete', tomb);
    } else if (this._apiAtiva()) {
      this._apiFetch('/api/v1/accounts/' + encodeURIComponent(id), { method: 'DELETE' }).catch(function() {});
    }
    return true;
  },

  upsertOrcamento: function(categoria, limite, periodo) {
    var syncV2 = this._syncV2Ativo();
    periodo = periodo || 'mensal';
    var config = this.getConfig();
    if (!config.orcamentos) config.orcamentos = {};
    var entry = config.orcamentos[categoria] || {};
    if (!entry.id) {
      entry.id = (syncV2 && UTILS.gerarUuid) ? UTILS.gerarUuid() : UTILS.gerarId();
    }
    entry.limite = Number(limite);
    entry.definidoEm = entry.definidoEm || new Date().toISOString();
    entry.updatedAt = new Date().toISOString();
    entry.periodo = periodo;
    config.orcamentos[categoria] = entry;
    this.salvarConfig(config, { skipPush: syncV2 });

    var record = {
      id: entry.id,
      categoria: categoria,
      limite: entry.limite,
      periodo: periodo,
      definidoEm: entry.definidoEm,
      updatedAt: entry.updatedAt,
    };
    if (syncV2 && typeof SYNC_ENGINE !== 'undefined') {
      SYNC_ENGINE.enqueueBudget('upsert', record);
    } else if (this._apiAtiva()) {
      this._pushOrcamentoApi(categoria, limite);
    }
    return entry;
  },

  deletarOrcamento: function(categoria) {
    var syncV2 = this._syncV2Ativo();
    var config = this.getConfig();
    if (!config.orcamentos || !config.orcamentos[categoria]) return false;
    var entry = config.orcamentos[categoria];
    var tomb = {
      id: entry.id || ((syncV2 && UTILS.gerarUuid) ? UTILS.gerarUuid() : UTILS.gerarId()),
      categoria: categoria,
      limite: entry.limite,
      periodo: entry.periodo || 'mensal',
      definidoEm: entry.definidoEm,
      updatedAt: new Date().toISOString(),
      ativo: false,
    };
    delete config.orcamentos[categoria];
    this.salvarConfig(config, { skipPush: syncV2 });
    if (syncV2 && typeof SYNC_ENGINE !== 'undefined') {
      SYNC_ENGINE.enqueueBudget('delete', tomb);
    }
    return true;
  },

  salvarContas: function(contas) {
    var lista = Array.isArray(contas) ? contas : [];
    this._storageSetRaw(CONFIG.STORAGE_CONTAS, JSON.stringify(lista));
    if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
      APP_STORE.dispatch(ACTIONS.CONTAS_SALVAR, lista);
    }
    if (lista.length > 0 && !this._syncV2Ativo()) {
      this._pushContasApi(lista[lista.length - 1]);
    }
    return lista;
  }
};

// Cliente da API Express (ES Module, publicado por js/esm/ponte.js, que roda
// antes deste script). Sem ele, login e sync legados quebrariam em silêncio:
// melhor falhar alto aqui.
Object.assign(DADOS, DADOS_EXPRESS);

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DADOS;
}
