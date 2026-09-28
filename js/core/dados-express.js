/**
 * dados-express.js — cliente da API Express legada, misturado ao DADOS.
 *
 * Tudo o que fala com /api/v1: URL base, fetch autenticado por cookie
 * HttpOnly com renovação, conferência do relógio pelo cabeçalho Date, sync
 * (snapshot e v2), push de lançamentos, contas, orçamentos, config e
 * recorrentes, sessão, login, TOTP, Open Finance e cadastro.
 *
 * A API Express está congelada (ADR 0004): este arquivo só recebe correção de
 * segurança e sai junto com backend/. O app da loja usa o Supabase, e aqui
 * `_apiAtiva()` é falso no app nativo.
 *
 * Os métodos usam `this` como o DADOS: dados.js os copia com
 * `Object.assign(DADOS, DADOS_EXPRESS)`, e o estado (_syncPending,
 * desvioRelogioMs…) passa a viver no DADOS. ES Module (ADR 0005), publicado
 * por js/esm/ponte.js.
 */
import { FINANCE_CONTRACT } from './finance-contract.js';
import { SYNC_MERGE } from './sync-merge.js';
import { CONFIG } from './config.js';
import { UTILS } from './utils.js';
import { TRANSACOES } from '../transacoes.js';
import { ORCAMENTO } from '../orcamento.js';

const DADOS_EXPRESS = {
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

  _apiAtiva: function() {
    // APK/Capacitor: auth e sync só via Supabase — Express fica inerte no mobile.
    try {
      if (typeof window !== 'undefined' && window.Capacitor
          && window.Capacitor.isNativePlatform
          && window.Capacitor.isNativePlatform()) {
        return false;
      }
    } catch (e) { /* noop */ }
    return !!this._apiBaseUrl();
  },

  _syncV2Ativo: function() {
    if (!this._apiAtiva()) return false;
    if (typeof SYNC_ENGINE === 'undefined') return false;
    var cfg = this.getConfig();
    return cfg.syncV2Enabled !== false;
  },

  /** Sincronização com a API em andamento (uma por vez). */
  _syncPending: false,

  /** Aviso de desvio de relógio: uma vez por sessão. */
  _avisouRelogio: false,

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
};

export { DADOS_EXPRESS };
export default DADOS_EXPRESS;
