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

  _storageGetRaw: function(key) {
    if (typeof LOCAL_CRYPTO !== 'undefined' && LOCAL_CRYPTO.isEnabled()) {
      if (Object.prototype.hasOwnProperty.call(this._plainCache, key)) {
        return this._plainCache[key];
      }
      var raw = localStorage.getItem(key);
      if (!raw) return null;
      if (raw.indexOf('enc1:') === 0) {
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

  _storageSetRaw: function(key, value) {
    if (typeof LOCAL_CRYPTO !== 'undefined' && LOCAL_CRYPTO.isEnabled()) {
      this._plainCache[key] = value;
      LOCAL_CRYPTO.wrapStorageValue(key, value).then(function(stored) {
        try {
          localStorage.setItem(key, stored);
        } catch (e) {
          console.error('Erro ao persistir storage criptografado:', e);
        }
      });
      return;
    }
    localStorage.setItem(key, value);
  },

  _storageRemoveRaw: function(key) {
    delete this._plainCache[key];
    localStorage.removeItem(key);
  },

  _apiAtiva: function() {
    return !!this._apiBaseUrl();
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
      cartao:      '',
      notas:       tx.notes || '',
      tags:        tx.tags || [],
      recorrente:  tx.recurring || false,
      dataCriacao: tx.createdAt || tx.date || new Date().toISOString(),
      _apiId:      tx.id
    };
  },

  // Converte campo de conta do formato EN (API) para PT (localStorage)
  _contaEnToPt: function(ac) {
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

    if (Array.isArray(snapshot.transactions)) {
      var txsPt = snapshot.transactions.map(this._txEnToPt.bind(this));
      this._storageSetRaw(CONFIG.STORAGE_TRANSACOES, JSON.stringify(txsPt));
    }
    if (Array.isArray(snapshot.accounts)) {
      var contasPt = snapshot.accounts.map(this._contaEnToPt.bind(this));
      this._storageSetRaw(CONFIG.STORAGE_CONTAS, JSON.stringify(contasPt));
    }
    var cfg = this.getConfig();
    if (snapshot.config && typeof snapshot.config === 'object') {
      cfg = Object.assign(cfg, snapshot.config);
    }
    if (Array.isArray(snapshot.recurringTransactions)) {
      cfg.recorrentes = snapshot.recurringTransactions;
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
    }).catch(function() {
      return transacao;
    });
  },

  _deleteTransacaoApi: function(id) {
    if (!this._apiAtiva()) return Promise.resolve(true);
    return this._apiFetch('/api/v1/transactions/' + encodeURIComponent(id), {
      method: 'DELETE'
    }).then(function() { return true; }).catch(function() { return true; });
  },

  _pushContasApi: function(conta) {
    if (!this._apiAtiva()) return Promise.resolve(conta);
    return this._apiFetch('/api/v1/accounts', {
      method: 'POST',
      body: JSON.stringify(conta)
    }).then(function(resp) {
      return resp && resp.data ? resp.data : conta;
    }).catch(function() {
      return conta;
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
    var isoStart = recData.inicio ? recData.inicio + 'T00:00:00.000Z' : new Date().toISOString();
    var isoNext  = recData.proxima ? recData.proxima + 'T00:00:00.000Z' : isoStart;
    var payload = {
      type:        recData.tipo,
      amount:      Number(recData.valor) || 0,
      description: recData.descricao || 'Recorrente',
      category:    recData.categoria || 'outro',
      frequency:   recData.frequencia || 'monthly',
      startDate:   isoStart,
      nextDue:     isoNext
    };
    return this._apiFetch('/api/v1/recorrentes', {
      method: 'POST',
      body: JSON.stringify(payload)
    }).then(function(resp) {
      return resp && resp.data ? resp.data : recData;
    }).catch(function() {
      return recData;
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
    if (this._initialized) return;
    this._initialized = true;
    this._limparTokensLegados();
    if (!this._storageGetRaw(CONFIG.STORAGE_TRANSACOES)) {
      this._storageSetRaw(CONFIG.STORAGE_TRANSACOES, JSON.stringify([]));
    }
    if (!this._storageGetRaw(CONFIG.STORAGE_CONFIG)) {
      var defaults = Object.assign({}, CONFIG.DEFAULT_CONFIG, { _schemaVer: this.SCHEMA_VERSION });
      this._storageSetRaw(CONFIG.STORAGE_CONFIG, JSON.stringify(defaults));
    } else {
      this._migrarSchema();
    }
    if (typeof APP_STORE !== 'undefined') APP_STORE.hydrateFromDados();
    this.sincronizarComApi();
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
  getTransacoes: function() {
    try {
      var data = this._storageGetRaw(CONFIG.STORAGE_TRANSACOES);
      if (!data) return [];
      var parsed = JSON.parse(data);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (e) {
      console.error('Erro ao carregar transacoes:', e);
      return [];
    }
  },

  /**
   * Insere ou atualiza transação. Throw se quota cheia.
   * @param {Transacao} transacao
   * @returns {Transacao}
   * @throws {Error} se localStorage cheio
   */
  salvarTransacao: function(transacao) {
    var transacoes = this.getTransacoes();
    transacao.id = transacao.id || UTILS.gerarId();
    transacao.dataCriacao = transacao.dataCriacao || new Date().toISOString();
    var index = transacoes.findIndex(function(t) { return t.id === transacao.id; });
    if (index >= 0) {
      transacoes[index] = transacao;
    } else {
      transacoes.push(transacao);
    }
    var check = UTILS.verificarStorageDisponivel(transacoes, CONFIG.STORAGE_TRANSACOES);
    if (!check.disponivel) {
      console.error('Storage indisponível:', check.erro);
      throw new Error(check.erro);
    }
    this._storageSetRaw(CONFIG.STORAGE_TRANSACOES, JSON.stringify(transacoes));
    var actionType = (typeof ACTIONS !== 'undefined')
      ? (index >= 0 ? ACTIONS.TRANSACAO_EDITAR : ACTIONS.TRANSACAO_CRIAR)
      : null;
    if (typeof APP_STORE !== 'undefined' && actionType) {
      APP_STORE.dispatch(actionType, transacao);
    }
    this._pushTransacaoApi(transacao, index >= 0 ? 'PATCH' : 'POST');
    return transacao;
  },

  deletarTransacao: function(id) {
    var transacoes = this.getTransacoes();
    var index = transacoes.findIndex(function(t) { return t.id === id; });
    if (index >= 0) {
      transacoes.splice(index, 1);
      var check = UTILS.verificarStorageDisponivel(transacoes, CONFIG.STORAGE_TRANSACOES);
      if (!check.disponivel) {
        console.error('Storage indisponível:', check.erro);
        return false;
      }
      this._storageSetRaw(CONFIG.STORAGE_TRANSACOES, JSON.stringify(transacoes));
      if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
        APP_STORE.dispatch(ACTIONS.TRANSACAO_DELETAR, id);
      }
      this._deleteTransacaoApi(id);
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
      console.error('Erro ao carregar config:', e);
      return Object.assign({}, CONFIG.DEFAULT_CONFIG);
    }
  },

  /**
   * Merge config parcial e persiste. Não substitui — só atualiza chaves passadas.
   * @param {Partial<ConfigUser>} config
   * @returns {ConfigUser} config completo após merge
   */
  salvarConfig: function(config) {
    var atual = this.getConfig();
    var merged = Object.assign({}, atual, config);
    this._storageSetRaw(CONFIG.STORAGE_CONFIG, JSON.stringify(merged));
    if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
      APP_STORE.dispatch(ACTIONS.CONFIG_SALVAR, merged);
    }
    this._pushConfigApi(merged);
    return merged;
  },

  limparTodos: function() {
    this._storageRemoveRaw(CONFIG.STORAGE_TRANSACOES);
    this._storageRemoveRaw(CONFIG.STORAGE_CONFIG);
    this._initialized = false;
    this.init();
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
    var config = this.getConfig();
    if (!Array.isArray(config.recorrentes)) config.recorrentes = [];
    recData.id = recData.id || UTILS.gerarId();
    recData.dataCriacao = new Date().toISOString();
    config.recorrentes.push(recData);
    this.salvarConfig(config);
    this._pushRecorrenteApi(recData);
    return recData;
  },

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
    var self = this;
    window.addEventListener('storage', function(e) {
      if (e.key !== CONFIG.STORAGE_TRANSACOES && e.key !== CONFIG.STORAGE_CONFIG) return;

      clearTimeout(self._storageDebounceTimer);
      self._storageDebounceTimer = setTimeout(function() {
        if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
          APP_STORE.dispatch(ACTIONS.SYNC_CONCLUIR);
        } else {
          if (typeof TRANSACOES !== 'undefined') TRANSACOES.init();
          if (typeof ORCAMENTO !== 'undefined') ORCAMENTO.init();
          if (typeof RENDER !== 'undefined') RENDER.init();
        }
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
    try {
      var data = this._storageGetRaw(CONFIG.STORAGE_CONTAS);
      if (!data) return [];
      var parsed = JSON.parse(data);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('Erro ao carregar contas:', e);
      return [];
    }
  },

  salvarContas: function(contas) {
    var lista = Array.isArray(contas) ? contas : [];
    this._storageSetRaw(CONFIG.STORAGE_CONTAS, JSON.stringify(lista));
    if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
      APP_STORE.dispatch(ACTIONS.CONTAS_SALVAR, lista);
    }
    if (lista.length > 0) {
      this._pushContasApi(lista[lista.length - 1]);
    }
    return lista;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = DADOS;
}
