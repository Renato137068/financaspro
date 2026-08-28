/**
 * @file dados.js — Data persistence layer
 * @module DADOS
 * Tier 0. Depende de CONFIG apenas.
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
  _syncPending: false,
  _storageDebounceTimer: null,
  /** Versão atual do schema. Incrementar quando estrutura quebrar compat. */
  SCHEMA_VERSION: 2,

  _apiBaseUrl: function() {
    if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
      return '';
    }
    if (typeof window !== 'undefined' && window.location && window.location.search.indexOf('offline=1') !== -1) {
      return '';
    }
    // App nativo (Capacitor) SEM backend configurado => modo local (piloto).
    // Evita cair em window.location.origin (https://localhost do webview) e
    // quebrar login/sync. Se CONFIG.API_BASE_URL for definido, este guard é ignorado.
    if (typeof window !== 'undefined' && window.Capacitor &&
        (typeof window.Capacitor.isNativePlatform !== 'function' || window.Capacitor.isNativePlatform()) &&
        !(CONFIG.API_BASE_URL || '').trim()) {
      return '';
    }
    var base = (CONFIG.API_BASE_URL || '').trim();
    if (!base) {
      if (typeof window !== 'undefined' && window.location && /^https?:$/i.test(window.location.protocol)) {
        base = window.location.origin;
      } else {
        base = (CONFIG.API_FALLBACK_URL || '').trim();
      }
    }
    return base ? base.replace(/\/$/, '') : '';
  },

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

  /** Idem para o desvio de relógio: uma vez por sessão. */
  _avisouRelogio: false,

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

    return Promise.all(reads).then(function(items) {
      // Aborta se algo não decifrou (evita gravar cifrado como se fosse puro).
      for (var i = 0; i < items.length; i++) {
        if (items[i].plain != null && LOCAL_CRYPTO.isEncrypted(items[i].plain)) {
          throw new Error('Falha ao decifrar dados existentes — migração abortada');
        }
      }
      // 2. Alterna o flag e invalida o cache em memória.
      LOCAL_CRYPTO.setEnabled(enable);
      self._plainCache = {};

      // 3. Regrava no novo formato (encrypt só funciona com o flag já ligado).
      var writes = items.map(function(it) {
        if (it.plain == null) return Promise.resolve();
        if (enable) {
          return LOCAL_CRYPTO.encrypt(it.plain).then(function(enc) { localStorage.setItem(it.key, enc); });
        }
        localStorage.setItem(it.key, it.plain);
        return Promise.resolve();
      });
      return Promise.all(writes);
    }).then(function() {
      return LOCAL_CRYPTO.isEnabled();
    });
  },

  _storageRemoveRaw: function(key) {
    delete this._plainCache[key];
    localStorage.removeItem(key);
  },

  _apiAtiva: function() {
    return !!this._apiBaseUrl();
  },

  _syncV2Ativo: function() {
    if (!this._apiAtiva()) return false;
    if (typeof SYNC_ENGINE === 'undefined') return false;
    var cfg = this.getConfig();
    return cfg.syncV2Enabled !== false;
  },

  /**
   * Desvio tolerado antes de avisar o usuário.
   *
   * O dano concreto de um relógio errado é a DATA do lançamento. Alguns
   * minutos só mudam o dia se a pessoa lançar exatamente à meia-noite; horas
   * mudam com facilidade, e dias ou meses mandam o lançamento para o orçamento
   * e o relatório errados. Seis horas fica bem acima de qualquer jitter de NTP
   * e bem abaixo do ponto em que o estrago aparece.
   */
  _LIMITE_DESVIO_MS: 6 * 60 * 60 * 1000,

  /** Último desvio medido, em ms. Positivo = relógio do aparelho adiantado. */
  desvioRelogioMs: null,

  /**
   * Compara o relógio do aparelho com o do servidor usando o cabeçalho `Date`.
   *
   * Toda data de lançamento nasce do relógio local. Um aparelho com a data
   * errada — restauro de fábrica, bateria de RTC velha, fuso alterado à mão —
   * gera um extrato inteiro deslocado, e nada no produto acusava. Fica o
   * pior tipo de erro: os números batem, a conta fecha, mas o mês está errado.
   *
   * A comparação é de epoch absoluto, então fuso horário não interfere: quem
   * está com o fuso errado e a hora certa não é incomodado.
   */
  _conferirRelogio: function(res) {
    if (this._avisouRelogio || !res || !res.headers || !res.headers.get) return;

    var cabecalho = res.headers.get('Date');
    if (!cabecalho) return;

    var doServidor = Date.parse(cabecalho);
    if (!isFinite(doServidor)) return;

    this.desvioRelogioMs = Date.now() - doServidor;
    if (Math.abs(this.desvioRelogioMs) < this._LIMITE_DESVIO_MS) return;

    this._avisouRelogio = true;
    var horas = Math.round(Math.abs(this.desvioRelogioMs) / 3600000);
    if (typeof UTILS !== 'undefined' && UTILS.mostrarToast) {
      UTILS.mostrarToast(
        'O relógio deste aparelho está ' + horas + 'h '
        + (this.desvioRelogioMs > 0 ? 'adiantado' : 'atrasado')
        + '. Corrija a data para os lançamentos ficarem no mês certo.',
        'warning',
      );
    }
  },

  _apiFetch: function(path, options, _isRetry) {
    var self = this;
    var base = this._apiBaseUrl();
    if (!base || typeof fetch !== 'function') {
      return Promise.reject(new Error('API indisponivel'));
    }
    var headers = Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {});
    // Tokens HttpOnly via cookies — credentials: 'include' envia cookies automaticamente.
    // Fallback legado: Authorization header se token ainda existir no localStorage.
    var legacyToken = localStorage.getItem(CONFIG.API_TOKEN_STORAGE);
    if (legacyToken) headers.Authorization = 'Bearer ' + legacyToken;

    return fetch(base + path, Object.assign({
      headers: headers,
      credentials: 'include',
    }, options || {})).then(function(res) {
      self._conferirRelogio(res);
      if (res.status === 401 && !_isRetry) {
        return self._refreshAccessToken().then(function(ok) {
          if (!ok) return Promise.reject(Object.assign(new Error('Sessao expirada'), { status: 401 }));
          return self._apiFetch(path, options, true);
        });
      }
      if (!res.ok) {
        return res.json().catch(function() { return {}; }).then(function(body) {
          if (res.status === 402 && typeof BILLING !== 'undefined' && BILLING.onPaymentRequired) {
            BILLING.onPaymentRequired(body);
          }
          var err = new Error(body.error || ('HTTP ' + res.status));
          err.status = res.status;
          throw err;
        });
      }
      return res.json();
    });
  },

  _refreshAccessToken: function() {
    var self = this;
    var base = this._apiBaseUrl();
    if (!base || typeof fetch !== 'function') return Promise.resolve(false);

    return fetch(base + '/api/v1/auth/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).then(function(res) {
      if (!res.ok) {
        self.encerrarSessao();
        return false;
      }
      self._limparTokensLegados();
      return true;
    }).catch(function() {
      self.encerrarSessao();
      return false;
    });
  },

  _limparTokensLegados: function() {
    localStorage.removeItem(CONFIG.API_TOKEN_STORAGE);
    localStorage.removeItem(CONFIG.API_REFRESH_TOKEN_STORAGE);
  },

  // Converte campo de transação do formato EN (API) para PT (localStorage)
  _txEnToPt: function(tx) {
    if (typeof FINANCE_CONTRACT !== 'undefined') {
      return FINANCE_CONTRACT.txEnToPt(tx);
    }
    if (!tx || typeof tx !== 'object') return tx;
    return {
      id:          tx.id,
      tipo:        tx.type,
      valor:       tx.amount != null ? Number(tx.amount) : 0,
      categoria:   tx.category || '',
      subcategoria:tx.subcategory || '',
      data:        tx.date ? tx.date.substring(0, 10) : '',
      descricao:   tx.description || '',
      banco:       tx.accountId || '',
      contaDestinoId: tx.targetAccountId || null,
      contaDestino: '',
      cartao:      '',
      notas:       tx.notes || '',
      tags:        tx.tags || [],
      recorrente:  tx.recurring || false,
      dataCriacao: tx.createdAt || tx.date || new Date().toISOString(),
      updatedAt:   tx.updatedAt || tx.createdAt || new Date().toISOString(),
      deletedAt:   tx.deletedAt || null,
      _apiId:      tx.id
    };
  },

  // Converte campo de conta do formato EN (API) para PT (localStorage)
  _contaEnToPt: function(ac) {
    if (typeof FINANCE_CONTRACT !== 'undefined') {
      return FINANCE_CONTRACT.contaEnToPt(ac);
    }
    if (!ac || typeof ac !== 'object') return ac;
    return {
      id:          ac.id,
      nome:        ac.name || '',
      tipo:        ac.type || 'checking',
      saldo:       ac.balance != null ? Number(ac.balance) : 0,
      moeda:       ac.currency || 'BRL',
      banco:       ac.institution || '',
      ativo:       ac.active !== false,
      dataCriacao: ac.createdAt || new Date().toISOString(),
      _apiId:      ac.id
    };
  },

  _mergeSnapshotLocal: function(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;

    if (this._syncV2Ativo() && typeof SYNC_ENGINE !== 'undefined') {
      SYNC_ENGINE.bootstrapFromSnapshot(snapshot);
    } else if (Array.isArray(snapshot.transactions)) {
      var txsPt = snapshot.transactions.map(this._txEnToPt.bind(this));
      var local = this.getTransacoesRaw();
      var merged = (typeof SYNC_MERGE !== 'undefined')
        ? SYNC_MERGE.mergeDelta(local, [], txsPt)
        : txsPt;
      this._storageSetTransacoes(merged);
    }

    if (Array.isArray(snapshot.accounts)) {
      var contasPt = snapshot.accounts.map(this._contaEnToPt.bind(this));
      if (typeof SYNC_MERGE !== 'undefined') {
        var localContas = this.getContas();
        var mergedContas = SYNC_MERGE.mergeDelta(localContas, [], contasPt);
        this._storageSetRaw(CONFIG.STORAGE_CONTAS, JSON.stringify(mergedContas));
      } else {
        this._storageSetRaw(CONFIG.STORAGE_CONTAS, JSON.stringify(contasPt));
      }
    }
    var cfg = this.getConfig();
    if (snapshot.config && typeof snapshot.config === 'object') {
      cfg = Object.assign(cfg, snapshot.config);
    }
    if (Array.isArray(snapshot.recurringTransactions)) {
      var mapRec = (typeof FINANCE_CONTRACT !== 'undefined')
        ? function(r) { return FINANCE_CONTRACT.recorrenteEnToPt(r); }
        : function(r) { return r; };
      var recPt = snapshot.recurringTransactions.map(mapRec);
      if (typeof SYNC_MERGE !== 'undefined') {
        var localRec = Array.isArray(cfg.recorrentes) ? cfg.recorrentes : [];
        cfg.recorrentes = SYNC_MERGE.mergeDelta(localRec, [], recPt);
      } else {
        cfg.recorrentes = recPt;
      }
    }
    if (Array.isArray(snapshot.budgets)) {
      var mapBud = (typeof FINANCE_CONTRACT !== 'undefined')
        ? function(b) { return FINANCE_CONTRACT.budgetEnToPt(b); }
        : function(b) { return b; };
      var budPt = snapshot.budgets.map(mapBud);
      if (typeof SYNC_MERGE !== 'undefined' && typeof SYNC_ENGINE !== 'undefined') {
        var localOrc = SYNC_ENGINE._orcamentosToArray(cfg.orcamentos || {});
        var mergedOrc = SYNC_MERGE.mergeDelta(localOrc, [], budPt);
        cfg.orcamentos = SYNC_ENGINE._arrayToOrcamentos(mergedOrc);
      } else {
        var orc = {};
        budPt.forEach(function(b) {
          if (b && b.categoria) {
            orc[b.categoria] = { limite: b.limite, definidoEm: b.definidoEm, id: b.id };
          }
        });
        cfg.orcamentos = orc;
      }
    }
    this._storageSetRaw(CONFIG.STORAGE_CONFIG, JSON.stringify(cfg));

    if (typeof APP_STORE !== 'undefined') APP_STORE.hydrateFromDados();
  },

  sincronizarComApi: function() {
    var self = this;
    if (!this._apiAtiva() || this._syncPending) return Promise.resolve(false);
    this._syncPending = true;

    if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
      APP_STORE.dispatch(ACTIONS.SYNC_INICIAR);
    }

    if (this._syncV2Ativo() && typeof SYNC_ENGINE !== 'undefined') {
      var fetchFn = this._apiFetch.bind(this);
      var chain = SYNC_ENGINE.getCursor()
        ? SYNC_ENGINE.syncCycle(fetchFn)
        : self._apiFetch('/api/v1/state').then(function(snapshot) {
            self._mergeSnapshotLocal(snapshot);
            return SYNC_ENGINE.pullAll(fetchFn);
          }).then(function() {
            return SYNC_ENGINE.flush(fetchFn);
          });

      return chain.then(function() {
        self.aplicarJanelaLocal();
        if (typeof BILLING !== 'undefined' && BILLING.sync) {
          BILLING.sync().catch(function() {});
        }
        if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
          APP_STORE.dispatch(ACTIONS.SYNC_CONCLUIR);
        }
        return true;
      }).catch(function(err) {
        console.warn('Sync v2 falhou, dados locais preservados:', err.message);
        if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
          APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, { erro: err.message });
        }
        return false;
      }).finally(function() {
        self._syncPending = false;
      });
    }

    return this._apiFetch('/api/v1/state').then(function(snapshot) {
      self._mergeSnapshotLocal(snapshot);

      if (typeof BILLING !== 'undefined' && BILLING.sync) {
        BILLING.sync().catch(function() {});
      }

      if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
        // Dispatch notifica subscribers via contadores de versão;
        // cada módulo relê seus dados de DADOS quando recebe o sinal.
        APP_STORE.dispatch(ACTIONS.SYNC_CONCLUIR);
      } else {
        // Fallback legado: re-init direto dos módulos
        if (typeof TRANSACOES !== 'undefined') TRANSACOES.init();
        if (typeof ORCAMENTO !== 'undefined') ORCAMENTO.init();
        if (typeof CONTAS !== 'undefined') CONTAS.init();
        if (typeof RENDER !== 'undefined') RENDER.init();
      }
      return true;
    }).catch(function(err) {
      console.warn('Sincronizacao com API falhou, mantendo modo local:', err.message);
      if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
        APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, { erro: err.message });
      }
      return false;
    }).finally(function() {
      self._syncPending = false;
    });
  },

  // Converte transação PT (localStorage) para EN (API)
  _txPtToEn: function(tx) {
    if (typeof FINANCE_CONTRACT !== 'undefined') {
      return FINANCE_CONTRACT.txPtToEn(tx);
    }
    if (!tx || typeof tx !== 'object') return tx;
    var data = tx.data || '';
    // Garante ISO 8601 com hora — backend valida datetime
    var isoDate = data.length === 10 ? data + 'T00:00:00.000Z' : data;
    return {
      type:        tx.tipo,
      amount:      typeof tx.valor === 'number' ? tx.valor : parseFloat(String(tx.valor).replace(',', '.')) || 0,
      description: tx.descricao || 'Sem descrição',
      category:    tx.categoria || 'outro',
      subcategory: tx.subcategoria || undefined,
      date:        isoDate,
      accountId:   tx.banco && tx.banco.length === 36 ? tx.banco : undefined,
      tags:        Array.isArray(tx.tags) ? tx.tags : [],
      notes:       tx.notas || undefined,
      recurring:   !!tx.recorrente
    };
  },

  _pushTransacaoApi: function(transacao, method) {
    if (!this._apiAtiva()) return Promise.resolve(transacao);
    var payload = this._txPtToEn(transacao);
    var url = method === 'PATCH' ? '/api/v1/transactions/' + encodeURIComponent(transacao.id)
      : '/api/v1/transactions';
    return this._apiFetch(url, {
      method: method,
      body: JSON.stringify(payload)
    }).then(function(resp) {
      return resp && resp.data ? resp.data : transacao;
    }).catch(function(err) {
      if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
        APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, { erro: err.message || 'push-tx' });
      }
      return Promise.reject(err);
    });
  },

  _deleteTransacaoApi: function(id) {
    if (!this._apiAtiva()) return Promise.resolve(true);
    return this._apiFetch('/api/v1/transactions/' + encodeURIComponent(id), {
      method: 'DELETE'
    }).then(function() { return true; }).catch(function(err) {
      if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
        APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, { erro: err.message || 'delete-tx' });
      }
      return Promise.reject(err);
    });
  },

  _pushContasApi: function(conta) {
    if (!this._apiAtiva()) return Promise.resolve(conta);
    var payload = (typeof FINANCE_CONTRACT !== 'undefined')
      ? FINANCE_CONTRACT.contaPtToEn(conta)
      : conta;
    return this._apiFetch('/api/v1/accounts', {
      method: 'POST',
      body: JSON.stringify(payload)
    }).then(function(resp) {
      return resp && resp.data ? resp.data : conta;
    }).catch(function(err) {
      if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
        APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, { erro: err.message || 'push-conta' });
      }
      return Promise.reject(err);
    });
  },

  _pushOrcamentoApi: function(categoria, limite) {
    if (!this._apiAtiva()) return Promise.resolve({ categoria: categoria, limite: limite });
    return this._apiFetch('/api/v1/budgets', {
      method: 'POST',
      body: JSON.stringify({ category: categoria, limit: Number(limite), period: 'monthly' })
    }).catch(function() {
      return { categoria: categoria, limite: limite };
    });
  },

  _pushConfigApi: function(config) {
    if (!this._apiAtiva()) return Promise.resolve(config);
    // Envia apenas campos de preferência, sem dados sensíveis de PIN
    var payload = Object.assign({}, config);
    delete payload.pinHash; delete payload.pinSalt; delete payload.pinAlgoritmo;
    return this._apiFetch('/api/v1/users/me/config', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }).then(function(resp) {
      return resp && resp.data ? resp.data : config;
    }).catch(function() {
      return config;
    });
  },

  _pushRecorrenteApi: function(recData) {
    if (!this._apiAtiva()) return Promise.resolve(recData);
    var payload = (typeof FINANCE_CONTRACT !== 'undefined')
      ? FINANCE_CONTRACT.recorrentePtToEn(recData)
      : recData;
    return this._apiFetch('/api/v1/recorrentes', {
      method: 'POST',
      body: JSON.stringify(payload)
    }).then(function(resp) {
      return resp && resp.data ? resp.data : recData;
    }).catch(function(err) {
      if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
        APP_STORE.dispatch(ACTIONS.SYNC_FALHAR, { erro: err.message || 'push-recorrente' });
      }
      return Promise.reject(err);
    });
  },

  registrarSessao: function(accessToken, user, refreshToken) {
    // Tokens em cookies HttpOnly — nunca persistir no localStorage.
    this._limparTokensLegados();
    if (accessToken || refreshToken) {
      console.warn('[DADOS] Tokens recebidos no JS foram ignorados; use cookies HttpOnly.');
    }
    if (user) localStorage.setItem(CONFIG.API_USER_STORAGE, JSON.stringify(user));
    if (typeof APP_STORE !== 'undefined') {
      APP_STORE.set('dados.sessao', this.getSessao(), { persist: false });
    }
  },

  encerrarSessao: function() {
    if (this._apiAtiva()) {
      var base = this._apiBaseUrl();
      fetch(base + '/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      }).catch(function() {});
    }
    this._limparTokensLegados();
    localStorage.removeItem(CONFIG.API_USER_STORAGE);
    if (typeof BILLING !== 'undefined' && BILLING.invalidateCache) BILLING.invalidateCache();
    if (typeof APP_STORE !== 'undefined') {
      APP_STORE.set('dados.sessao', { user: null }, { persist: false });
    }
  },

  getSessao: function() {
    try {
      var user = localStorage.getItem(CONFIG.API_USER_STORAGE);
      return {
        token: null,
        user: user ? JSON.parse(user) : null,
      };
    } catch (e) {
      return { token: null, user: null };
    }
  },

  validarSessaoApi: function() {
    var self = this;
    if (!this._apiAtiva()) return Promise.resolve(!!this.getSessao().user);
    return fetch(this._apiBaseUrl() + '/api/v1/auth/me', {
      method: 'GET',
      credentials: 'include',
    }).then(function(res) {
      if (!res.ok) {
        self.encerrarSessao();
        return false;
      }
      return res.json().then(function(body) {
        if (body && body.data) {
          self.registrarSessao(null, body.data, null);
          return true;
        }
        return false;
      });
    }).catch(function() {
      return false;
    });
  },

  loginApi: function(email, password) {
    var self = this;
    return this._apiFetch('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email, password: password })
    }).then(function(resp) {
      var data = resp && resp.data ? resp.data : null;
      if (data && data.user && !data.requiresTotp) {
        self.registrarSessao(null, data.user, null);
      }
      return data;
    });
  },

  verifyTotpLoginApi: function(pendingToken, code) {
    var self = this;
    return this._apiFetch('/api/v1/auth/totp/verify', {
      method: 'POST',
      body: JSON.stringify({ pendingToken: pendingToken, code: code }),
    }).then(function(resp) {
      var data = resp && resp.data ? resp.data : null;
      if (data && data.user) {
        self.registrarSessao(null, data.user, null);
      }
      return data;
    });
  },

  totpApi: function(path, body) {
    return this._apiFetch('/api/v1/auth/totp/' + path, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }).then(function(resp) { return resp && resp.data ? resp.data : resp; });
  },

  totpStatusApi: function() {
    return this._apiFetch('/api/v1/auth/totp/status', { method: 'GET' })
      .then(function(resp) { return resp && resp.data ? resp.data : null; });
  },

  openFinanceListApi: function() {
    return this._apiFetch('/api/v1/open-finance/connections', { method: 'GET' })
      .then(function(resp) { return resp && resp.data ? resp.data : []; });
  },

  openFinanceConnectApi: function(bankName) {
    return this._apiFetch('/api/v1/open-finance/connections', {
      method: 'POST',
      body: JSON.stringify({ bankName: bankName || 'Banco Demo', provider: 'sandbox' }),
    }).then(function(resp) { return resp && resp.data ? resp.data : null; });
  },

  openFinanceDisconnectApi: function(connectionId) {
    return this._apiFetch('/api/v1/open-finance/connections/' + encodeURIComponent(connectionId), {
      method: 'DELETE',
    });
  },

  openFinanceSyncApi: function(connectionId) {
    return this._apiFetch('/api/v1/open-finance/connections/' + encodeURIComponent(connectionId) + '/sync', {
      method: 'POST',
    }).then(function(resp) { return resp && resp.data ? resp.data : null; });
  },

  openFinanceProvidersApi: function() {
    return this._apiFetch('/api/v1/open-finance/providers', { method: 'GET' })
      .then(function(resp) { return resp && resp.data ? resp.data : { sandbox: true, belvo: false }; });
  },

  openFinanceBelvoWidgetTokenApi: function() {
    return this._apiFetch('/api/v1/open-finance/belvo/widget-token', { method: 'POST' })
      .then(function(resp) { return resp && resp.data ? resp.data : null; });
  },

  openFinanceBelvoCompleteApi: function(linkId, bankName) {
    return this._apiFetch('/api/v1/open-finance/belvo/complete', {
      method: 'POST',
      body: JSON.stringify({ linkId: linkId, bankName: bankName || undefined }),
    }).then(function(resp) { return resp && resp.data ? resp.data : null; });
  },

  registrarApi: function(nome, email, password) {
    return this._apiFetch('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name: nome, email: email, password: password })
    });
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
      self._mostrarDicaMultiAba();
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
    this._ignorarStorageSync = true;
    if (this._transacoesBackend === 'idb') {
      this._transacoesCache = lista;
      var json = JSON.stringify(lista);
      var self = this;
      this._idbWriteChain = this._idbWriteChain.then(function() {
        return IDB_KV.set(CONFIG.STORAGE_TRANSACOES, json);
      });
    } else {
      localStorage.setItem(CONFIG.STORAGE_TRANSACOES, JSON.stringify(lista));
    }
    var self = this;
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
      return IDB_KV.set(CONFIG.STORAGE_TRANSACOES, json);
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
        return IDB_KV.get(CONFIG.STORAGE_TRANSACOES).then(function(data) {
          try {
            self._transacoesCache = data ? self._parseTransacoesJson(data) : [];
          } catch (e) {
            self._transacoesCache = [];
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
    return IDB_KV.get(CONFIG.STORAGE_TRANSACOES).then(function(data) {
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
    var json = JSON.stringify(transacoes);
    if (this._transacoesBackend === 'idb' && typeof IDB_KV !== 'undefined') {
      this._transacoesCache = transacoes;
      var self = this;
      this._idbWriteChain = this._idbWriteChain.then(function() {
        return IDB_KV.set(CONFIG.STORAGE_TRANSACOES, json);
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
      var self = this;
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
      this._pushTransacaoApi(transacao, index >= 0 ? 'PATCH' : 'POST').catch(function() {});
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
        this._deleteTransacaoApi(id).catch(function() {});
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DADOS;
}
