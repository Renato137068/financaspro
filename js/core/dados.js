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
    var base = (CONFIG.API_BASE_URL || '').trim();
    if (!base) {
      base = (CONFIG.API_FALLBACK_URL || '').trim();
    }
    if (!base && typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
      base = 'http://localhost:4000';
    }
    return base ? base.replace(/\/$/, '') : '';
  },

  _apiAtiva: function() {
    return !!this._apiBaseUrl();
  },

  _apiFetch: function(path, options) {
    var base = this._apiBaseUrl();
    if (!base || typeof fetch !== 'function') {
      return Promise.reject(new Error('API indisponivel'));
    }
    var token = localStorage.getItem(CONFIG.API_TOKEN_STORAGE);
    var headers = Object.assign({ 'Content-Type': 'application/json' }, (options && options.headers) || {});
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(base + path, Object.assign({
      headers: headers
    }, options || {})).then(function(res) {
      if (!res.ok) {
        return res.json().catch(function() { return {}; }).then(function(body) {
          var err = new Error(body.error || ('HTTP ' + res.status));
          err.status = res.status;
          throw err;
        });
      }
      return res.json();
    });
  },

  _mergeSnapshotLocal: function(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    if (Array.isArray(snapshot.transactions)) {
      localStorage.setItem(CONFIG.STORAGE_TRANSACOES, JSON.stringify(snapshot.transactions));
    }
    if (Array.isArray(snapshot.accounts)) {
      localStorage.setItem(CONFIG.STORAGE_CONTAS, JSON.stringify(snapshot.accounts));
    }
    if (snapshot.config && typeof snapshot.config === 'object') {
      localStorage.setItem(CONFIG.STORAGE_CONFIG, JSON.stringify(snapshot.config));
    }
    if (Array.isArray(snapshot.recurringTransactions)) {
      var cfg = this.getConfig();
      cfg.recorrentes = snapshot.recurringTransactions;
      localStorage.setItem(CONFIG.STORAGE_CONFIG, JSON.stringify(cfg));
    }
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

  _pushTransacaoApi: function(transacao, method) {
    if (!this._apiAtiva()) return Promise.resolve(transacao);
    var url = method === 'PATCH' ? '/api/v1/transactions/' + encodeURIComponent(transacao.id)
      : '/api/v1/transactions';
    return this._apiFetch(url, {
      method: method,
      body: JSON.stringify(transacao)
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
      body: JSON.stringify({ categoria: categoria, limite: limite })
    }).catch(function() {
      return { categoria: categoria, limite: limite };
    });
  },

  _pushConfigApi: function(config) {
    if (!this._apiAtiva()) return Promise.resolve(config);
    return this._apiFetch('/api/v1/config', {
      method: 'PUT',
      body: JSON.stringify(config)
    }).then(function(resp) {
      return resp && resp.data ? resp.data : config;
    }).catch(function() {
      return config;
    });
  },

  _pushRecorrenteApi: function(recData) {
    if (!this._apiAtiva()) return Promise.resolve(recData);
    return this._apiFetch('/api/v1/recorrentes', {
      method: 'POST',
      body: JSON.stringify(recData)
    }).then(function(resp) {
      return resp && resp.data ? resp.data : recData;
    }).catch(function() {
      return recData;
    });
  },

  registrarSessao: function(token, user) {
    if (token) localStorage.setItem(CONFIG.API_TOKEN_STORAGE, token);
    if (user) localStorage.setItem(CONFIG.API_USER_STORAGE, JSON.stringify(user));
    // Sessão ainda vive no store (é pequena e volátil — não duplica dados)
    if (typeof APP_STORE !== 'undefined') {
      APP_STORE.set('dados.sessao', this.getSessao(), { persist: false });
    }
  },

  encerrarSessao: function() {
    localStorage.removeItem(CONFIG.API_TOKEN_STORAGE);
    localStorage.removeItem(CONFIG.API_USER_STORAGE);
    if (typeof APP_STORE !== 'undefined') {
      APP_STORE.set('dados.sessao', { token: null, user: null }, { persist: false });
    }
  },

  getSessao: function() {
    try {
      var token = localStorage.getItem(CONFIG.API_TOKEN_STORAGE);
      var user = localStorage.getItem(CONFIG.API_USER_STORAGE);
      return {
        token: token || null,
        user: user ? JSON.parse(user) : null
      };
    } catch (e) {
      return { token: null, user: null };
    }
  },

  loginApi: function(email, password) {
    var self = this;
    return this._apiFetch('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: email, password: password })
    }).then(function(resp) {
      var data = resp && resp.data ? resp.data : null;
      if (data && data.token) self.registrarSessao(data.token, data.user);
      return data;
    });
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
    if (!localStorage.getItem(CONFIG.STORAGE_TRANSACOES)) {
      localStorage.setItem(CONFIG.STORAGE_TRANSACOES, JSON.stringify([]));
    }
    if (!localStorage.getItem(CONFIG.STORAGE_CONFIG)) {
      var defaults = Object.assign({}, CONFIG.DEFAULT_CONFIG, { _schemaVer: this.SCHEMA_VERSION });
      localStorage.setItem(CONFIG.STORAGE_CONFIG, JSON.stringify(defaults));
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
      var data = localStorage.getItem(CONFIG.STORAGE_TRANSACOES);
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
    localStorage.setItem(CONFIG.STORAGE_TRANSACOES, JSON.stringify(transacoes));
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
      localStorage.setItem(CONFIG.STORAGE_TRANSACOES, JSON.stringify(transacoes));
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
      var data = localStorage.getItem(CONFIG.STORAGE_CONFIG);
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
    localStorage.setItem(CONFIG.STORAGE_CONFIG, JSON.stringify(merged));
    if (typeof APP_STORE !== 'undefined' && typeof ACTIONS !== 'undefined') {
      APP_STORE.dispatch(ACTIONS.CONFIG_SALVAR, merged);
    }
    this._pushConfigApi(merged);
    return merged;
  },

  limparTodos: function() {
    localStorage.removeItem(CONFIG.STORAGE_TRANSACOES);
    localStorage.removeItem(CONFIG.STORAGE_CONFIG);
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
    localStorage.setItem(CONFIG.STORAGE_APRENDIZADO, JSON.stringify(hist));
  },

  obterAprendizado: function() {
    try {
      var data = localStorage.getItem(CONFIG.STORAGE_APRENDIZADO);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      return {};
    }
  },

  getContas: function() {
    try {
      var data = localStorage.getItem(CONFIG.STORAGE_CONTAS);
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
    localStorage.setItem(CONFIG.STORAGE_CONTAS, JSON.stringify(lista));
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
